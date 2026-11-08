import test from "node:test";
import assert from "node:assert/strict";
import { clients, clientProfile } from "../data/clients.mjs";
import { products } from "../data/catalog.mjs";
import fixture from "../data/platform-predictions.json" with { type: "json" };
import { simulatePredictions } from "../data/prediction-simulation.mjs";
import { resolveProduct } from "../server/product-selection.mjs";
import { evaluateRequest, validateMessage } from "../server/rules.mjs";
import {
  buildPrompt,
  demoCandidates,
  generate,
} from "../server/generation.mjs";
import { auditInstructions } from "../server/audit-policy.mjs";
const task = (extra = {}) => ({
  clientId: "CL-001",
  scenario: "recommend",
  ...extra,
});
const requestedPredictions = {
  "CL-001": "JAS-B01",
  "CL-004": "MUG-R-B01",
  "CL-008": "FEU-A-B01",
};
test("three requested bracelet predictions replace prior arrays; the other six retain seeded predictions", () => {
  assert.equal(clients.length, 9);
  const seeded = simulatePredictions(clients, products, fixture.seed);
  for (const client of clients) {
    if (requestedPredictions[client.id]) {
      assert.deepEqual(
        client.predictedInterests.map((p) => p.sku),
        [requestedPredictions[client.id]],
      );
      assert.equal(client.predictedInterests[0].rank, 1);
      assert.equal(client.predictedInterests[0].version, fixture.version);
      assert.equal(
        products.find((p) => p.sku === client.predictedInterests[0].sku)
          .category,
        "手镯",
      );
    } else {
      assert.deepEqual(client.predictedInterests, seeded[client.id], client.id);
    }
  }
});
test("all nine clients have persisted, canonical simulated predictions", () => {
  assert.equal(clients.length, 9);
  for (const c of clients) {
    assert.ok(
      c.predictedInterests.length >= 1 && c.predictedInterests.length <= 3,
    );
    assert.equal(
      new Set(c.predictedInterests.map((p) => p.sku)).size,
      c.predictedInterests.length,
    );
    for (const [index, p] of c.predictedInterests.entries()) {
      assert.equal(p.rank, index + 1);
      assert.equal(p.source, "simulated_platform_prediction");
      assert.equal(p.isSimulated, true);
      assert.ok(p.rationale);
      assert.ok(
        products.some(
          (s) => s.sku === p.sku && s.line === p.line && s.motif === p.motif,
        ),
      );
    }
    assert.deepEqual(clientProfile(c).predictedInterests, c.predictedInterests);
  }
});
test("Motif-only and Line-only resolve the highest-ranked matching prediction without altering selections", () => {
  for (const input of [
    task({ motif: "jasmin" }),
    task({ motif: "jasmin", line: "jasmin" }),
  ]) {
    const before = structuredClone(input);
    const ctx = evaluateRequest(input);
    assert.equal(ctx.status, "READY");
    assert.equal(ctx.resolved.product.sku, "JAS-B01");
    assert.equal(ctx.resolved.source, "simulated_platform_prediction");
    assert.equal(ctx.normalized.selection.sku.value, null);
    assert.equal(ctx.normalized.selection.line.value, input.line || null);
    assert.deepEqual(input, before);
  }
});
test("explicit SKU overrides prediction rank and canonical facts override untrusted metadata", () => {
  const ctx = evaluateRequest(
    task({ motif: "jasmin", line: "jasmin", sku: "JAS-N01" }),
  );
  assert.equal(ctx.resolved.product.sku, "JAS-N01");
  assert.equal(ctx.resolved.source, "ca_sku");
  assert.equal(ctx.resolved.prediction, null);
  const c = structuredClone(clients[0]);
  c.predictedInterests[0].line = "aqua";
  assert.equal(resolveProduct(task({ motif: "jasmin" }), c).product, null);
  c.predictedInterests.push({ ...fixture.clients["CL-001"][0], rank: 2 });
  const r = resolveProduct(task({ motif: "jasmin" }), c);
  assert.equal(r.product.sku, "JAS-B01");
  assert.equal(
    r.product,
    products.find((p) => p.sku === "JAS-B01"),
  );
});
test("predictions outside CA scope are ignored; no history/alphabetical fallback is used", () => {
  for (const input of [
    task({ motif: "muguet" }),
    task({ motif: "feuille", line: "aqua" }),
  ]) {
    const ctx = evaluateRequest(input);
    assert.equal(ctx.status, "READY");
    assert.equal(ctx.resolved.product, null);
    assert.equal(ctx.normalized.grounding.level, input.line ? "line" : "motif");
    assert.equal(ctx.resolved.source, "scope_only");
    const out = demoCandidates(input, ctx);
    assert.ok(
      out.every((c) => validateMessage(c.text, { ...ctx, input }).length === 0),
    );
  }
  const empty = { ...clients[0], predictedInterests: [] };
  assert.equal(resolveProduct(task(), empty).product, null);
});
test("ranking is numeric and only in-scope predictions participate", () => {
  const c = {
    ...clients[0],
    predictedInterests: [
      { ...fixture.clients["CL-001"][0], sku: "JAS-N01", rank: 9 },
      { ...fixture.clients["CL-002"][0], rank: 1 },
      { ...fixture.clients["CL-001"][0], rank: 2 },
    ],
  };
  assert.equal(
    resolveProduct(task({ motif: "jasmin" }), c).product.sku,
    "JAS-B01",
  );
  assert.equal(resolveProduct(task(), c).product.sku, "FEU-A-N01");
});
test("scenario relevance preserves greetings/events/general-price and prioritizes care purchases", () => {
  const c = clients[0];
  assert.equal(resolveProduct(task(), c).product.sku, "JAS-B01");
  assert.equal(
    resolveProduct(task({ scenario: "reactivate" }), c).product.sku,
    "JAS-B01",
  );
  for (const scenario of ["greeting", "event"])
    assert.equal(resolveProduct(task({ scenario }), c).product, null);
  assert.equal(
    resolveProduct(
      task({
        scenario: "price",
        concern: "为什么不同作品价格差异这么大？",
        motif: "jasmin",
      }),
      c,
    ).product,
    null,
  );
  assert.equal(
    resolveProduct(
      task({
        scenario: "price",
        concern: "想了解这个系列的材质与价格",
        motif: "jasmin",
      }),
      c,
    ).product.sku,
    "JAS-B01",
  );
  const care = resolveProduct(
    task({
      scenario: "care",
      purchaseId: "PUR-001-02",
      motif: "feuille",
      sku: "FEU-V-R01",
    }),
    c,
  );
  assert.equal(care.product.sku, "JAS-N01");
  assert.equal(care.source, "verified_purchase");
});
test("strong explicit restrictions filter automatic predictions and block conflicting manual SKU without replacing it", () => {
  const onlyWhite = clients.find((c) => c.id === "CL-003");
  assert.ok(
    onlyWhite.predictedInterests.every(
      (p) => products.find((s) => s.sku === p.sku).material === "18K白金",
    ),
  );
  const automatic = evaluateRequest(task({ clientId: "CL-003" }));
  assert.equal(automatic.resolved.product.material, "18K白金");
  const input = task({
    clientId: "CL-003",
    motif: "jasmin",
    line: "jasmin",
    sku: "JAS-R01",
  });
  const ctx = evaluateRequest(input);
  assert.equal(ctx.status, "NEEDS_REVIEW");
  assert.equal(ctx.resolved.product.sku, "JAS-R01");
  assert.ok(ctx.issues.some((i) => i.code === "explicit-restriction-conflict"));
  const narrowed = evaluateRequest(
    task({ motif: "jasmin", notes: "客户只考虑白金。" }),
  );
  assert.equal(narrowed.resolved.product, null);
  assert.equal(narrowed.resolved.source, "scope_only");
  const impossible = evaluateRequest(
    task({ motif: "jasmin", line: "jasmin", notes: "客户只考虑黄金。" }),
  );
  assert.equal(impossible.resolved.product, null);
  assert.equal(impossible.status, "READY");
});
test("prediction provenance reaches both generation and factual audit without manufacturing customer facts", () => {
  const input = task({ clientId: "CL-009" });
  const ctx = evaluateRequest(input);
  const payload = JSON.parse(buildPrompt(input, ctx).input);
  assert.equal(payload.product.sku, "FEU-V-N01");
  assert.equal(
    payload.productRecommendation.source,
    "simulated_platform_prediction",
  );
  assert.equal(
    payload.normalizedContext.grounding.recommendationSource.isSimulated,
    true,
  );
  assert.deepEqual(payload.client.interests, []);
  assert.deepEqual(payload.client.history, []);
  assert.ok(auditInstructions.includes("不是已核实的客户偏好"));
  const base = demoCandidates(input, ctx)[0].text;
  for (const sentence of [
    "您之前说过喜欢这条项链。",
    "您已购买这款作品。",
    "您已经购买了这条项链。",
    "您上次购入这件作品。",
    "您一直偏爱蔚蓝叶语。",
  ]) {
    const [first, main, last] = base.split("\n\n");
    assert.ok(
      validateMessage([first, sentence + main, last].join("\n\n"), {
        ...ctx,
        input,
      }).includes("平台模拟预测不能冒充客户明确偏好或购买事实。"),
      sentence,
    );
  }
  assert.ok(
    !validateMessage(base, { ...ctx, input }).includes(
      "平台模拟预测不能冒充客户明确偏好或购买事实。",
    ),
  );
});
test("all client predictions reach structured generation and audit as simulated provenance, using mock replies only", async () => {
  for (const c of clients) {
    const input = task({ clientId: c.id }),
      ctx = evaluateRequest(input),
      parts = demoCandidates(input, ctx).map((candidate) => ({
        style: candidate.style,
        main: candidate.text.split("\n\n")[1],
        cta: candidate.text.split("\n\n")[2],
      }));
    const calls = [];
    const result = await generate(input, ctx, {
      provider: "deepseek",
      model: "fixture-only",
      key: "fixture-only",
      demo: false,
      fetchImpl: async (_, options) => {
        const request = JSON.parse(options.body),
          payload = JSON.parse(request.input);
        calls.push(request);
        assert.equal(
          payload.productRecommendation.source,
          "simulated_platform_prediction",
        );
        assert.equal(payload.product.sku, c.predictedInterests[0].sku);
        const body =
          request.text.format.name === "brand_audit"
            ? { passed: true, reasons: [], findings: [] }
            : { candidates: parts };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "completed",
            output: [
              {
                content: [{ type: "output_text", text: JSON.stringify(body) }],
              },
            ],
          }),
        };
      },
    });
    assert.equal(calls.length, 2);
    assert.equal(result.candidates.length, 3);
  }
});

