// New immutable iteration runner. Defaults to deterministic mocks, never a paid batch.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  reliabilityCases,
  liveSampleCases,
} from "../tests/reliability-cases.mjs";
import { cases as fiftyCases } from "../tests/cases.mjs";
import { evaluateRequest, PROMPT_VERSION } from "../server/rules.mjs";
import {
  generate,
  demoCandidates,
  buildPrompt,
} from "../server/generation.mjs";
import { splitParagraphs } from "../server/message-contract.mjs";
import { assessCandidates } from "../server/output-assessment.mjs";
import { auditInstructions } from "../server/audit-policy.mjs";
import { providerConfig } from "../server/provider-config.mjs";
import { recoveryConfig } from "../server/recovery-policy.mjs";
import { diagnosticEvent } from "../server/generation-errors.mjs";
import { reliabilityMetrics } from "../server/reliability-metrics.mjs";
import { BRAND_VERSION } from "../data/catalog.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const live = args.includes("--live");
const planOnly = args.includes("--plan");
const suite = arg("--suite", live ? "sample" : "matrix");
if (!["sample", "matrix", "50"].includes(suite))
  throw new Error("Use --suite sample, matrix or 50");
const suiteDefinitions =
  suite === "sample"
    ? liveSampleCases
    : suite === "50"
      ? fiftyCases
      : reliabilityCases;
const onlyIds = arg("--only", "").split(",").filter(Boolean);
if (
  onlyIds.some(
    (id) => !suiteDefinitions.some((definition) => definition.id === id),
  )
)
  throw new Error("Unknown case ID in --only");
const definitions = onlyIds.length
  ? suiteDefinitions.filter((definition) => onlyIds.includes(definition.id))
  : suiteDefinitions;
const configured = providerConfig();
const settings = recoveryConfig();
const maxApiCalls = Number(
  arg("--max-api-calls", suite === "sample" ? "24" : "0"),
);
if (live && !planOnly && (!configured.key || configured.demo))
  throw new Error(
    "Live provider/key configuration is required. No calls were made.",
  );
if (
  live &&
  (!Number.isInteger(maxApiCalls) || maxApiCalls < 0 || maxApiCalls > 1000)
)
  throw new Error("A bounded integer API call budget is required");
if (
  live &&
  !planOnly &&
  suite !== "sample" &&
  (!args.includes("--confirm-large-live") || maxApiCalls < 2)
)
  throw new Error(
    "Large live runs require a reviewed cost/budget, explicit user approval, --confirm-large-live and --max-api-calls. No calls were made.",
  );
if (live && suite === "sample" && maxApiCalls > 24)
  throw new Error("The small live sample is capped at 24 provider calls");

const sha = (text) => createHash("sha256").update(text).digest("hex");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const mode = planOnly ? "plan" : live ? "live" : "mock";
const directory = resolve(
  "runtime",
  "reliability",
  PROMPT_VERSION,
  `${mode}-${suite}-${stamp}-${randomUUID().slice(0, 8)}`,
);
await mkdir(directory, { recursive: true });
const clean = (value) => {
  const text = JSON.stringify(value, null, 2);
  return configured.key ? text.replaceAll(configured.key, "[REDACTED]") : text;
};
const save = (file, value) =>
  writeFile(resolve(directory, file), clean(value) + "\n", { flag: "wx" });
const records = [];
let providerCalls = 0;
const plan = {
  mode,
  suite,
  cases: definitions.length,
  provider: live ? configured.provider : "deterministic_mock",
  model: live ? configured.model : "mock-model",
  maxApiCalls: live ? maxApiCalls : 0,
  settings,
  promptVersion: PROMPT_VERSION,
  brandVersion: BRAND_VERSION,
  auditSha256: sha(auditInstructions),
  startedAt: new Date().toISOString(),
  notes:
    "Mocks test pipeline contracts, not model quality. No subjective quality scores are assigned.",
};
await save("plan.json", plan);
console.log(
  JSON.stringify({
    mode,
    suite,
    cases: definitions.length,
    maxApiCalls: plan.maxApiCalls,
    directory,
  }),
);
if (planOnly) {
  await save(
    "cases.json",
    definitions.map((definition) => ({
      id: definition.id,
      input: definition.input,
      status: evaluateRequest(definition.input).status,
    })),
  );
  console.log("Plan only: no generation or provider calls performed.");
  process.exit(0);
}

