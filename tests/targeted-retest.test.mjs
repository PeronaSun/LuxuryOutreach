import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventFactsPresent } from "../server/scenario-facts.mjs";
import { deterministicEvaluationV2 } from "../evaluation/final-v1/deterministic-v2.mjs";
import { generate, demoCandidates } from "../server/generation.mjs";
import { evaluateRequest, validateMessage } from "../server/rules.mjs";
import { auditInstructions } from "../server/audit-policy.mjs";
const records = JSON.parse(
  readFileSync(
    "deliverables/live-evaluation-2026-11-07T19-57-17-059Z-88a109ee/records.json",
  ),
);
const event = records.find((r) => r.id === "F-037").context.event;
test("known historic motif reference is distinct from attributing a foreign story to the selected SKU", () => {
  const record = records.find((r) => r.id === "F-017"),
    ctx = { ...record.context, input: record.input };
  const base = demoCandidates(record.input, record.context)[0].text;
  const known = base.replace("\n\n", "\n\n您喜欢星夜茉莉，");
  assert.ok(
    !validateMessage(known, ctx).includes("正文引用了其他自然意象的故事。"),
  );
  const wrong = base.replace("\n\n", "\n\n这款手镯采用茉莉意象，");
  assert.ok(
    validateMessage(wrong, ctx).includes("正文引用了其他自然意象的故事。"),
  );
  const unknown = { ...ctx, client: { ...ctx.client, interests: [] } };
  assert.ok(
    validateMessage(known, unknown).includes("正文引用了其他自然意象的故事。"),
  );
  assert.ok(
    auditInstructions.includes("notes为空或hasNotes=false仅表示没有新备注"),
  );
  assert.ok(
    auditInstructions.includes(
      "client.latestPreference、client.interests、client.history和purchase都是已核实CRM事实",
    ),
  );
});
test("event venue/address order is irrelevant but every canonical component remains required", () => {
  const prefix = "自然意象 · 珠宝设计分享，12月12日下午两点，";
  for (const location of [
    "虚构体验空间 · 上海示例路18号",
    "上海示例路18号的虚构体验空间",
    "虚构体验空间（上海示例路18号）",
  ])
    assert.equal(eventFactsPresent(prefix + location, event), true);
  for (const location of [
    "上海示例路18号",
    "虚构体验空间 · 上海示例路19号",
    "其他空间 · 上海示例路18号",
  ])
    assert.equal(eventFactsPresent(prefix + location, event), false);
  assert.equal(
    eventFactsPresent(
      prefix.replace("12月12日", "12月13日") + event.location,
      event,
    ),
    false,
  );
  assert.equal(
    eventFactsPresent(
      prefix.replace("下午两点", "13:00") + event.location,
      event,
    ),
    false,
  );
  assert.equal(
    eventFactsPresent("2025-12-12 14:00 " + event.name + event.location, event),
    false,
  );
});
test("actual original event records distinguish pure false positives from mixed factual defects", () => {
  const result = (id) => {
    const r = records.find((r) => r.id === id);
    return deterministicEvaluationV2(r.messages, r.context, r.input);
  };
  assert.equal(result("F-037").passed, true);
  for (const id of ["F-039", "F-041"]) {
    assert.equal(result(id).passed, false);
    assert.ok(
      result(id).hard.some((f) => f.ruleId === "EVENT_UNVERIFIED_AGENDA"),
    );
    assert.ok(
      !result(id).hard.some((f) => f.ruleId === "EVENT_REQUIRED_DETAILS"),
    );
  }
  const last = result("F-042");
  for (const rule of [
    "EVENT_REQUIRED_DETAILS",
    "EVENT_UNVERIFIED_AGENDA",
    "FACT_CUSTOMER_HISTORY",
  ])
    assert.ok(last.hard.some((f) => f.ruleId === rule));
});
test("repair instructions agree with a one-style schema and preserve unaffected candidates", async () => {
  const input = {
    clientId: "CL-001",
    scenario: "recommend",
    motif: "jasmin",
    line: "jasmin",
    sku: "JAS-B01",
  };
  const ctx = evaluateRequest(input);
  const fixture = demoCandidates(input, ctx);
  const parts = fixture.map((c) => ({
    style: c.style,
    main: c.text.split("\n\n")[1],
    cta: c.text.split("\n\n")[2],
  }));
  let calls = 0;
  const result = await generate(input, ctx, {
    provider: "deepseek",
    key: "fixture-only",
    model: "fixture",
    demo: false,
    fetchImpl: async (_, options) => {
      const body = JSON.parse(options.body);
      calls++;
      let data;
      if (body.text.format.name === "brand_audit")
        data = { passed: true, reasons: [], findings: [] };
      else if (calls === 1) {
        data = { candidates: structuredClone(parts) };
        data.candidates[1].main += "这款采用18K黄金。";
      } else {
        assert.deepEqual(
          body.text.format.schema.properties.candidates.items.properties.style
            .enum,
          ["detailed"],
        );
        assert.ok(
          !body.instructions.includes(
            "恰好三条，顺序concise、detailed、elegant。",
          ),
        );
        assert.ok(body.instructions.includes("候选数量必须为1"));
        data = { candidates: [parts[1]] };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "completed",
          output: [
            { content: [{ type: "output_text", text: JSON.stringify(data) }] },
          ],
        }),
      };
    },
  });
  assert.equal(calls, 3);
  assert.equal(result.candidates[0].text, fixture[0].text);
  assert.equal(result.candidates[2].text, fixture[2].text);
});
