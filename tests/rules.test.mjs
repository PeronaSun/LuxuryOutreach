import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateRequest, validateCandidates } from "../server/rules.mjs";
import {
  demoCandidates,
  generate,
  buildPrompt,
  structuredCall,
} from "../server/generation.mjs";
import { products, lines } from "../data/catalog.mjs";
import { clients, clientProfile, DEMO_CONTEXT_DATE } from "../data/clients.mjs";
import { selectMotif, selectLine, selectProduct } from "../src/selection.mjs";
import { cases } from "./cases.mjs";
import { splitParagraphs } from "../server/message-contract.mjs";
const modelParts = (candidates) =>
  candidates.map((c) => {
    const [, main, cta] = splitParagraphs(c.text);
    return { style: c.style, main, cta };
  });
test("fixture has exactly fifty unique reproducible cases", () => {
  assert.equal(cases.length, 50);
  assert.equal(new Set(cases.map((c) => c.id)).size, 50);
  assert.equal(new Set(cases.map((c) => c.input.scenario)).size, 6);
});
for (const c of cases)
  test(`${c.id}: ${c.title}`, () => {
    const r = evaluateRequest(c.input);
    assert.equal(r.status, c.expectedStatus);
    assert.equal(r.resolved?.product?.sku || null, c.expectedSku);
    if (r.status === "READY") {
      const out = demoCandidates(c.input, r);
      assert.equal(out.length, 3);
      assert.deepEqual(validateCandidates(out, { ...r, input: c.input }), []);
    }
  });