for (const definition of definitions) {
  const input = definition.input,
    context = evaluateRequest(input);
  const record = {
    id: definition.id,
    requestId: randomUUID(),
    input,
    fictional: true,
    scenario: input.scenario,
    selectionDepth: context.normalized?.selection.depth ?? 0,
    resolvedSku: context.resolved?.product?.sku || null,
    normalizedContext: context.normalized || null,
    inputValidation: { status: context.status, issues: context.issues },
    source: live ? "real_provider" : "deterministic_mock",
    attempted: false,
    realModelGenerationPerformed: false,
    succeeded: false,
    actualProviderCalls: 0,
    mockedProviderCalls: 0,
    diagnostics: [],
    traces: [],
    model: plan.model,
    provider: plan.provider,
    promptVersion: PROMPT_VERSION,
    brandVersion: BRAND_VERSION,
    messages: [],
    startedAt: new Date().toISOString(),
  };
  const onDiagnostic = (event) =>
    record.diagnostics.push(
      diagnosticEvent(event, {
        requestId: record.requestId,
        provider: live ? configured.provider : "mock",
        model: record.model,
        demo: false,
        key: configured.key,
      }),
    );
  if (
    context.status === "READY" &&
    (!live || providerCalls + 2 <= maxApiCalls)
  ) {
    record.attempted = true;
    record.promptSha256 = sha(buildPrompt(input, context).instructions);
    const fixture = live
      ? null
      : demoCandidates(input, context).map((candidate) => ({
          style: candidate.style,
          main: splitParagraphs(candidate.text)[1],
          cta: splitParagraphs(candidate.text)[2],
        }));
    const fetchImpl = async (url, options) => {
      const body = JSON.parse(options.body);
      if (!live) {
        record.mockedProviderCalls++;
        const content =
          body.text.format.name === "brand_audit"
            ? { passed: true, reasons: [], findings: [] }
            : {
                candidates: fixture.filter((candidate) =>
                  body.text.format.schema.properties.candidates.items.properties.style.enum.includes(
                    candidate.style,
                  ),
                ),
              };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "completed",
            model: "mock-model",
            output: [
              {
                content: [
                  { type: "output_text", text: JSON.stringify(content) },
                ],
              },
            ],
          }),
        };
      }
      if (providerCalls >= maxApiCalls)
        throw new Error("Global provider budget exhausted");
      providerCalls++;
      record.actualProviderCalls++;
      const trace = {
        index: providerCalls,
        stage: body.text.format.name,
        requestedModel: body.model,
        temperature: body.temperature,
        maxOutputTokens: body.max_output_tokens,
        startedAt: new Date().toISOString(),
      };
      record.traces.push(trace);
      try {
        const response = await fetch(url, options);
        trace.httpStatus = response.status;
        if (response.ok) {
          try {
            const data = await response.clone().json();
            trace.responseStatus = data.status;
            trace.returnedModel = data.model;
            trace.usage = data.usage;
            const raw = (data.output || [])
              .flatMap((item) => item.content || [])
              .filter((part) => part.type === "output_text")
              .map((part) => part.text)
              .join("");
            try {
              trace.structuredOutput = JSON.parse(raw);
              trace.parsed = true;
            } catch {
              trace.parsed = false;
            }
          } catch {
            trace.responseJsonParsed = false;
          }
        }
        return response;
      } catch (error) {
        trace.networkError =
          error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK";
        throw error;
      } finally {
        trace.finishedAt = new Date().toISOString();
      }
    };
    try {
      const result = await generate(input, context, {
        ...(live
          ? configured
          : { provider: "deepseek", key: "fixture-only", model: "mock-model" }),
        demo: false,
        recovery: settings,
        onDiagnostic,
        fetchImpl,
      });
      record.messages = result.candidates;
      record.warnings = result.warnings;
      record.recovery = result.recovery;
      record.outputValidation = assessCandidates(
        result.candidates,
        { ...context, input },
        { allowSemanticContextCheck: true },
      );
      record.succeeded = !record.outputValidation.hard.length;
      record.realModelGenerationPerformed = live && record.succeeded;
    } catch (error) {
      record.error = {
        code: error.code || "GENERATION_FAILED",
        stage: error.stage || "generation",
        ruleIds: error.ruleIds || [],
      };
      record.recovery = error.recovery || null;
    }
  } else
    record.notExecutedReason =
      context.status !== "READY"
        ? "INPUT_NOT_READY"
        : "INSUFFICIENT_GLOBAL_BUDGET";
  record.realModelGenerationPerformed =
    live &&
    record.traces.some(
      (trace) =>
        trace.stage === "advisor_messages" &&
        trace.responseStatus === "completed" &&
        trace.parsed &&
        Array.isArray(trace.structuredOutput?.candidates),
    );
  record.finishedAt = new Date().toISOString();
  records.push(record);
  await save(`${definition.id}.json`, record);
  console.log(
    JSON.stringify({
      caseId: record.id,
      scenario: record.scenario,
      succeeded: record.succeeded,
      source: record.source,
      providerCalls: record.actualProviderCalls,
      error: record.error?.code || null,
    }),
  );
}
const summary = {
  ...plan,
  finishedAt: new Date().toISOString(),
  ...reliabilityMetrics(records),
};
await save("summary.json", summary);
await save("records.json", records);
console.log(JSON.stringify({ directory, summary }, null, 2));
if (
  records.some(
    (record) =>
      (record.attempted && !record.succeeded) ||
      record.notExecutedReason === "INSUFFICIENT_GLOBAL_BUDGET",
  )
)
  process.exitCode = 1;
