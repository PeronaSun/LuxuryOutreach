import test from "node:test";
import assert from "node:assert/strict";
import {
  finalCases,
  REQUIRED_DISTRIBUTION,
  EVALUATION_TIME,
  CASESET_VERSION,
} from "../evaluation/final-v1/cases-submission-v2.mjs";
import { judgePolicy } from "../evaluation/final-v1/judge-policy.mjs";
import {
  submissionExportData,
  CASE_COLUMNS,
} from "../evaluation/final-v1/submission-export-data.mjs";
import { evaluateRequest } from "../server/rules.mjs";
import { normalizeTask } from "../server/generation-context.mjs";
import { demoCandidates } from "../server/generation.mjs";
import { deterministicEvaluation } from "../evaluation/final-v1/deterministic.mjs";
import { clients, events } from "../data/clients.mjs";
import { products } from "../data/catalog.mjs";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const manifest = {
  caseSetVersion: CASESET_VERSION,
  cases: finalCases.map((c) => ({
    ...c,
    context: evaluateRequest(c.input, { now: EVALUATION_TIME }),
  })),
  promptVersion: "advisor-1.5.0",
};
test("submission distribution has exactly 50 valid cases and covers all 15 canonical SKUs", () => {
  assert.equal(finalCases.length, 50);
  assert.equal(new Set(finalCases.map((c) => c.id)).size, 50);
  for (const [scenario, count] of Object.entries(REQUIRED_DISTRIBUTION))
    assert.equal(
      finalCases.filter((c) => c.input.scenario === scenario).length,
      count,
    );
  const covered = new Set();
  for (const c of manifest.cases) {
    assert.equal(c.fictional, true);
    assert.equal(c.context.status, "READY", c.id);
    assert.ok(c.expectedBehavior);
    if (c.context.resolved.product) covered.add(c.context.resolved.product.sku);
    if (c.input.scenario === "care")
      assert.ok(
        clients
          .find((x) => x.id === c.input.clientId)
          .purchases.some(
            (p) =>
              p.id === c.input.purchaseId && p.sku === c.context.purchase.sku,
          ),
      );
    if (c.input.scenario === "event")
      assert.ok(
        events.some(
          (e) => e.id === c.input.eventId && e.verified && e.fictional,
        ),
      );
    assert.equal(
      deterministicEvaluation(
        demoCandidates(c.input, c.context),
        c.context,
        c.input,
      ).passed,
      true,
      c.id,
    );
  }
  assert.deepEqual([...covered].sort(), products.map((p) => p.sku).sort());
});
test("submission retains a controlled occasion triplet and all selection depths", () => {
  const group = finalCases.slice(8, 11);
  assert.deepEqual(
    group.map((c) => c.input.occasion),
    ["personal", "wedding", "gift"],
  );
  const omit = ({ occasion, ...other }) => other;
  assert.deepEqual(omit(group[0].input), omit(group[1].input));
  assert.deepEqual(omit(group[1].input), omit(group[2].input));
  assert.deepEqual(
    [
      ...new Set(
        manifest.cases.map((c) => c.context.normalized.selection.depth),
      ),
    ].sort(),
    [0, 1, 2, 3, 4],
  );
});
test("independent-only grading never silently uses the generation model", () => {
  const config = { provider: "deepseek", model: "deepseek-flash" };
  assert.equal(judgePolicy(config, {}, true).enabled, false);
  assert.equal(
    judgePolicy(config, { DEEPSEEK_JUDGE_MODEL: "deepseek-flash" }, true)
      .enabled,
    false,
  );
  assert.equal(
    judgePolicy(config, { DEEPSEEK_JUDGE_MODEL: "deepseek-v4-pro" }, true)
      .independent,
    true,
  );
  assert.equal(judgePolicy(config, {}, false).enabled, true);
});
test("preflight export has exact requested columns and never fabricates output cells", () => {
  const data = submissionExportData(manifest);
  assert.deepEqual(CASE_COLUMNS, [
    "Case ID",
    "Scenario",
    "Client information",
    "Conversation history",
    "Product information",
    "Output 1",
    "Output 2",
    "Output 3",
  ]);
  assert.equal(data.caseRows.length, 50);
  assert.equal(data.counts.liveExecuted, 0);
  assert.equal(data.counts.actualMessages, 0);
  assert.ok(
    data.caseRows.every(
      (r) => r.length === 8 && r.slice(5).every((x) => x === null),
    ),
  );
  assert.ok(
    data.scoreRows.every(
      (r) => r.qualityScore === null && r.executionStatus === "NOT_EXECUTED",
    ),
  );
});
test("final export rejects mock and reused-profile records rather than labeling them live", () => {
  for (const source of ["mock", "live-source-profile"])
    assert.throws(
      () =>
        submissionExportData(manifest, [
          { id: "F-009", source, provider: "deepseek" },
        ]),
      /original live DeepSeek/,
    );
});
test("export adapter preserves saved real Chinese messages and paragraph breaks", () => {
  // Read-only adapter verification against genuine prior evidence; not a new live execution.
  const saved = JSON.parse(
    readFileSync("evaluation/final-v1/evidence/after/records.json", "utf8"),
  ).find((r) => r.id === "LIVE-BRACELET-1");
  const definition = manifest.cases[8];
  assert.deepEqual(normalizeTask(saved.input), normalizeTask(definition.input));
  assert.equal(saved.result.mode, "live");
  const record = {
    id: definition.id,
    input: definition.input,
    source: "live",
    provider: "deepseek",
    model: saved.result.model,
    messages: saved.result.candidates,
    deterministic: deterministicEvaluation(
      saved.result.candidates,
      definition.context,
      definition.input,
    ),
  };
  const data = submissionExportData(manifest, [record]);
  assert.equal(data.counts.actualMessages, 3);
  assert.equal(data.counts.complete, 1);
  assert.deepEqual(
    data.caseRows[8].slice(5),
    saved.result.candidates.map((c) => c.text),
  );
  assert.ok(
    data.caseRows[8].slice(5).every((t) => t.split("\n\n").length === 3),
  );
});
test("submission live execution still requires an explicit approval flag", () => {
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          "scripts/final-evaluation.mjs",
          "--case-set",
          "submission-v2",
          "--live",
        ],
        { stdio: "pipe" },
      ),
    (error) => String(error.stderr).includes("explicit user approval"),
  );
});
