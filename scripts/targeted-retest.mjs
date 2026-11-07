// Explicit eight-case retest; never dispatches the 50-case runner.
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { generate } from "../server/generation.mjs";
import { evaluateRequest, PROMPT_VERSION } from "../server/rules.mjs";
import { providerConfig } from "../server/provider-config.mjs";
import { recoveryConfig } from "../server/recovery-policy.mjs";
import {
  deterministicEvaluationV2,
  DETERMINISTIC_VERSION,
} from "../evaluation/final-v1/deterministic-v2.mjs";
const SOURCE =
  "runtime/final-evaluation/live-2026-11-07T19-57-17-059Z-88a109ee";
const ALLOWED_IDS = [
  "F-014",
  "F-017",
  "F-031",
  "F-034",
  "F-039",
  "F-041",
  "F-042",
  "F-045",
];
const flagValue = (name) =>
  process.argv.includes(name)
    ? process.argv[process.argv.indexOf(name) + 1]
    : null;
const IDS = flagValue("--case-ids")
  ? flagValue("--case-ids").split(",")
  : ALLOWED_IDS;
if (
  !IDS.length ||
  new Set(IDS).size !== IDS.length ||
  IDS.some((id) => !ALLOWED_IDS.includes(id))
)
  throw Error("Invalid targeted subset");
const priorRetestRun = flagValue("--prior-retest");
if (!process.argv.includes("--approved-targeted-retest"))
  throw Error("Explicit targeted authorization flag required; no calls made");
const config = providerConfig();
if (
  config.demo ||
  config.provider !== "deepseek" ||
  !config.key ||
  config.model !== "deepseek-flash"
)
  throw Error("Live DeepSeek Flash required");
const load = async (f) => JSON.parse(await readFile(f, "utf8"));
const originals = await load(resolve(SOURCE, "records.json")),
  originalManifest = await load(resolve(SOURCE, "manifest.json")),
  originalSummary = await load(resolve(SOURCE, "summary.json"));
const originalCalls = originalSummary.actualProviderCalls,
  settings = recoveryConfig();
const previous = priorRetestRun
  ? await load(resolve(priorRetestRun, "summary.json"))
  : null;
const cumulativeBase = previous
  ? previous.cumulativeProviderCalls
  : originalCalls;
