import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRequest } from "./test-clock.mjs";
import { generate, demoCandidates } from "../server/generation.mjs";
import { splitParagraphs } from "../server/message-contract.mjs";
import { assessCandidates } from "../server/output-assessment.mjs";
import { recoveryConfig } from "../server/recovery-policy.mjs";
import { reliabilityMetrics } from "../server/reliability-metrics.mjs";
import { buildPrompt } from "../server/generation.mjs";

const input = {
  clientId: "CL-001",
  scenario: "recommend",
  motif: "jasmin",
  line: "jasmin",
  sku: "JAS-B01",
  occasion: "personal",
  notes: "客户喜欢低调、适合日常佩戴的珠宝，不喜欢夸张的设计。",
};
const context = evaluateRequest(input);
const candidates = demoCandidates(input, context);
const parts = candidates.map((candidate) => ({
  style: candidate.style,
  main: splitParagraphs(candidate.text)[1],
  cta: splitParagraphs(candidate.text)[2],
}));
const audit = { passed: true, reasons: [], findings: [] };
const reply = (body) => ({
  ok: true,
  status: 200,
  json: async () => ({
    status: "completed",
    output: [
      { content: [{ type: "output_text", text: JSON.stringify(body) }] },
    ],
  }),
});
const requested = (body) =>
  body.text.format.schema.properties.candidates.items.properties.style.enum;
const defaults = (body) =>
  body.text.format.name === "brand_audit"
    ? audit
    : {
        candidates: parts.filter((part) =>
          requested(body).includes(part.style),
        ),
      };
const run = (fetchImpl, options = {}) =>
  generate(input, context, {
    demo: false,
    provider: "deepseek",
    key: "fixture-only",
    model: "mock-model",
    fetchImpl,
    sleep: async () => {},
    ...options,
  });

for (const variant of ["json", "schema", "truncated", "empty"])
  test(`bounded ${variant} recovery preserves the original failure and requests corrected JSON`, async () => {
    const calls = [],
      diagnostics = [];
    const result = await run(
      async (_url, options) => {
        const body = JSON.parse(options.body);
        calls.push(body);
        if (calls.length === 1)
          return {
            ok: true,
            status: 200,
            json: async () =>
              variant === "truncated"
                ? { status: "incomplete" }
                : {
                    status: "completed",
                    output: [
                      {
                        content: [
                          {
                            type: "output_text",
                            text:
                              variant === "json"
                                ? '```json\n{"candidates":[]}\n```'
                                : variant === "empty"
                                  ? " "
                                  : '{"candidates":[{"style":"concise"}]}',
                          },
                        ],
                      },
                    ],
                  },
          };
        if (body.text.format.name === "advisor_messages")
          assert.ok(JSON.parse(body.input).repairContext.previousFailure);
        return reply(defaults(body));
      },
      { onDiagnostic: (event) => diagnostics.push(event) },
    );
    assert.equal(result.candidates.length, 3);
    assert.equal(result.recovery.providerCalls, 3);
    assert.equal(result.recovery.outputRepairs, 1);
    assert.equal(result.recovery.failures.length, 1);
    assert.equal(
      result.recovery.failures[0].stage,
      variant === "schema"
        ? "advisor_messages.schema"
        : "advisor_messages.parse",
    );
    assert.ok(
      diagnostics.some(
        (event) => event.stage === "recovery.repair" && event.retryCount === 1,
      ),
    );
  });

for (const corruption of ["material", "identifier", "category"])
  test(`repair only the affected ${corruption} candidate and re-audit without changing the other messages`, async () => {
    const calls = [];
    const broken = structuredClone(parts);
    broken[1].main =
      corruption === "material"
        ? broken[1].main.replaceAll("18K玫瑰金", "18K黄金")
        : corruption === "category"
          ? broken[1].main + "这款戒指值得细看。"
          : broken[1].main + "内部编号JAS-B01。";
    const result = await run(async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (calls.length === 1) return reply({ candidates: broken });
      if (body.text.format.name === "advisor_messages") {
        assert.deepEqual(requested(body), ["detailed"]);
        const repair = JSON.parse(body.input).repairContext;
        assert.deepEqual(repair.candidateIndexes, [1]);
        assert.ok(repair.failedRuleIds.length);
      }
      return reply(defaults(body));
    });
    assert.equal(calls.length, 3);
    assert.equal(result.candidates[0].text, candidates[0].text);
    assert.equal(result.candidates[2].text, candidates[2].text);
    assert.deepEqual(
      assessCandidates(result.candidates, { ...context, input }).hard,
      [],
    );
  });

