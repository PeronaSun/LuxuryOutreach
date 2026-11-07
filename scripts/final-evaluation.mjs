import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  finalCases,
  EVALUATION_TIME,
  CASESET_VERSION,
} from "../evaluation/final-v1/cases.mjs";
import {
  judgeMessages,
  judgePrompt,
  JUDGE_VERSION,
} from "../evaluation/final-v1/judge.mjs";
import { deterministicEvaluation } from "../evaluation/final-v1/deterministic.mjs";
import { exportEvaluation } from "../evaluation/final-v1/reporting.mjs";
import { RUBRIC_VERSION } from "../evaluation/final-v1/rubric.mjs";
import { providerConfig } from "../server/provider-config.mjs";
import { evaluateRequest, PROMPT_VERSION } from "../server/rules.mjs";
import {
  generate,
  demoCandidates,
  buildPrompt,
} from "../server/generation.mjs";
import { normalizeTask } from "../server/generation-context.mjs";
import { recoveryConfig } from "../server/recovery-policy.mjs";
import { BRAND_SOURCE_SHA256 } from "../server/brand-context.mjs";

const args = process.argv.slice(2),
  get = (key, fallback) =>
    args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const live = args.includes("--live"),
  mock = args.includes("--mock"),
  judgeSource = get("--judge-existing", null),
  plan = !live && !mock && !judgeSource;
const config = providerConfig(),
  recovery = recoveryConfig(),
  maxCalls = Number(
    get("--max-api-calls", judgeSource ? "4" : live ? "0" : mock ? "0" : "250"),
  );
if (!Number.isInteger(maxCalls) || maxCalls < 0 || maxCalls > 500)
  throw new Error("Invalid API budget");
if (live && (!args.includes("--approve-paid-run") || maxCalls < 100))
  throw new Error(
    "Full paid execution requires explicit user approval, --approve-paid-run and a reviewed --max-api-calls budget. No calls made.",
  );
if ((live || judgeSource) && (!config.key || config.demo))
  throw new Error("Live configuration required; no calls made");
if (judgeSource && maxCalls > 4 && !args.includes("--approve-paid-run"))
  throw new Error("Small offline judge sample is capped at four calls");
const mode = plan
  ? "plan"
  : judgeSource
    ? "offline-judge-sample"
    : mock
      ? "mock"
      : "live";