const limit = Math.min(
  IDS.length * settings.maxProviderCalls,
  200 - cumulativeBase,
);
const directory = resolve(
  "runtime/final-evaluation",
  `targeted-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
);
await mkdir(resolve(directory, "attempts"), { recursive: true });
const clean = (v) =>
  JSON.stringify(v, null, 2).replaceAll(config.key, "[REDACTED]");
const save = (f, v) =>
  writeFile(resolve(directory, f), clean(v) + "\n", { flag: "wx" });
const sha = (v) => createHash("sha256").update(v).digest("hex");
const metadata = {
  mode: "targeted-retest",
  createdAt: new Date().toISOString(),
  sourceRun: SOURCE,
  originalCalls,
  priorRetestRun: priorRetestRun ? resolve(priorRetestRun) : null,
  cumulativeBase,
  targetIds: IDS,
  offlineOnlyIds: ["F-037"],
  additionalCallCap: limit,
  cumulativeCap: 200,
  model: config.model,
  provider: config.provider,
  promptVersion: PROMPT_VERSION,
  deterministicVersion: DETERMINISTIC_VERSION,
  brandBibleVersion: originalManifest.brandBibleVersion,
  caseSetVersion: originalManifest.caseSetVersion,
  recovery: settings,
  sourceFingerprints: Object.fromEntries(
    await Promise.all(
      [
        "server/generation.mjs",
        "server/rules.mjs",
        "server/scenario-facts.mjs",
        "server/prompt-context.mjs",
        "server/output-assessment.mjs",
        "server/audit-policy.mjs",
        "evaluation/final-v1/deterministic-v2.mjs",
        "scripts/targeted-retest.mjs",
      ].map(async (f) => [f, sha(await readFile(f))]),
    ),
  ),
};
await save("manifest.json", metadata);
let calls = 0;
const traces = [],
  records = [];
console.log(
  JSON.stringify({
    directory,
    targetIds: IDS,
    originalCalls,
    additionalCallCap: limit,
    cumulativeCap: 200,
    promptVersion: PROMPT_VERSION,
  }),
);
for (const id of IDS) {
  const original = originals.find((r) => r.id === id),
    ctx = evaluateRequest(original.input, {
      now: originalManifest.evaluationTime,
    });
  if (
    JSON.stringify(ctx.normalized) !==
    JSON.stringify(original.context.normalized)
  )
    throw Error("Normalized input/context differs from original");
  const diagnostics = [];
  const record = {
    id,
    input: original.input,
    normalizedInput: ctx.normalized.task,
    context: ctx,
    source: "live",
    provider: config.provider,
    model: config.model,
    promptVersion: PROMPT_VERSION,
    brandBibleVersion: originalManifest.brandBibleVersion,
    generatedAt: new Date().toISOString(),
    messages: [],
    generationPerformedInThisRun: true,
    sourceRun: directory,
    originalRun: SOURCE,
    sameInputAndCanonicalContext: true,
  };
  const start = performance.now();
  try {
    const result = await generate(original.input, ctx, {
      ...config,
      demo: false,
      onDiagnostic: (e) => diagnostics.push(e),
      fetchImpl: async (url, options) => {
        if (calls >= limit || cumulativeBase + calls >= 200)
          throw Error("Cumulative paid API budget exhausted");
        calls++;
        const req = JSON.parse(options.body),
          trace = {
            index: calls,
            caseId: id,
            stage: req.text.format.name,
            requestedModel: req.model,
            startedAt: new Date().toISOString(),
            requestSha256: sha(options.body),
            attemptFile: `attempts/${id}-${String(calls).padStart(3, "0")}.json`,
          };
        traces.push(trace);
        const begin = performance.now();
        let responseData = null;
        try {
          const response = await fetch(url, options);
          trace.httpStatus = response.status;
          const raw = await response.clone().text();
          try {
            responseData = JSON.parse(raw);
          } catch {
            responseData = { unparsedResponse: raw };
          }
          trace.returnedModel = responseData.model;
          trace.usage = responseData.usage;
          trace.status = responseData.status;
          return response;
        } catch (error) {
          trace.errorCategory = ["AbortError", "TimeoutError"].includes(
            error.name,
          )
            ? "API_TIMEOUT"
            : "API_NETWORK";
          throw error;
        } finally {
          trace.durationMs = performance.now() - begin;
          trace.completedAt = new Date().toISOString();
          await save(trace.attemptFile, {
            trace,
            request: req,
            response: responseData,
          });
          await appendFile(
            resolve(directory, "provider-traces.jsonl"),
            JSON.stringify(trace) + "\n",
          );
        }
      },
    });
    record.messages = result.candidates;
    record.recovery = result.recovery;
    record.performance = result.performance;
    record.executionStatus = "LIVE_COMPLETED";
    record.deterministic = deterministicEvaluationV2(
      record.messages,
      ctx,
      original.input,
    );
  } catch (error) {
    record.error = {
      code: error.code || "GENERATION_FAILED",
      stage: error.stage || "generation",
      ruleIds: error.ruleIds || [],
      candidateIndexes: error.candidateIndexes || [],
    };
    record.recovery = error.recovery;
    record.performance = {
      totalMs: performance.now() - start,
      measurements: diagnostics,
    };
    record.executionStatus = "LIVE_FAILED";
  }
  record.generationMs = performance.now() - start;
  record.completedAt = new Date().toISOString();
  record.providerAttempts = traces.filter((t) => t.caseId === id);
  record.diagnostics = diagnostics;
  record.apiLatencyMs = record.providerAttempts.reduce(
    (s, t) => s + t.durationMs,
    0,
  );
  record.tokenUsage = record.providerAttempts.reduce(
    (s, t) => ({
      input: s.input + (t.usage?.input_tokens || 0),
      cached: s.cached + (t.usage?.input_tokens_details?.cached_tokens || 0),
      output: s.output + (t.usage?.output_tokens || 0),
      callsWithoutUsage: s.callsWithoutUsage + (t.usage ? 0 : 1),
    }),
    { input: 0, cached: 0, output: 0, callsWithoutUsage: 0 },
  );
  record.judgeStatus = "PENDING_INDEPENDENT_JUDGE_NOT_CONFIGURED";
  records.push(record);
  await save(id + "-generation.json", record);
  console.log(
    JSON.stringify({
      id,
      complete: record.deterministic?.passed || false,
      outputs: record.messages.length,
      calls: record.providerAttempts.length,
      error: record.error || null,
      hard: record.deterministic?.hard || [],
    }),
  );
}
await save("records.json", records);
await writeFile(
  resolve(directory, "records.jsonl"),
  records
    .map((r) => JSON.stringify(r).replaceAll(config.key, "[REDACTED]"))
    .join("\n") + "\n",
  { flag: "wx" },
);
await save("provider-traces.json", traces);
await save("summary.json", {
  ...metadata,
  actualProviderCalls: calls,
  cumulativeProviderCalls: cumulativeBase + calls,
  completed: records.filter((r) => r.deterministic?.passed).length,
  attempted: records.length,
});
console.log(
  JSON.stringify({
    directory,
    actualProviderCalls: calls,
    cumulativeProviderCalls: cumulativeBase + calls,
    completed: records.filter((r) => r.deterministic?.passed).length,
    attempted: records.length,
  }),
);
