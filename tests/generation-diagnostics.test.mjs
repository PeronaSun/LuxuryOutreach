import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, evaluateRequest } from "./test-clock.mjs";
import {
  generate,
  structuredCall,
  demoCandidates,
} from "../server/generation.mjs";
import { assessAudit } from "../server/audit-policy.mjs";
import { assessCandidates } from "../server/output-assessment.mjs";
import { splitParagraphs } from "../server/message-contract.mjs";

const task = {
  clientId: "CL-001",
  scenario: "recommend",
  motif: "jasmin",
  line: "jasmin",
  sku: "JAS-B01",
  occasion: "personal",
  notes: "客户喜欢低调、日常佩戴的珠宝，不希望设计过于夸张。",
};
const ctx = evaluateRequest(task);
const parts = () =>
  demoCandidates(task, ctx).map((c) => ({
    style: c.style,
    main: splitParagraphs(c.text)[1],
    cta: splitParagraphs(c.text)[2],
  }));
const reply = (value) => ({
  ok: true,
  status: 200,
  json: async () => ({
    status: "completed",
    output: [
      { content: [{ type: "output_text", text: JSON.stringify(value) }] },
    ],
  }),
});
const finding = (ruleId) => ({
  ruleId,
  candidateIndexes: [0],
  reason: "测试发现",
});

test("soft audit findings cannot suppress three otherwise valid messages", async () => {
  let count = 0;
  const out = await generate(task, ctx, {
    demo: false,
    key: "fixture",
    fetchImpl: async () =>
      reply(
        ++count === 1
          ? { candidates: parts() }
          : {
              passed: false,
              reasons: ["故事可再展开"],
              findings: [finding("STORY_DEPTH"), finding("STYLE_DETAIL")],
            },
      ),
  });
  assert.equal(out.candidates.length, 3);
  assert.deepEqual(
    out.warnings.map((f) => f.ruleId),
    ["STORY_DEPTH", "STYLE_DETAIL"],
  );
});

test("hard audit findings block even when the model says passed=true or also reports a soft issue", async () => {
  for (const ruleId of [
    "FACT_PRODUCT",
    "FACT_PRICE",
    "FACT_CUSTOMER",
    "PROHIBITED_CLAIM",
    "CONTEXT_IGNORED",
    "STORY_UNGROUNDED",
  ]) {
    assert.throws(
      () =>
        assessAudit({
          passed: true,
          reasons: [],
          findings: [finding("STYLE_DETAIL"), finding(ruleId)],
        }),
      (error) =>
        error.code === "AUDIT_VALIDATION" && error.ruleIds.includes(ruleId),
    );
  }
  assert.throws(
    () => assessAudit({ passed: false, reasons: ["不明确"], findings: [] }),
    (error) => error.ruleIds.includes("AUDIT_UNEXPLAINED_REJECTION"),
  );
});

test("mechanical style similarity is a warning; wrong material, price and invented claims remain blocking", () => {
  const source = demoCandidates(task, ctx);
  const same = source.map((c) => ({
    ...c,
    text: [
      splitParagraphs(c.text)[0],
      splitParagraphs(source[0].text)[1],
      splitParagraphs(c.text)[2],
    ].join("\n\n"),
  }));
  const style = assessCandidates(same, { ...ctx, input: task });
  assert.equal(style.hard.length, 0);
  assert.ok(style.warnings.some((f) => f.ruleId === "STYLE_SIMILARITY"));
  for (const [text, ruleId] of [
    ["采用18K黄金", "FACT_MATERIAL"],
    ["售价1元", "FACT_PRICE"],
    ["保证升值", "PROHIBITED_CLAIM"],
  ]) {
    const wrong = source.map((c) => ({
      ...c,
      text: c.text.replace("18K玫瑰金", text),
    }));
    assert.ok(
      assessCandidates(wrong, { ...ctx, input: task }).hard.some(
        (f) => f.ruleId === ruleId,
      ),
    );
  }
});

