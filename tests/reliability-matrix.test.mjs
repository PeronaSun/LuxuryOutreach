import test from "node:test";
import assert from "node:assert/strict";
import { products } from "../data/catalog.mjs";
import { clients } from "../data/clients.mjs";
import { reliabilityCases } from "./reliability-cases.mjs";
import { evaluateRequest } from "./test-clock.mjs";
import {
  generate,
  demoCandidates,
  buildPrompt,
} from "../server/generation.mjs";
import { splitParagraphs } from "../server/message-contract.mjs";
import { assessCandidates } from "../server/output-assessment.mjs";
import { reliabilityMetrics } from "../server/reliability-metrics.mjs";

const records = [];
export const modelParts = (candidates) =>
  candidates.map((candidate) => ({
    style: candidate.style,
    main: splitParagraphs(candidate.text)[1],
    cta: splitParagraphs(candidate.text)[2],
  }));
export const response = (body) => ({
  ok: true,
  status: 200,
  json: async () => ({
    status: "completed",
    model: "mock-model",
    output: [
      { content: [{ type: "output_text", text: JSON.stringify(body) }] },
    ],
  }),
});
test("reliability matrix covers six scenarios, every catalog SKU/category and all five supported selection depths", () => {
  assert.equal(new Set(reliabilityCases.map((c) => c.input.scenario)).size, 6);
  assert.deepEqual(
    [
      ...new Set(
        reliabilityCases.flatMap((c) => (c.input.sku ? [c.input.sku] : [])),
      ),
    ].sort(),
    products.map((p) => p.sku).sort(),
  );
  assert.deepEqual(
    [
      ...new Set(
        reliabilityCases.map(
          (c) => evaluateRequest(c.input).normalized.selection.depth,
        ),
      ),
    ].sort(),
    [0, 1, 2, 3, 4],
  );
});
for (const definition of reliabilityCases)
  test(`matrix ${definition.id}: ${definition.input.scenario}, ${definition.input.sku || definition.input.line || definition.input.motif || "no selection"}`, async () => {
    const input = definition.input,
      ctx = evaluateRequest(input);
    assert.equal(ctx.status, "READY", JSON.stringify(ctx.issues));
    if (input.scenario === "care")
      assert.equal(ctx.resolved.product.sku, ctx.purchase.sku);
    else if (input.sku && input.scenario !== "greeting")
      assert.equal(ctx.resolved.product.sku, input.sku);
    else if (
      ["greeting", "reactivate", "event", "price"].includes(input.scenario)
    )
      assert.equal(ctx.resolved.product, null);
    if (input.scenario === "recommend" && input.motif)
      assert.equal(ctx.resolved.product.motif, input.motif);
    const fixtures = modelParts(demoCandidates(input, ctx));
    let calls = 0;
    const result = await generate(input, ctx, {
      demo: false,
      provider: "deepseek",
      model: "mock-model",
      key: "fixture-only",
      fetchImpl: async (_url, options) => {
        calls++;
        const body = JSON.parse(options.body);
        assert.equal(body.temperature, 0.2);
        return response(
          body.text.format.name === "brand_audit"
            ? { passed: true, reasons: [], findings: [] }
            : { candidates: fixtures },
        );
      },
    });
    assert.equal(calls, 2);
    assert.equal(result.candidates.length, 3);
    assert.ok(
      result.candidates.every((c) => splitParagraphs(c.text).length === 3),
    );
    assert.deepEqual(
      assessCandidates(
        result.candidates,
        { ...ctx, input },
        { allowSemanticContextCheck: true },
      ).hard,
      [],
    );
    const payload = JSON.parse(buildPrompt(input, ctx).input);
    assert.equal(
      payload.normalizedContext.grounding.product?.sku || null,
      ctx.resolved.product?.sku || null,
    );
    assert.equal(payload.untrusted_context.notes, input.notes || "");
    records.push({
      attempted: true,
      succeeded: true,
      scenario: input.scenario,
      selectionDepth: ctx.normalized.selection.depth,
      resolvedSku: ctx.resolved.product?.sku || null,
      recovery: result.recovery,
      actualProviderCalls: 0,
      mockedProviderCalls: calls,
    });
  });
test("matrix metrics distinguish mocked provider execution from actual DeepSeek calls", () => {
  const summary = reliabilityMetrics(records);
  assert.equal(
    summary.successfulGenerationRate.numerator,
    reliabilityCases.length,
  );
  assert.equal(summary.actualProviderCalls, 0);
  assert.equal(summary.mockedProviderCalls, reliabilityCases.length * 2);
});

test("unselected, unknown, not-applicable and explicit fields remain distinct; selection errors stay blocking", () => {
  const broad = evaluateRequest({
    clientId: "CL-001",
    scenario: "reactivate",
    motif: "jasmin",
    line: null,
  });
  assert.equal(broad.normalized.selection.motif.state, "explicit");
  assert.equal(broad.normalized.selection.line.state, "unselected");
  assert.equal(broad.normalized.selection.occasion.state, "not_applicable");
  const unknown = evaluateRequest({
    clientId: "CL-001",
    scenario: "recommend",
    motif: "unknown",
  });
  assert.equal(unknown.status, "BLOCKED");
  assert.equal(unknown.normalized.selection.motif.state, "unknown");
  for (const input of [
    { motif: "jasmin", line: "aqua" },
    { motif: "jasmin", line: "jasmin", sku: "FEU-V-R01" },
    { sku: 42 },
    { motif: false },
  ])
    assert.equal(
      evaluateRequest({ clientId: "CL-001", scenario: "recommend", ...input })
        .status,
      "BLOCKED",
    );
});
test("identical inputs resolve identically over 30 consecutive trials without changing fixtures", async () => {
  const snapshot = JSON.stringify(clients);
  const input = {
    clientId: "CL-001",
    scenario: "recommend",
    motif: "jasmin",
    line: "jasmin",
  };
  const initial = evaluateRequest(input).resolved.product.sku;
  for (let i = 0; i < 30; i++)
    assert.equal(
      evaluateRequest(structuredClone(input)).resolved.product.sku,
      initial,
    );
  assert.equal(JSON.stringify(clients), snapshot);
});