test("hard audit findings trigger a constrained repair plus a fresh audit; failing repairs stay blocked", async () => {
  const calls = [];
  const result = await run(async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (calls.length === 2)
      return reply({
        passed: false,
        reasons: ["场景细节不符"],
        findings: [
          {
            ruleId: "SCENARIO_MISMATCH",
            candidateIndexes: [2],
            reason: "测试",
          },
        ],
      });
    if (calls.length === 3) {
      assert.deepEqual(requested(body), ["elegant"]);
      assert.equal(
        JSON.parse(body.input).repairContext.untrustedFindings[0].reason,
        "测试",
      );
    }
    return reply(defaults(body));
  });
  assert.equal(result.recovery.providerCalls, 4);
  assert.equal(result.recovery.failures[0].code, "AUDIT_VALIDATION");
  let count = 0;
  await assert.rejects(
    run(async (_url, options) => {
      count++;
      const body = JSON.parse(options.body);
      return reply(
        body.text.format.name === "brand_audit"
          ? {
              passed: true,
              reasons: [],
              findings: [
                {
                  ruleId: "FACT_PRODUCT",
                  candidateIndexes: [0],
                  reason: "仍有错误",
                },
              ],
            }
          : defaults(body),
      );
    }),
    (error) =>
      error.code === "AUDIT_VALIDATION" &&
      error.recovery.providerCalls === 4 &&
      error.ruleIds.includes("FACT_PRODUCT"),
  );
  assert.equal(count, 4);
});

test("malformed audit JSON rechecks the existing candidates without another generation", async () => {
  const calls = [];
  const result = await run(async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (calls.length === 2)
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "completed", output: [] }),
      };
    return reply(defaults(body));
  });
  assert.deepEqual(
    calls.map((call) => call.text.format.name),
    ["advisor_messages", "brand_audit", "brand_audit"],
  );
  assert.equal(result.recovery.outputRepairs, 1);
});

test("transient failures use backoff, respect Retry-After and preserve the same normalized context", async () => {
  let count = 0;
  const delays = [],
    payloads = [];
  const result = await run(
    async (_url, options) => {
      count++;
      const body = JSON.parse(options.body);
      payloads.push(body);
      if (count === 1)
        return { ok: false, status: 429, headers: { get: () => "4" } };
      return reply(defaults(body));
    },
    { sleep: async (ms) => delays.push(ms) },
  );
  assert.deepEqual(delays, [4000]);
  assert.equal(result.recovery.transientRetries, 1);
  assert.equal(payloads[0].input, payloads[1].input);
  assert.equal(result.recovery.providerCalls, 3);
});

test("long Retry-After, billing/authentication and persistent malformed output do not loop", async () => {
  for (const status of [401, 402, 429]) {
    let count = 0;
    await assert.rejects(
      run(async () => {
        count++;
        return { ok: false, status, headers: { get: () => "30" } };
      }),
    );
    assert.equal(count, 1);
  }
  let count = 0;
  await assert.rejects(
    run(async () => {
      count++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "completed", output: [] }),
      };
    }),
    (error) =>
      error.code === "OUTPUT_EMPTY" && error.recovery.outputRepairs === 1,
  );
  assert.equal(count, 2);
});

test("call budget exhaustion never displays an unaudited repair", async () => {
  let count = 0;
  await assert.rejects(
    run(
      async (_url, options) => {
        count++;
        const body = JSON.parse(options.body);
        if (count === 1)
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: "incomplete" }),
          };
        return reply(defaults(body));
      },
      { recovery: { maxProviderCalls: 2 } },
    ),
    (error) =>
      error.code === "RECOVERY_BUDGET" && error.recovery.providerCalls === 2,
  );
  assert.equal(count, 2);
});

test("valid alternative CTA wording is a soft warning, and unsafe CTA remains hard", async () => {
  const good = structuredClone(parts);
  good[0].cta = "愿意的话，欢迎继续与我交流。";
  const result = await run(async (_url, options) => {
    const body = JSON.parse(options.body);
    return reply(
      body.text.format.name === "brand_audit" ? audit : { candidates: good },
    );
  });
  assert.ok(
    result.warnings.some((warning) => warning.ruleId === "CTA_WORDING"),
  );
  const unsafe = result.candidates.map((candidate, index) =>
    index
      ? candidate
      : {
          ...candidate,
          text: candidate.text.replace(good[0].cta, "请立即下单。"),
        },
  );
  assert.ok(
    assessCandidates(unsafe, { ...context, input }).hard.some(
      (finding) => finding.ruleId === "CTA_UNSAFE",
    ),
  );
});

