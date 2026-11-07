import { mkdir, writeFile } from "node:fs/promises";
import { cases } from "../tests/cases.mjs";
import {
  evaluateRequest,
  validateCandidates,
  PROMPT_VERSION,
} from "../server/rules.mjs";
import { generate } from "../server/generation.mjs";
import { BRAND_VERSION } from "../data/catalog.mjs";
const live = process.argv.includes("--live");
if (live && !process.env.OPENAI_API_KEY) {
  console.error(
    "Live evaluation requires OPENAI_API_KEY; no AI results were generated.",
  );
  process.exit(1);
}
const results = [];
for (const c of cases) {
  const ctx = evaluateRequest(c.input);
  let out = null,
    error = null;
  if (ctx.status === "READY") {
    try {
      out = await generate(c.input, ctx, { demo: !live });
    } catch (e) {
      error = e.message;
    }
  }
  results.push({
    ...c,
    actualStatus: ctx.status,
    resolvedSku: ctx.resolved?.product?.sku || null,
    rulePassed:
      ctx.status === c.expectedStatus &&
      (ctx.resolved?.product?.sku || null) === c.expectedSku,
    generated: out?.candidates || [],
    model: out?.model || null,
    mode: live ? "live" : "demo",
    error,
    outputErrors: out
      ? validateCandidates(out.candidates, { ...ctx, input: c.input })
      : [],
    promptVersion: PROMPT_VERSION,
    brandBibleVersion: BRAND_VERSION,
  });
}
await mkdir("runtime", { recursive: true });
await writeFile(
  `runtime/evaluation-${live ? "live" : "demo"}.json`,
  JSON.stringify(
    { executedAt: new Date().toISOString(), live, results },
    null,
    2,
  ),
);
const cols = [
  "case_id",
  "scenario",
  "client_id",
  "motif",
  "line",
  "selected_sku",
  "occasion",
  "expected_status",
  "actual_status",
  "resolved_sku",
  "rule_passed",
  "model",
  "candidate_1",
  "candidate_2",
  "candidate_3",
  "error",
];
const escape = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
await writeFile(
  `runtime/evaluation-${live ? "live" : "demo"}.csv`,
  "\uFEFF" +
    [
      cols,
      ...results.map((r) => [
        r.id,
        r.input.scenario,
        r.input.clientId,
        r.input.motif,
        r.input.line,
        r.input.sku,
        r.input.occasion,
        r.expectedStatus,
        r.actualStatus,
        r.resolvedSku,
        r.rulePassed,
        r.model,
        ...[0, 1, 2].map((i) => r.generated[i]?.text || ""),
        r.error,
      ]),
    ]
      .map((row) => row.map(escape).join(","))
      .join("\n"),
);
const passed = results.filter(
  (r) => r.rulePassed && !r.error && !r.outputErrors.length,
).length;
console.log(
  JSON.stringify(
    {
      cases: results.length,
      passed,
      ready: results.filter((r) => r.actualStatus === "READY").length,
      candidateCount: results.reduce((n, r) => n + r.generated.length, 0),
      mode: live ? "live" : "demo",
      qualityScores: "Not assigned. Human rubric evaluation required.",
    },
    null,
    2,
  ),
);
if (passed !== results.length) process.exitCode = 1;
