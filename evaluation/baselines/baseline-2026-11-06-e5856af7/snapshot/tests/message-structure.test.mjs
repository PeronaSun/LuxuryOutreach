import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { clients } from "../data/clients.mjs";
import { motifs, lines, products } from "../data/catalog.mjs";
import {
  evaluateRequest,
  validateCandidates,
  validateMessage,
} from "../server/rules.mjs";
import {
  demoCandidates,
  buildPrompt,
  generate,
} from "../server/generation.mjs";
import {
  splitParagraphs,
  messagePlan,
  greetingFor,
} from "../server/message-contract.mjs";

const selected = (sku, extra = {}) => {
  const p = products.find((p) => p.sku === sku);
  return {
    clientId: "CL-001",
    scenario: "recommend",
    motif: p.motif,
    line: p.line,
    sku,
    ...extra,
  };
};

test("A/B: all candidates have exactly three paragraphs and the correct dedicated advisor", () => {
  const required = {
    "CL-001": "Sophie",
    "CL-002": "Camille",
    "CL-005": "Claire",
  };
  for (const client of clients) {
    assert.ok(client.assignedAdvisor);
    if (required[client.id])
      assert.equal(client.assignedAdvisor, required[client.id]);
    const input = { clientId: client.id, scenario: "greeting" },
      ctx = evaluateRequest(input);
    for (const c of demoCandidates(input, ctx)) {
      const p = splitParagraphs(c.text);
      assert.equal(p.length, 3);
      assert.equal(p[0], greetingFor(client));
      assert.equal((c.text.match(/Bonjour/g) || []).length, 1);
      assert.ok(!/Greeting:|Product Story:|CTA:/.test(c.text));
    }
  }
});

test("C: every retrieved Motif and Line story is verbatim source content, for all 15 SKUs", async () => {
  const bible = await readFile(
    new URL("../docs/brand-bible-v1.txt", import.meta.url),
    "utf8",
  );
  for (const item of [...motifs, ...lines])
    assert.ok(bible.includes(item.story), item.id);
  for (const product of products) {
    const input = selected(product.sku),
      ctx = evaluateRequest(input),
      payload = JSON.parse(buildPrompt(input, ctx).input);
    assert.equal(payload.messagePlan.story.motif.id, product.motif);
    assert.equal(payload.messagePlan.story.line.id, product.line);
    assert.deepEqual(payload.messagePlan.story.product, product);
    assert.deepEqual(
      validateCandidates(demoCandidates(input, ctx), { ...ctx, input }),
      [],
    );
  }
});

test("C: Jasmin, Muguet and Feuille middle paragraphs use their own imagery", () => {
  for (const [sku, expected, excluded] of [
    ["JAS-R01", "茉莉", "铃兰"],
    ["MUG-R-R01", "铃兰", "茉莉"],
    ["MUG-C-R01", "铃兰", "茉莉"],
    ["FEU-V-R01", "叶", "海蓝宝"],
    ["FEU-A-R01", "海蓝宝", "茉莉"],
  ]) {
    const input = selected(sku),
      ctx = evaluateRequest(input);
    for (const c of demoCandidates(input, ctx)) {
      const main = splitParagraphs(c.text)[1];
      assert.ok(main.includes(expected));
      assert.ok(!main.includes(excluded));
    }
  }
});

test("D: main paragraphs differ in focus, factual detail and restrained imagery", () => {
  for (const p of products) {
    const input = selected(p.sku),
      ctx = evaluateRequest(input),
      m = demoCandidates(input, ctx).map((c) => splitParagraphs(c.text)[1]);
    assert.ok(m[0].length < m[1].length, p.sku);
    assert.ok(m[0].length < m[2].length, p.sku);
    assert.ok(m[1].includes(p.material) && m[1].includes(p.name));
    assert.ok(m[1].includes(messagePlan(input, ctx).story.line.story));
    assert.equal(new Set(m).size, 3);
  }
});

test("E: the same SKU meaningfully changes its middle paragraph for self, wedding and gift", () => {
  const mains = [];
  for (const [occasion, word] of [
    ["personal", /个人风格|个人表达|自己的表达/],
    ["wedding", /庆祝/],
    ["gift", /心意/],
  ]) {
    const input = selected("JAS-R01", { occasion }),
      ctx = evaluateRequest(input),
      out = demoCandidates(input, ctx);
    assert.ok(out.every((c) => word.test(splitParagraphs(c.text)[1])));
    assert.ok(out.every((c) => !/新娘|新郎|您的丈夫|您的妻子/.test(c.text)));
    assert.equal(ctx.resolved.product.sku, "JAS-R01");
    assert.ok(
      JSON.parse(buildPrompt(input, ctx).input).messagePlan.occasion.direction,
    );
    mains.push(out.map((c) => splitParagraphs(c.text)[1]));
  }
  for (let i = 0; i < 3; i++)
    assert.equal(new Set(mains.map((m) => m[i])).size, 3);
});