test("all fifteen catalog rows, prices and materials trace to extracted bible", async () => {
  const source = await readFile(
    new URL("../docs/brand-bible-v1.txt", import.meta.url),
    "utf8",
  );
  assert.equal(products.length, 15);
  assert.equal(new Set(products.map((p) => p.sku)).size, 15);
  assert.equal(lines.length, 5);
  for (const l of lines)
    assert.equal(products.filter((p) => p.line === l.id).length, 3);
  for (const p of products) {
    assert.ok(source.includes(p.sku));
    assert.ok(source.includes("¥" + p.price.toLocaleString("en-US")));
    assert.ok(source.includes(p.name + "；" + p.material));
  }
});
test("parent changes clear line and SKU; optional choices toggle off", () => {
  const s = {
    motif: "jasmin",
    line: "jasmin",
    sku: "JAS-R01",
  };
  assert.deepEqual(selectMotif(s, "feuille"), {
    motif: "feuille",
    line: null,
    sku: null,
  });
  assert.equal(selectMotif(s, "jasmin").motif, null);
  assert.equal(selectLine(s, "jasmin").line, null);
  assert.equal(selectLine(s, "aqua").sku, null);
  assert.equal(selectProduct(s, "JAS-R01").sku, null);
});
test("minimal profile context excludes unrelated private data and obsolete fields", () => {
  const c = {
    ...clients[0],
    income: 1000000,
    internalCRMLabel: "high-value",
    exactBirthDate: "2026-11-11",
  };
  const profile = clientProfile(c);
  assert.equal(profile.birthMonth, 11);
  for (const key of [
    "contact",
    "permissions",
    "inquiries",
    "income",
    "internalCRMLabel",
    "exactBirthDate",
  ])
    assert.equal(Object.hasOwn(profile, key), false, key);
});
test("malformed input fails closed while birthday dates are unnecessary", () => {
  for (const input of [null, [], {}, "x"])
    assert.notEqual(evaluateRequest(input).status, "READY");
  assert.equal(
    evaluateRequest({ clientId: "CL-001", scenario: "greeting" }).status,
    "READY",
  );
});
test("scope cannot be bypassed by historical interests across all motif-line combinations", () => {
  for (const l of lines)
    for (const c of clients) {
      const r = evaluateRequest({
        clientId: c.id,
        scenario: "recommend",
        motif: l.motif,
        line: l.id,
      });
      assert.equal(r.resolved.product.line, l.id);
    }
});
test("unsupported output claims, false prices and foreign SKU are rejected", () => {
  const ctx = { ...evaluateRequest(cases[0].input), input: cases[0].input };
  const out = demoCandidates(cases[0].input, ctx);
  for (const text of [
    "为您提供折扣。",
    "现在售价 ¥9,999。",
    "建议 FEU-A-R01。",
    "这款采用18K白金。",
    "适合您28岁的女儿。",
    "您好😀",
  ]) {
    assert.ok(
      validateCandidates([{ ...out[0], text }, ...out.slice(1)], ctx).length >
        0,
      text,
    );
  }
  assert.ok(validateCandidates(out.slice(1), ctx).length);
  assert.ok(
    validateCandidates([out[0], { ...out[1], text: out[0].text }, out[2]], ctx)
      .length,
  );
});
test("prompt separates untrusted notes and contains only relevant stored client context", () => {
  const input = { ...cases[0].input, notes: "客户原话作为数据" };
  const ctx = evaluateRequest(input),
    p = buildPrompt(input, ctx),
    payload = JSON.parse(p.input);
  assert.equal(payload.untrusted_context.notes, input.notes);
  assert.equal(payload.product.sku, "JAS-R01");
  assert.ok(!p.input.includes("CL-008"));
  assert.ok(p.instructions.includes("不可信"));
});
test("live generator uses structured generation and separate audit, never demo fallback", async () => {
  let calls = 0;
  const ctx = evaluateRequest(cases[0].input),
    candidates = demoCandidates(cases[0].input, ctx);
  const fetchImpl = async (url, opts) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(opts.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    return {
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify(
                  calls === 1
                    ? { candidates: modelParts(candidates) }
                    : { passed: true, reasons: [] },
                ),
              },
            ],
          },
        ],
      }),
    };
  };
  const r = await generate(cases[0].input, ctx, {
    key: "fake-test-key",
    model: "test-model",
    demo: false,
    fetchImpl,
  });
  assert.equal(r.mode, "live");
  assert.equal(calls, 2);
  assert.equal(r.model, "test-model");
});
test("model refusal, malformed JSON, incomplete and HTTP failures are handled", async () => {
  for (const data of [
    { status: "completed", output: [{ content: [{ type: "refusal" }] }] },
    { status: "incomplete" },
    {
      status: "completed",
      output: [{ content: [{ type: "output_text", text: "no json" }] }],
    },
  ])
    await assert.rejects(
      structuredCall({
        key: "fake",
        model: "test",
        fetchImpl: async () => ({ ok: true, json: async () => data }),
      }),
    );
  await assert.rejects(
    structuredCall({
      key: "fake",
      model: "test",
      fetchImpl: async () => ({ ok: false }),
    }),
  );
});
test("failing independent audit withholds all candidates", async () => {
  let calls = 0;
  const ctx = evaluateRequest(cases[0].input),
    candidates = demoCandidates(cases[0].input, ctx);
  await assert.rejects(
    generate(cases[0].input, ctx, {
      key: "fake",
      demo: false,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          status: "completed",
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(
                    ++calls === 1
                      ? { candidates: modelParts(candidates) }
                      : { passed: false, reasons: ["测试拒绝"] },
                  ),
                },
              ],
            },
          ],
        }),
      }),
    }),
  );
});
test("missing live credentials cannot silently return template messages", async () => {
  await assert.rejects(
    generate(cases[0].input, evaluateRequest(cases[0].input), {
      key: "",
      demo: false,
    }),
  );
});