test("gemstone negation and verified material preferences do not masquerade as SKU claims", () => {
  const modified = structuredClone(candidates);
  modified[0].text = modified[0].text.replace(
    "18K玫瑰金",
    "18K玫瑰金；不含钻石",
  );
  assert.deepEqual(assessCandidates(modified, { ...context, input }).hard, []);
  const wrong = structuredClone(candidates);
  wrong[0].text += "镶嵌钻石。";
  assert.ok(assessCandidates(wrong, { ...context, input }).hard.length);
});

test("configuration and metric denominators are bounded and distinguish retries from final failures", () => {
  const config = recoveryConfig({
    GENERATION_MAX_PROVIDER_CALLS: "999",
    GENERATION_MAX_TRANSIENT_RETRIES: "-2",
  });
  assert.equal(config.maxProviderCalls, 8);
  assert.equal(config.maxTransientRetries, 0);
  const metrics = reliabilityMetrics([
    {
      attempted: true,
      succeeded: true,
      scenario: "recommend",
      recovery: {
        retryCount: 1,
        failures: [
          {
            code: "OUTPUT_SCHEMA",
            stage: "advisor_messages.parse",
            ruleIds: [],
          },
        ],
      },
    },
    {
      attempted: true,
      succeeded: false,
      scenario: "care",
      recovery: {
        retryCount: 1,
        failures: [
          {
            code: "AUDIT_VALIDATION",
            stage: "brand_audit.validation",
            ruleIds: ["FACT_PRODUCT"],
          },
        ],
      },
    },
  ]);
  assert.deepEqual(metrics.successfulGenerationRate, {
    numerator: 1,
    denominator: 2,
    rate: 0.5,
  });
  assert.deepEqual(metrics.retryRecoveryRate, {
    numerator: 1,
    denominator: 2,
    rate: 0.5,
  });
});

test("greeting/event prompts do not reintroduce unrelated historical products through nested context", () => {
  const greeting = {
    clientId: "CL-002",
    scenario: "greeting",
    greetingKind: "festival",
    greetingName: "圣诞节",
    notes: "客户刚完成一个项目，最近比较忙。",
  };
  const event = {
    clientId: "CL-001",
    scenario: "event",
    motif: "muguet",
    eventId: "EV-DEMO-01",
  };
  for (const task of [greeting, event]) {
    const ctx = evaluateRequest(task),
      payload = JSON.parse(buildPrompt(task, ctx).input);
    assert.equal(
      ctx.client.history.length > 0,
      true,
      "CRM snapshot remains intact",
    );
    assert.deepEqual(payload.client.history, []);
    assert.deepEqual(payload.normalizedContext.conversationHistory, []);
    assert.equal(payload.product, null);
    assert.ok(
      !JSON.stringify(payload.client).includes(
        task.scenario === "greeting" ? "海蓝宝" : "茉莉",
      ),
    );
  }
});

test("repair guidance explains gemstone rules instead of asking for an unchanged retry", async () => {
  let calls = 0;
  const broken = structuredClone(parts);
  broken[1].main += "这款还镶嵌海蓝宝。";
  await run(async (_url, options) => {
    const body = JSON.parse(options.body);
    calls++;
    if (calls === 1) return reply({ candidates: broken });
    if (body.text.format.name === "advisor_messages") {
      const repair = JSON.parse(body.input).repairContext;
      assert.ok(
        repair.corrections.some(
          (correction) =>
            correction.ruleId === "FACT_GEMSTONE" &&
            correction.action.includes("gemstone"),
        ),
      );
    }
    return reply(defaults(body));
  });
});

test("invalid provider configuration is not treated as a transient network failure", async () => {
  let calls = 0;
  await assert.rejects(
    run(
      async () => {
        calls++;
      },
      { baseUrl: "not-a-url" },
    ),
    (error) =>
      error.code === "API_CONFIG" && error.recovery.transientRetries === 0,
  );
  assert.equal(calls, 0);
});