test("updated predictions respect Motif, Line, explicit SKU, and purchase priority for all three clients", () => {
  for (const [clientId, sku] of Object.entries(requestedPredictions)) {
    const product = products.find((p) => p.sku === sku);
    for (const scope of [
      {},
      { motif: product.motif },
      { motif: product.motif, line: product.line },
    ]) {
      const input = task({ clientId, ...scope });
      const before = structuredClone(input);
      const ctx = evaluateRequest(input);
      assert.equal(ctx.status, "READY");
      assert.equal(ctx.resolved.product, product);
      assert.equal(ctx.resolved.source, "simulated_platform_prediction");
      assert.deepEqual(input, before);
    }
    const explicit = products.find(
      (p) => p.line === product.line && p.sku !== sku,
    );
    const pinned = evaluateRequest(
      task({
        clientId,
        motif: product.motif,
        line: product.line,
        sku: explicit.sku,
      }),
    );
    assert.equal(pinned.resolved.product, explicit);
    assert.equal(pinned.resolved.source, "ca_sku");
    const outside = products.find((p) => p.motif !== product.motif);
    const scoped = evaluateRequest(
      task({ clientId, motif: outside.motif, line: outside.line }),
    );
    assert.equal(scoped.resolved.product, null);
    assert.equal(scoped.resolved.source, "scope_only");
    const client = clients.find((c) => c.id === clientId);
    const purchase = client.purchases[0];
    const care = evaluateRequest(
      task({ clientId, scenario: "care", purchaseId: purchase.id }),
    );
    assert.equal(care.resolved.product.sku, purchase.sku);
    assert.equal(care.resolved.source, "verified_purchase");
  }
});