const directory = resolve(
  "runtime/final-evaluation",
  `${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
);
await mkdir(directory, { recursive: true });
const sha = (s) => createHash("sha256").update(s).digest("hex");
const metadata = {
  mode,
  caseSetVersion: CASESET_VERSION,
  caseSetSha256: sha(JSON.stringify(finalCases)),
  promptVersion: PROMPT_VERSION,
  brandSourceSha256: BRAND_SOURCE_SHA256,
  judgeVersion: JUDGE_VERSION,
  rubricVersion: RUBRIC_VERSION,
  model: mock ? "mock-model" : config.model,
  judgeModel: mock ? null : process.env.DEEPSEEK_JUDGE_MODEL || config.model,
  evaluationTime: EVALUATION_TIME,
  createdAt: new Date().toISOString(),
  maxApiCalls: maxCalls,
  gitCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  trackedWorktreeDirty: Boolean(
    execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" }).trim(),
  ),
  configuration: {
    ...recovery,
    judgeTemperature: 0,
    judgeOutputTokens: 2400,
    streaming: false,
  },
  sourceFingerprints: Object.fromEntries(
    await Promise.all(
      [
        "server/generation.mjs",
        "server/brand-context.mjs",
        "server/audit-policy.mjs",
        "server/rules.mjs",
        "evaluation/final-v1/cases.mjs",
        "evaluation/final-v1/rubric.mjs",
        "evaluation/final-v1/judge.mjs",
        "evaluation/final-v1/deterministic.mjs",
        "evaluation/final-v1/reporting.mjs",
        "evaluation/final-v1/human-review.mjs",
        "scripts/final-evaluation.mjs",
        "package-lock.json",
      ].map(async (file) => [file, sha(await readFile(file))]),
    ),
  ),
};
const clean = (v) => {
  const text = JSON.stringify(v, null, 2);
  return config.key ? text.replaceAll(config.key, "[REDACTED]") : text;
};
const save = (name, value) =>
  writeFile(resolve(directory, name), clean(value) + "\n", { flag: "wx" });
const planCases = finalCases.map((c) => {
  const context = evaluateRequest(c.input, { now: EVALUATION_TIME });
  return {
    ...c,
    context,
    inputStatus: context.status,
    promptSha256: sha(buildPrompt(c.input, context).instructions),
    completePromptSha256: sha(JSON.stringify(buildPrompt(c.input, context))),
  };
});
if (planCases.some((c) => c.inputStatus !== "READY"))
  throw new Error("All 50 final cases must be valid");
await save("manifest.json", {
  ...metadata,
  expectedMessages: 150,
  nominalApiCalls: {
    generation: 50,
    hardAudit: 50,
    offlineJudge: 50,
    total: 150,
  },
  maximumDefaultCalls: 250,
  maximumConfiguredCalls: finalCases.length * (recovery.maxProviderCalls + 1),
  cases: planCases,
});
console.log(
  JSON.stringify({ mode, directory, cases: 50, apiBudget: maxCalls }),
);
if (plan) {
  console.log("Plan prepared: 50 valid fictional cases; zero calls made.");
  process.exit(0);
}
let calls = 0;
const traces = [];
const actualFetch = async (url, options) => {
  if (calls >= maxCalls) throw new Error("Global paid call budget exhausted");
  calls++;
  const request = JSON.parse(options.body),
    trace = {
      index: calls,
      stage: request.text.format.name,
      requestedModel: request.model,
      startedAt: new Date().toISOString(),
    };
  traces.push(trace);
  const started = performance.now();
  try {
    const response = await fetch(url, options);
    trace.httpStatus = response.status;
    if (response.ok) {
      try {
        const data = await response.clone().json();
        trace.returnedModel = data.model;
        trace.usage = data.usage;
        trace.status = data.status;
      } catch {
        trace.envelopeParsed = false;
      }
    }
    return response;
  } finally {
    trace.durationMs = performance.now() - started;
  }
};
let records = [];
if (judgeSource) {
  let source;
  try {
    source = JSON.parse(
      await readFile(resolve(judgeSource, "records.json"), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const files = (await readdir(judgeSource))
      .filter((name) => /^F-\d+-(?:generation|judge)\.json$/.test(name))
      .sort();
    const byId = new Map();
    for (const file of files) {
      const record = JSON.parse(
        await readFile(resolve(judgeSource, file), "utf8"),
      );
      byId.set(record.id, record);
    }
    source = [...byId.values()];
  }
  if (!source.length) throw new Error("No source records found");
  if (source.length > 4 && !args.includes("--approve-paid-run"))
    throw new Error(
      "Large judge-only runs require explicit approval; no calls made",
    );
  let sourceMeta = {};
  for (const name of ["summary.json", "manifest.json"]) {
    try {
      sourceMeta = JSON.parse(
        await readFile(resolve(judgeSource, name), "utf8"),
      );
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  records = source.map((original) => {
    const definition = finalCases.find(
      (c) =>
        JSON.stringify(normalizeTask(c.input)) ===
        JSON.stringify(normalizeTask(original.input)),
    );
    if (!definition)
      throw new Error("Source input does not match final case set");
    const profile = Boolean(original.result),
      messages = profile
        ? original.result.candidates || []
        : original.messages || [];
    const sourceIsLive = profile
      ? original.result.mode === "live"
      : ["live", "live-source-profile", "live-source-evaluation"].includes(
          original.source,
        );
    if (!sourceIsLive)
      throw new Error("Cannot label mock outputs as real model evidence");
    const context =
      original.context ||
      evaluateRequest(definition.input, { now: EVALUATION_TIME });
    return {
      id: definition.id,
      input: definition.input,
      context,
      source: profile ? "live-source-profile" : "live-source-evaluation",
      generationPerformedInThisRun: false,
      executionStatus:
        messages.length === 3 ? "LIVE_SOURCE_COMPLETED" : "NOT_COMPLETED",
      sourceRun: judgeSource,
      messages,
      model: profile ? original.result.model : original.model,
      promptVersion:
        original.promptVersion ||
        sourceMeta.promptVersion ||
        "UNKNOWN_SOURCE_PROMPT",
      generationMs: profile
        ? original.timings.httpTotalMs
        : original.generationMs,
      performance: profile ? original.result.performance : original.performance,
      recovery: profile ? original.result.recovery : original.recovery,
      deterministic: messages.length
        ? deterministicEvaluation(messages, context, definition.input)
        : null,
      ...(original.error ? { error: original.error } : {}),
      ...(original.judge && !args.includes("--rejudge")
        ? { judge: original.judge }
        : {}),
    };
  });
  const requiredCalls = records.filter(
    (record) => record.messages.length === 3 && !record.judge,
  ).length;
  if (requiredCalls > maxCalls)
    throw new Error("Judge budget insufficient; no calls made");
} else {
  for (const definition of finalCases) {
    const context = evaluateRequest(definition.input, { now: EVALUATION_TIME }),
      record = {
        id: definition.id,
        input: definition.input,
        context,
        source: mock ? "mock" : "live",
        generationPerformedInThisRun: true,
        executionStatus: mock ? "MOCK_STARTED" : "LIVE_STARTED",
        messages: [],
        model: mock ? "mock-model" : config.model,
        promptVersion: PROMPT_VERSION,
      };
    const fixture = mock
      ? demoCandidates(definition.input, context).map((c) => ({
          style: c.style,
          main: c.text.split("\n\n")[1],
          cta: c.text.split("\n\n")[2],
        }))
      : null;
    const mockFetch = async (_url, options) => {
      const body = JSON.parse(options.body),
        data =
          body.text.format.name === "brand_audit"
            ? { passed: true, reasons: [], findings: [] }
            : {
                candidates: fixture.filter((c) =>
                  body.text.format.schema.properties.candidates.items.properties.style.enum.includes(
                    c.style,
                  ),
                ),
              };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "completed",
          output: [
            { content: [{ type: "output_text", text: JSON.stringify(data) }] },
          ],
        }),
      };
    };
    const started = performance.now();
    const diagnostics = [];
    try {
      const result = await generate(definition.input, context, {
        ...(mock
          ? { key: "fixture-only", model: "mock-model", provider: "deepseek" }
          : config),
        demo: false,
        fetchImpl: mock ? mockFetch : actualFetch,
        onDiagnostic: (event) => diagnostics.push(event),
      });
      record.messages = result.candidates;
      record.executionStatus = mock ? "MOCK_COMPLETED" : "LIVE_COMPLETED";
      record.recovery = result.recovery;
      record.performance = result.performance;
      record.deterministic = deterministicEvaluation(
        result.candidates,
        context,
        definition.input,
      );
    } catch (error) {
      record.executionStatus = mock ? "MOCK_FAILED" : "LIVE_FAILED";
      record.error = {
        code: error.code || "GENERATION_FAILED",
        stage: error.stage || "generation",
        ruleIds: error.ruleIds || [],
      };
      record.recovery = error.recovery;
      record.performance = {
        totalMs: performance.now() - started,
        measurements: diagnostics,
      };
    }
    record.generationMs = performance.now() - started;
    records.push(record);
    await save(definition.id + "-generation.json", record);
  }
}
// Judging is a distinct offline phase. It never delays customer-facing generation.
if (!mock)
  for (const record of records) {
    if (!record.messages.length || record.judge) continue;
    try {
      record.judgePromptSha256 = sha(
        judgePrompt(record.input, record.context, record.messages).instructions,
      );
      record.judge = await judgeMessages(
        record.input,
        record.context,
        record.messages,
        { ...config, model: metadata.judgeModel, fetchImpl: actualFetch },
      );
    } catch (error) {
      record.judgeError = {
        code: error.code || "JUDGE_FAILED",
        stage: error.stage || "judge",
      };
    }
    await save(record.id + "-judge.json", record);
  }
await save("provider-traces.json", traces);
// The source contains no credentials; export only known data fields.
let reviews = [];
if (get("--human-review", null))
  reviews = JSON.parse(await readFile(get("--human-review"), "utf8"));
const summary = await exportEvaluation(
  directory,
  records,
  {
    ...metadata,
    actualProviderCalls: calls,
    providerUsageThisRun: traces.reduce(
      (s, t) => ({
        inputTokens: s.inputTokens + (t.usage?.input_tokens || 0),
        cachedInputTokens:
          s.cachedInputTokens +
          (t.usage?.input_tokens_details?.cached_tokens || 0),
        outputTokens: s.outputTokens + (t.usage?.output_tokens || 0),
        callsWithoutUsage: s.callsWithoutUsage + (t.usage ? 0 : 1),
      }),
      {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        callsWithoutUsage: 0,
      },
    ),
  },
  reviews,
);
console.log(
  JSON.stringify({ directory, actualProviderCalls: calls, summary }, null, 2),
);
if (
  records.some((r) => r.error || r.judgeError) ||
  records.some((r) => r.deterministic && !r.deterministic.passed)
)
  process.exitCode = 1;
