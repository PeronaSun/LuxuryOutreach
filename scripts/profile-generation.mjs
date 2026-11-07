// Four matched real HTTP requests; maximum 12 provider calls per phase.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createApp } from "../server/index.mjs";
import { generate } from "../server/generation.mjs";
import { providerConfig } from "../server/provider-config.mjs";
import { PROMPT_VERSION } from "../server/rules.mjs";
import { liveSampleCases } from "../tests/reliability-cases.mjs";
import { summarizePerformance } from "../server/performance-metrics.mjs";

const args = process.argv.slice(2),
  label = args[args.indexOf("--label") + 1];
if (!["before", "after"].includes(label))
  throw new Error("Specify --label before or after");
const config = providerConfig();
if (!config.key || config.demo || config.provider !== "deepseek")
  throw new Error("Configured live DeepSeek is required");
const directory = resolve(
  "runtime/performance",
  `${label}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
await mkdir(directory, { recursive: true });
const cases = [
  liveSampleCases[0],
  liveSampleCases[1],
  liveSampleCases[2],
  liveSampleCases[5],
];
const records = [];
let active = null,
  calls = 0;
const nativeFetch = globalThis.fetch;
const clean = (value) =>
  JSON.stringify(value, null, 2).replaceAll(config.key, "[REDACTED]");
const save = (name, value) =>
  writeFile(resolve(directory, name), clean(value) + "\n", { flag: "wx" });
const app = createApp({
  recordDir: directory,
  env: process.env,
  clock: () => new Date("2026-11-07T04:00:00Z"),
  generator: (input, ctx, options) =>
    generate(input, ctx, {
      ...options,
      fetchImpl: async (url, opts) => {
        if (calls >= 12)
          throw new Error("Phase provider-call budget exhausted");
        calls++;
        const request = JSON.parse(opts.body),
          trace = {
            stage: request.text.format.name,
            requestedModel: request.model,
            requestBytes: Buffer.byteLength(opts.body),
            promptSha256: createHash("sha256")
              .update(request.instructions + request.input)
              .digest("hex"),
            startedAt: new Date().toISOString(),
          };
        active.traces.push(trace);
        const started = performance.now();
        try {
          const response = await nativeFetch(url, opts);
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
          trace.totalMs = performance.now() - started;
        }
      },
    }),
});
try {
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  console.log(
    JSON.stringify({
      label,
      directory,
      cases: cases.length,
      maxProviderCalls: 12,
      promptVersion: PROMPT_VERSION,
    }),
  );
  for (const definition of cases) {
    active = {
      id: definition.id,
      input: definition.input,
      attempted: false,
      succeeded: false,
      traces: [],
    };
    if (calls + 2 <= 12) {
      active.attempted = true;
      const start = performance.now();
      const response = await nativeFetch(base + "/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...definition.input, caseId: definition.id }),
      });
      active.result = await response.json();
      active.httpStatus = response.status;
      active.succeeded = response.ok;
      const result = active.result,
        p = result.performance,
        measurements = p?.measurements || [];
      const sum = (stage) =>
        measurements
          .filter((m) => m.stage === stage)
          .reduce((n, m) => n + m.durationMs, 0);
      active.timings = {
        httpTotalMs: performance.now() - start,
        pipelineMs: p?.totalMs || 0,
        normalizationMs: p?.contextTimings?.normalizationMs || 0,
        resolutionMs: p?.contextTimings?.resolutionMs || 0,
        contextBuildMs: sum("context.build"),
        generationApiMs: sum("advisor_messages.api"),
        auditApiMs: sum("brand_audit.api"),
        jsonParseMs: sum("advisor_messages.parse") + sum("brand_audit.parse"),
        schemaMs: sum("advisor_messages.schema") + sum("brand_audit.schema"),
        validationMs: sum("output.validation") + sum("brand_audit.validation"),
      };
    } else active.notExecutedReason = "INSUFFICIENT_PHASE_BUDGET";
    records.push(active);
    await save(definition.id + ".json", active);
    console.log(
      JSON.stringify({
        id: active.id,
        succeeded: active.succeeded,
        ms: active.timings?.httpTotalMs,
        calls: active.traces.length,
      }),
    );
  }
  const summary = {
    label,
    promptVersion: PROMPT_VERSION,
    clock: "2026-11-07T04:00:00Z",
    createdAt: new Date().toISOString(),
    ...summarizePerformance(records),
  };
  await save("records.json", records);
  await save("summary.json", summary);
  console.log(JSON.stringify({ directory, summary }, null, 2));
  if (records.some((r) => !r.succeeded)) process.exitCode = 1;
} finally {
  await new Promise((r) => app.close(r));
}