test("all fictional clients can use all six scenarios with relevant facts and no approvals", () => {
  for (const client of clients)
    for (const scenario of [
      "greeting",
      "recommend",
      "care",
      "reactivate",
      "event",
      "price",
    ]) {
      const input = {
        clientId: client.id,
        scenario,
        ...(scenario === "care" ? { purchaseId: client.purchases[0].id } : {}),
        ...(scenario === "event" ? { eventId: "EV-DEMO-01" } : {}),
        ...(scenario === "price"
          ? {
              motif: "jasmin",
              line: "jasmin",
              sku: "JAS-R01",
              concern: "想了解价格和设计。",
            }
          : {}),
      };
      const ctx = evaluateRequest(input);
      assert.equal(ctx.status, "READY", `${client.id} ${scenario}`);
      assert.deepEqual(
        validateCandidates(demoCandidates(input, ctx), { ...ctx, input }),
        [],
      );
    }
});
test("purchase records are complete, canonical, unique and historical", () => {
  const ids = new Set();
  for (const client of clients) {
    assert.ok(
      Number.isInteger(client.birthMonth) &&
        client.birthMonth >= 1 &&
        client.birthMonth <= 12,
    );
    assert.ok(!("birthDate" in client));
    for (const purchase of client.purchases) {
      assert.ok(!ids.has(purchase.id));
      ids.add(purchase.id);
      const product = products.find((p) => p.sku === purchase.sku);
      assert.ok(product);
      for (const key of ["motif", "line", "category"])
        assert.equal(purchase[key], product[key]);
      assert.equal(purchase.productName, product.name);
      assert.equal(purchase.purchasePrice, product.price);
      assert.ok(purchase.purchaseDate < DEMO_CONTEXT_DATE);
    }
  }
  const expected = {
    "CL-001": [
      ["JAS-R01", "2026-09-18"],
      ["JAS-N01", "2026-06-12"],
    ],
    "CL-002": [
      ["MUG-R-N01", "2026-08-22"],
      ["MUG-R-B01", "2026-04-15"],
    ],
    "CL-005": [
      ["FEU-A-N01", "2026-10-10"],
      ["FEU-A-R01", "2026-07-06"],
    ],
  };
  for (const [id, records] of Object.entries(expected))
    assert.deepEqual(
      clients
        .find((c) => c.id === id)
        .purchases.map((p) => [p.sku, p.purchaseDate]),
      records,
    );
});
test("aftercare prompt and candidates use exactly the selected purchase, never a different record", () => {
  for (const id of ["CL-001", "CL-002", "CL-005"])
    for (const purchase of clients.find((c) => c.id === id).purchases) {
      const input = { clientId: id, scenario: "care", purchaseId: purchase.id };
      const ctx = evaluateRequest(input);
      const prompt = JSON.parse(buildPrompt(input, ctx).input);
      assert.deepEqual(prompt.purchase, purchase);
      assert.deepEqual(prompt.client.purchases, [purchase]);
      assert.equal(prompt.product.sku, purchase.sku);
      assert.ok(
        demoCandidates(input, ctx).every(
          (c) =>
            c.text.includes(lines.find((l) => l.id === purchase.line).name) &&
            c.text.includes(purchase.category),
        ),
      );
    }
});
test("birthday month output rejects exact dates and today claims but allows new-year wishes", () => {
  const input = {
    clientId: "CL-001",
    scenario: "greeting",
    greetingKind: "birthday",
  };
  const ctx = evaluateRequest(input),
    out = demoCandidates(input, ctx);
  assert.ok(
    out.every((c) => c.text.includes("11月") && !/今天|今日|日号/.test(c.text)),
  );
  assert.deepEqual(validateCandidates(out, { ...ctx, input }), []);
  for (const text of [
    "今天是您的生日，生日快乐。",
    "今天这个特别的日子，祝您生日快乐。",
    "您的生日是11月12日。",
    "为您10月的生日送上祝福。",
    "祝您28岁生日快乐。",
  ])
    assert.ok(
      validateCandidates([{ ...out[0], text }, ...out.slice(1)], {
        ...ctx,
        input,
      }).length,
      text,
    );
});