test("F/G: all scenarios use the structure and appropriate non-promissory endings", () => {
  const inputs = [
    { scenario: "greeting" },
    { scenario: "greeting", greetingKind: "festival", greetingName: "中秋节" },
    selected("JAS-R01"),
    { scenario: "care", purchaseId: "PUR-001-02" },
    { scenario: "reactivate" },
    { scenario: "event", eventId: "EV-DEMO-01" },
    selected("JAS-R01", {
      scenario: "price",
      concern: "价格高于预期，想了解材质。",
    }),
  ];
  for (const raw of inputs) {
    const input = { clientId: "CL-001", ...raw },
      ctx = evaluateRequest(input),
      plan = messagePlan(input, ctx),
      out = demoCandidates(input, ctx);
    assert.equal(ctx.status, "READY");
    assert.deepEqual(validateCandidates(out, { ...ctx, input }), []);
    for (const c of out) {
      const [, main, cta] = splitParagraphs(c.text);
      assert.ok(plan.ctaOptions.includes(cta));
      assert.ok(!/备妥|准备好|预留|预约|档期|席位|折扣|优惠/.test(cta));
      if (input.scenario === "greeting")
        assert.ok(!/18K|Jasmin|Rosée|Aqua|戒指|项链/.test(main));
      if (input.scenario === "care")
        assert.ok(main.includes("项链") && main.includes("佩戴"));
      if (input.scenario === "price")
        assert.ok(main.startsWith("理解") || main.startsWith("价格"));
      if (input.scenario === "event")
        assert.ok(
          main.includes(ctx.event.date) && main.includes(ctx.event.location),
        );
    }
    assert.equal(new Set(out.map((c) => splitParagraphs(c.text)[2])).size, 3);
  }
});

test("malformed structure, wrong advisor, duplicate bodies, headings and unsafe screenshot claims are rejected", () => {
  const input = selected("JAS-R01"),
    ctx = { ...evaluateRequest(input), input },
    out = demoCandidates(input, ctx);
  for (const text of [
    out[0].text.replaceAll("\n\n", " "),
    [
      splitParagraphs(out[0].text)[0],
      "Only an English body.",
      splitParagraphs(out[0].text)[2],
    ].join("\n\n"),
    out[0].text + "\n\n第四段",
    out[0].text.replace("Sophie", "Camille"),
    out[0].text.replace("Bonjour", "您好"),
    out[0].text.replace("Jasmin Étoilé", "光之铃兰"),
    out[0].text.replace(
      "如您感兴趣，欢迎随时与我聊聊作品细节。",
      "专属藏品已为您备妥，欢迎到店品鉴。",
    ),
    out[0].text.replace("\n\nJasmin", "\n\nProduct Story: Jasmin"),
  ])
    assert.ok(validateMessage(text, ctx).length, text);
  const sameBody = out.map((c) => ({
    ...c,
    text: [
      splitParagraphs(c.text)[0],
      splitParagraphs(out[0].text)[1],
      splitParagraphs(c.text)[2],
    ].join("\n\n"),
  }));
  assert.ok(
    validateCandidates(sameBody, ctx).includes("三种风格的正文过于相似。"),
  );
});

test("live generation uses structured main/CTA fields, trusted introduction, retrieved stories and factual audit", async () => {
  const input = selected("JAS-R01", {
      occasion: "wedding",
      assignedAdvisor: "Spoof",
    }),
    ctx = evaluateRequest(input);
  const demo = demoCandidates(input, ctx),
    calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    const content =
      calls.length === 1
        ? {
            candidates: demo.map((c) => {
              const [, main, cta] = splitParagraphs(c.text);
              return { style: c.style, main, cta };
            }),
          }
        : { passed: true, reasons: [] };
    return {
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(content) }] },
        ],
      }),
    };
  };
  const result = await generate(input, ctx, {
    demo: false,
    key: "test-key",
    model: "test-model",
    fetchImpl,
  });
  assert.equal(result.mode, "live");
  assert.equal(calls.length, 2);
  const payload = JSON.parse(calls[0].input);
  assert.ok(payload.messagePlan.greeting.includes("Sophie"));
  assert.ok(!payload.messagePlan.greeting.includes("Spoof"));
  assert.ok(payload.messagePlan.story.motif.story.includes("黄昏"));
  assert.equal(payload.messagePlan.occasion.id, "wedding");
  assert.deepEqual(
    calls[0].text.format.schema.properties.candidates.items.required,
    ["style", "main", "cta"],
  );
  assert.ok(calls[1].instructions.includes("实际concern"));
  assert.deepEqual(
    validateCandidates(result.candidates, { ...ctx, input }),
    [],
  );
});

test("live mode withholds output if a model puts extra paragraphs into its main", async () => {
  const input = selected("JAS-R01"),
    ctx = evaluateRequest(input),
    out = demoCandidates(input, ctx);
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      status: "completed",
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                candidates: out.map((c) => ({
                  style: c.style,
                  main: "正文一\n正文二",
                  cta: splitParagraphs(c.text)[2],
                })),
              }),
            },
          ],
        },
      ],
    }),
  });
  await assert.rejects(
    generate(input, ctx, { demo: false, key: "test", fetchImpl }),
    /格式无效/,
  );
});
