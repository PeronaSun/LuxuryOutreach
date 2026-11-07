import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { finalCases, EVALUATION_TIME } from "../evaluation/final-v1/cases.mjs";
import { criteria, qualityScore } from "../evaluation/final-v1/rubric.mjs";
import { judgeSchema } from "../evaluation/final-v1/judge.mjs";
import { deterministicEvaluation } from "../evaluation/final-v1/deterministic.mjs";
import { calibrate } from "../evaluation/final-v1/human-review.mjs";
import { csv, evaluationSummary } from "../evaluation/final-v1/reporting.mjs";
import { evaluateRequest } from "../server/rules.mjs";
import { demoCandidates, buildPrompt } from "../server/generation.mjs";
import { brandContext } from "../server/brand-context.mjs";
import { products } from "../data/catalog.mjs";
import { matchesSchema } from "../server/generation-errors.mjs";
import { distribution } from "../server/performance-metrics.mjs";

test("final design has fifty valid fictional cases, six scenarios and all fifteen SKUs", () => {
  assert.equal(finalCases.length, 50);
  assert.equal(new Set(finalCases.map((c) => c.id)).size, 50);
  assert.equal(new Set(finalCases.map((c) => c.input.scenario)).size, 6);
  assert.ok(
    products.every((p) => finalCases.some((c) => c.input.sku === p.sku)),
  );
  let messages = 0;
  for (const c of finalCases) {
    assert.equal(c.fictional, true);
    const ctx = evaluateRequest(c.input, { now: EVALUATION_TIME });
    assert.equal(ctx.status, "READY", c.id);
    const out = demoCandidates(c.input, ctx);
    assert.equal(out.length, 3);
    messages += out.length;
    assert.equal(deterministicEvaluation(out, ctx, c.input).passed, true, c.id);
  }
  assert.equal(messages, 150);
});
test("retrieval retains original hard constraints and exact selected product stories", async () => {
  const bible = await readFile(
    new URL("../docs/brand-bible-v1.txt", import.meta.url),
    "utf8",
  );
  const hard = bible
    .slice(bible.indexOf("06  CA"), bible.indexOf("07  六类"))
    .trim();
  for (const scenario of [
    "greeting",
    "recommend",
    "care",
    "reactivate",
    "event",
    "price",
  ]) {
    assert.ok(brandContext(scenario).includes(hard));
    assert.ok(brandContext(scenario, { audit: true }).includes(hard));
    assert.ok(!brandContext(scenario).includes("JAS-B01"));
  }
  for (const p of products) {
    const input = {
      clientId: "CL-001",
      scenario: "recommend",
      motif: p.motif,
      line: p.line,
      sku: p.sku,
    };
    const ctx = evaluateRequest(input);
    const payload = JSON.parse(buildPrompt(input, ctx).input);
    assert.deepEqual(payload.product, p);
    assert.ok(bible.includes(payload.messagePlan.story.line.story));
  }
});
const judgment = (value = 4, set = 4) => ({
  candidates: ["concise", "detailed", "elegant"].map((style) => ({
    style,
    scores: Object.fromEntries(Object.keys(criteria).map((k) => [k, value])),
    reason: "unit fixture",
  })),
  differentiation: { score: set, reason: "unit fixture" },
  additionalHardConcerns: [],
});
test("weighted scores honor candidate-set differentiation and cannot conceal its low score", () => {
  assert.equal(
    Object.values(criteria).reduce((sum, c) => sum + c.weight, 0),
    1,
  );
  assert.equal(qualityScore(judgment(5, 5)).caseScore, 5);
  assert.equal(qualityScore(judgment(5, 1)).softPassed, false);
  const invalid = judgment();
  invalid.candidates[0].scores.naturalness = 4.5;
  assert.equal(matchesSchema(invalid, judgeSchema), false);
  invalid.candidates[0].scores.naturalness = 6;
  assert.equal(matchesSchema(invalid, judgeSchema), false);
});
test("human calibration stays pending for blank templates and rejects invalid supplied reviews", () => {
  assert.equal(calibrate([], []).status, "PENDING_HUMAN_REVIEW");
  const record = {
    id: "test",
    messages: judgment().candidates,
    judge: { judgment: judgment() },
  };
  const review = {
    caseId: "test",
    reviewer: "unit-test fixture",
    reviewedAt: "2026-11-07T00:00:00Z",
    candidates: judgment().candidates,
    differentiationScore: 4,
  };
  assert.equal(calibrate([record], [review]).meanAbsoluteDifference, 0);
  assert.equal(calibrate([record], [review]).calibrationComplete, false);
  assert.throws(() => calibrate([record], [review, review]), /Duplicate/);
  review.candidates[0].scores.brandConsistency = 9;
  assert.throws(() => calibrate([record], [review]), /1–5/);
});
test("required event details accept equivalent Chinese dates/times and reject wrong or omitted facts", () => {
  const input = {
      clientId: "CL-001",
      scenario: "event",
      eventId: "EV-DEMO-01",
    },
    ctx = evaluateRequest(input),
    out = demoCandidates(input, ctx);
  const equivalent = out.map((c) => ({
    ...c,
    text: c.text.replaceAll(ctx.event.date, "十二月十二日下午两点"),
  }));
  assert.equal(deterministicEvaluation(equivalent, ctx, input).passed, true);
  const wrong = out.map((c) => ({
    ...c,
    text: c.text.replaceAll(ctx.event.date, "2026-12-12 13:00"),
  }));
  assert.ok(
    deterministicEvaluation(wrong, ctx, input).hard.some(
      (f) => f.ruleId === "EVENT_REQUIRED_DETAILS",
    ),
  );
  const omitted = out.map((c) => ({
    ...c,
    text: c.text.replaceAll(ctx.event.location, ""),
  }));
  assert.equal(deterministicEvaluation(omitted, ctx, input).passed, false);
});
test("hard failures stay independent from soft quality and lowercase internal IDs are detected", () => {
  const definition = finalCases.find((c) => c.input.sku === "JAS-B01"),
    ctx = evaluateRequest(definition.input),
    out = demoCandidates(definition.input, ctx);
  const bad = out.map((c, i) => (i ? c : { ...c, text: c.text + " jas-b01" }));
  assert.ok(
    deterministicEvaluation(bad, ctx, definition.input).hard.some(
      (f) => f.ruleId === "INTERNAL_IDENTIFIER",
    ),
  );
  const records = Array.from({ length: 50 }, (_, i) => ({
    id: String(i),
    source: "mock",
    input: { scenario: "recommend" },
    messages: out,
    deterministic: { passed: true },
    judge: { judgment: judgment(5, 5), ...qualityScore(judgment(5, 5)) },
    generationMs: 1,
  }));
  assert.equal(evaluationSummary(records).acceptance.completion, false);
  records[0].deterministic.passed = false;
  assert.equal(evaluationSummary(records).deterministicPassed, 49);
});
test("CSV exports preserve Chinese, commas, quotes and multiline message boundaries", () => {
  const value = csv([
    ["消息", "正文"],
    ["一", 'Bonjour，林女士\n\n他说"好",再聊'],
  ]);
  assert.ok(value.startsWith("\uFEFF"));
  assert.ok(value.includes('他说""好"",再聊'));
  assert.ok(value.includes("\n\n"));
});
test("latency summaries label small-sample p95 and do not invent empty measurements", () => {
  const data = distribution([1, 2, 3, 4]);
  assert.equal(data.median, 2.5);
  assert.equal(data.p95, 4);
  assert.equal(data.adequateTailSample, false);
  assert.equal(distribution([]).median, null);
});
test("full paid run is blocked before any model call without explicit approval", () => {
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        ["scripts/final-evaluation.mjs", "--live"],
        { stdio: "pipe" },
      ),
    (error) => String(error.stderr).includes("explicit user approval"),
  );
});
