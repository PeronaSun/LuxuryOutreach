// ONE live application generation, including its normal audit; no retries/evaluation loop.
// Run: node --env-file-if-exists=.env scripts/deepseek-smoke.mjs
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createApp } from "../server/index.mjs";
import { generate, buildPrompt } from "../server/generation.mjs";
import { providerConfig } from "../server/provider-config.mjs";
import {
  evaluateRequest,
  validateCandidates,
  PROMPT_VERSION,
} from "../server/rules.mjs";
import { splitParagraphs } from "../server/message-contract.mjs";
import { assessCandidates } from "../server/output-assessment.mjs";
import { auditInstructions } from "../server/audit-policy.mjs";

const config = providerConfig();
// Never serialize config: it contains the credential.
if (
  config.provider !== "deepseek" ||
  !config.key ||
  config.demo ||
  config.model !== "deepseek-flash"
) {
  console.error(
    "Smoke test not started: configure DeepSeek with deepseek-flash and live mode.",
  );
  process.exit(1);
}
const diagnosticRun = process.argv.includes("--diagnose");
const task = {
  caseId: diagnosticRun
    ? "DEEPSEEK-JAS-B01-DIAGNOSTIC"
    : "DEEPSEEK-SINGLE-LIVE-SMOKE",
  clientId: "CL-001",
  scenario: "recommend",
  motif: "jasmin",
  line: "jasmin",
  sku: diagnosticRun ? "JAS-B01" : "JAS-R01",
  occasion: "personal",
  ...(diagnosticRun
    ? { notes: "客户喜欢低调、日常佩戴的珠宝，不希望设计过于夸张。" }
    : {}),
};
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const directory = resolve(
  "runtime",
  diagnosticRun ? "deepseek-debug" : "deepseek-smoke",
  stamp,
);
await mkdir(directory, { recursive: true });
const requests = [];
let generationInvocations = 0;
const nativeFetch = globalThis.fetch;
const observedFetch = async (url, options) => {
  if (requests.length >= 2) throw new Error("Smoke request budget exceeded");
  const body = JSON.parse(options.body);
  const item = {
    stage: body.text?.format?.name,
    endpoint: url,
    requestedModel: body.model,
    startedAt: new Date().toISOString(),
  };
  requests.push(item);
  try {
    const response = await nativeFetch(url, options);
    item.httpStatus = response.status;
    if (response.ok) {
      const data = await response.clone().json();
      item.returnedModel = data.model || null;
      item.responseStatus = data.status || null;
      const raw = (data.output || [])
        .flatMap((output) => output.content || [])
        .filter((part) => part.type === "output_text")
        .map((part) => part.text)
        .join("");
      item.outputTextChars = raw.length;
      try {
        item.structuredOutput = JSON.parse(raw);
        item.parseSuccess = true;
      } catch {
        item.parseSuccess = false;
      }
    }
    item.finishedAt = new Date().toISOString();
    return response;
  } catch (error) {
    item.error = error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK_ERROR";
    item.finishedAt = new Date().toISOString();
    throw new Error("Smoke provider network request failed");
  }
};
const app = createApp({
  recordDir: directory,
  env: {
    ...process.env,
    ...(diagnosticRun ? { GENERATION_DIAGNOSTICS: "true" } : {}),
  },
  diagnosticLogger: (event) => diagnostics.push(event),
  generator: async (input, ctx, options) => {
    generationInvocations++;
    if (generationInvocations !== 1)
      throw new Error("Only one generation is permitted");
    return generate(input, ctx, { ...options, fetchImpl: observedFetch });
  },
});
const diagnostics = [];
const report = {
  startedAt: new Date().toISOString(),
  task,
  provider: "deepseek",
  model: config.model,
  promptVersion: PROMPT_VERSION,
  requests,
  diagnostics,
  auditPromptSha256: createHash("sha256")
    .update(auditInstructions)
    .digest("hex"),
};
try {
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  const bootstrap = await (await nativeFetch(base + "/api/bootstrap")).json();
  if (
    bootstrap.mode !== "live" ||
    bootstrap.provider !== "deepseek" ||
    bootstrap.model !== "deepseek-flash"
  )
    throw new Error("Backend configuration check failed");
  const ctx = evaluateRequest(task);
  report.promptSha256 = createHash("sha256")
    .update(buildPrompt(task, ctx).instructions)
    .digest("hex");
  const response = await nativeFetch(base + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  report.applicationHttpStatus = response.status;
  const result = await response.json();
  report.result = result;
  report.candidateCount = result.candidates?.length || 0;
  report.validationErrors = result.candidates
    ? assessCandidates(
        result.candidates,
        { ...ctx, input: task },
        { allowSemanticContextCheck: true },
      ).hard
    : [];
  report.strictQualityChecks = result.candidates
    ? validateCandidates(result.candidates, { ...ctx, input: task })
    : [];
  report.generatedCandidateCount =
    requests[0]?.structuredOutput?.candidates?.length || 0;
  report.liveApiReached =
    requests.length > 0 &&
    requests.every(
      (request) =>
        request.httpStatus === 200 && request.returnedModel === config.model,
    );
  report.threeChineseMessages =
    report.candidateCount === 3 &&
    result.candidates.every(
      (c) =>
        splitParagraphs(c.text).length === 3 &&
        /[\u4e00-\u9fff]/.test(splitParagraphs(c.text)[1]),
    );
  report.confirmedLive =
    response.ok &&
    result.mode === "live" &&
    result.provider === "deepseek" &&
    requests.length === 2 &&
    requests.every((r) => r.httpStatus === 200);
  report.passed =
    report.confirmedLive &&
    report.threeChineseMessages &&
    !report.validationErrors.length;
  report.generationInvocations = generationInvocations;
} catch {
  report.passed = false;
  report.error =
    "Smoke test failed; inspect sanitized request statuses and application result.";
} finally {
  if (app.listening) await new Promise((r) => app.close(r));
  report.finishedAt = new Date().toISOString();
  // Defensive redaction, including provider text, before persisting/printing evidence.
  const sanitized = (text) => text.replaceAll(config.key, "[REDACTED]");
  const recordPath = resolve(directory, "records.jsonl");
  try {
    const records = await readFile(recordPath, "utf8");
    if (records.includes(config.key))
      await writeFile(recordPath, sanitized(records));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(
    resolve(directory, "smoke-report.json"),
    sanitized(JSON.stringify(report, null, 2)) + "\n",
    { flag: "wx" },
  );
  console.log(
    sanitized(
      JSON.stringify(
        {
          passed: report.passed,
          provider: report.provider,
          model: report.model,
          applicationHttpStatus: report.applicationHttpStatus,
          candidateCount: report.candidateCount,
          threeChineseMessages: report.threeChineseMessages,
          confirmedLive: report.confirmedLive,
          generationInvocations,
          requests: requests.map(
            ({ structuredOutput, ...metadata }) => metadata,
          ),
          liveApiReached: report.liveApiReached,
          generatedCandidateCount: report.generatedCandidateCount,
          failedRuleIds: diagnostics
            .filter((event) => event.status === "failed")
            .flatMap((event) => event.ruleIds),
          warningRuleIds:
            report.result?.warnings?.map((finding) => finding.ruleId) || [],
          error: report.result?.error || report.error || null,
          evidenceDirectory: directory,
        },
        null,
        2,
      ),
    ),
  );
  process.exitCode = report.passed ? 0 : 1;
}