for (const [status, code] of [
  [401, "API_AUTH"],
  [403, "API_AUTH"],
  [402, "API_BALANCE"],
  [429, "API_RATE_LIMIT"],
  [503, "API_HTTP"],
]) {
  test(`HTTP ${status} maps to actionable ${code} without reading/logging provider error content or retrying`, async () => {
    let calls = 0;
    await assert.rejects(
      structuredCall({
        key: "fixture-secret",
        model: "deepseek-flash",
        fetchImpl: async () => {
          calls++;
          return {
            ok: false,
            status,
            json: () => {
              throw new Error("must not read provider body");
            },
          };
        },
      }),
      (error) =>
        error.code === code &&
        error.providerStatus === status &&
        !error.message.includes("fixture-secret"),
    );
    assert.equal(calls, 1);
  });
}

test("timeouts, network errors, empty, truncated, malformed and schema-invalid output have separate codes", async () => {
  for (const name of ["TimeoutError", "AbortError", "TypeError"]) {
    await assert.rejects(
      structuredCall({
        model: "test",
        fetchImpl: async () => {
          const e = new Error("fixture-secret");
          e.name = name;
          throw e;
        },
      }),
      (error) =>
        error.code === (name === "TypeError" ? "API_NETWORK" : "API_TIMEOUT") &&
        !error.message.includes("fixture-secret"),
    );
  }
  for (const [data, code] of [
    [{ status: "completed", output: [] }, "OUTPUT_EMPTY"],
    [{ status: "incomplete" }, "OUTPUT_INCOMPLETE"],
    [
      {
        status: "completed",
        output: [{ content: [{ type: "output_text", text: "not json" }] }],
      },
      "OUTPUT_SCHEMA",
    ],
    [
      {
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: '{"extra":true}' }] },
        ],
      },
      "OUTPUT_SCHEMA",
    ],
  ]) {
    await assert.rejects(
      structuredCall({
        model: "test",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { requiredField: { type: "string" } },
          required: ["requiredField"],
        },
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => data,
        }),
      }),
      (error) => error.code === code,
    );
  }
});

test("development diagnostics correlate stages/rule IDs and expose only safe actionable errors", async (t) => {
  const recordDir = await mkdtemp(join(tmpdir(), "maison-diagnostics-"));
  const events = [];
  let call = 0;
  const app = createApp({
    recordDir,
    env: {
      DEEPSEEK_API_KEY: "fixture-secret",
      DEEPSEEK_MODEL: "deepseek-flash",
      GENERATION_DIAGNOSTICS: "true",
    },
    diagnosticLogger: (event) => events.push(event),
    generator: (input, context, options) =>
      generate(input, context, {
        ...options,
        fetchImpl: async () =>
          reply(
            ++call === 1
              ? { candidates: parts() }
              : {
                  passed: false,
                  reasons: ["事实不符"],
                  findings: [finding("FACT_PRODUCT")],
                },
          ),
      }),
  });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.close(r));
    await rm(recordDir, { recursive: true, force: true });
  });
  const response = await fetch(
    `http://127.0.0.1:${app.address().port}/api/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    },
  );
  const result = await response.json();
  assert.equal(response.status, 502);
  assert.equal(result.code, "AUDIT_VALIDATION");
  assert.equal(result.stage, "brand_audit.validation");
  assert.ok(!result.stack);
  assert.equal(new Set(events.map((e) => e.requestId)).size, 1);
  assert.ok(
    events.every(
      (e) =>
        e.provider === "deepseek" &&
        e.model === "deepseek-flash" &&
        e.source === "live" &&
        e.retryCount === 0,
    ),
  );
  assert.ok(events.some((e) => e.apiSuccess && e.httpStatus === 200));
  assert.ok(events.some((e) => e.parseSuccess));
  assert.ok(events.some((e) => e.schemaSuccess));
  assert.ok(events.some((e) => e.ruleIds.includes("FACT_PRODUCT")));
  assert.ok(!JSON.stringify(events).includes("fixture-secret"));
  assert.ok(!JSON.stringify(events).includes("林女士"));
  assert.ok(!JSON.stringify(events).includes(task.notes));
  const record = JSON.parse(
    (await readFile(join(recordDir, "records.jsonl"), "utf8")).trim(),
  );
  assert.deepEqual(record.failedRuleIds, ["FACT_PRODUCT"]);
  assert.equal(record.candidates.length, 0);
});
