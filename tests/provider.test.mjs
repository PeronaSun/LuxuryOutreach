import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  providerConfig,
  responsesEndpoint,
} from "../server/provider-config.mjs";
import {
  generate,
  demoCandidates,
  buildPrompt,
  structuredCall,
} from "../server/generation.mjs";
import { splitParagraphs } from "../server/message-contract.mjs";
import { evaluateRequest, createApp } from "./test-clock.mjs";

const task = {
  clientId: "CL-001",
  scenario: "recommend",
  motif: "jasmin",
  line: "jasmin",
  sku: "JAS-R01",
  occasion: "personal",
};

test("DeepSeek settings select the correct key, base URL and model without requiring OpenAI settings", () => {
  const config = providerConfig({
    DEEPSEEK_API_KEY: "fixture-only-key",
    DEEPSEEK_BASE_URL: "https://api.deepseek.com/v1/",
    DEEPSEEK_MODEL: "deepseek-flash",
  });
  assert.deepEqual(config, {
    provider: "deepseek",
    key: "fixture-only-key",
    baseUrl: "https://api.deepseek.com/v1/",
    model: "deepseek-flash",
    demo: false,
  });
  assert.equal(
    responsesEndpoint(config.baseUrl),
    "https://api.deepseek.com/v1/responses",
  );
  assert.equal(
    responsesEndpoint("https://api.deepseek.com"),
    "https://api.deepseek.com/responses",
  );
  assert.equal(
    providerConfig({ DEEPSEEK_API_KEY: "fixture" }).model,
    "deepseek-flash",
  );
  assert.equal(
    providerConfig({ DEEPSEEK_MODEL: "deepseek-v4-pro", DEMO_MODE: "false" })
      .demo,
    false,
  );
  assert.equal(
    providerConfig({ DEEPSEEK_API_KEY: "fixture", DEMO_MODE: "true" }).demo,
    true,
  );
  assert.equal(
    providerConfig({ OPENAI_API_KEY: "fixture", OPENAI_MODEL: "test-openai" })
      .provider,
    "openai",
  );
  assert.equal(
    providerConfig({
      OPENAI_API_KEY: "fixture",
      DEEPSEEK_API_KEY: "deepseek-fixture",
    }).provider,
    "deepseek",
  );
});

test("invalid or credential-bearing URLs are rejected without echoing their contents", () => {
  for (const base of [
    "not-a-url",
    "http://api.deepseek.com",
    "https://fixture-secret@api.deepseek.com",
    "https://api.deepseek.com?key=fixture-secret",
    "https://api.deepseek.com/#fixture-secret",
  ]) {
    assert.throws(
      () => responsesEndpoint(base),
      (error) =>
        !error.message.includes("fixture-secret") &&
        /地址配置无效/.test(error.message),
    );
  }
});

test("DeepSeek generation and audit use Responses with configured model and unchanged prompt/schema (mock only)", async () => {
  const ctx = evaluateRequest(task),
    candidates = demoCandidates(task, ctx),
    calls = [];
  const result = await generate(task, ctx, {
    ...providerConfig({
      DEEPSEEK_API_KEY: "fixture-key",
      DEEPSEEK_BASE_URL: "https://api.deepseek.com",
      DEEPSEEK_MODEL: "deepseek-flash",
    }),
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      assert.equal(url, "https://api.deepseek.com/responses");
      assert.equal(options.headers.Authorization, "Bearer fixture-key");
      assert.equal(body.model, "deepseek-flash");
      assert.deepEqual(body.reasoning, { effort: "none" });
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      if (calls.length === 1) {
        assert.equal(body.instructions, buildPrompt(task, ctx).instructions);
        assert.equal(body.input, buildPrompt(task, ctx).input);
      }
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          model: "deepseek-flash",
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(
                    calls.length === 1
                      ? {
                          candidates: candidates.map((c) => ({
                            style: c.style,
                            main: splitParagraphs(c.text)[1],
                            cta: splitParagraphs(c.text)[2],
                          })),
                        }
                      : { passed: true, reasons: [], findings: [] },
                  ),
                },
              ],
            },
          ],
        }),
      };
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(result.mode, "live");
  assert.equal(result.provider, "deepseek");
  assert.equal(result.model, "deepseek-flash");
  assert.equal(result.candidates.length, 3);
  assert.ok(!JSON.stringify(result).includes("fixture-key"));
});

test("provider HTTP errors expose a status but never the raw response or key and do not retry", async () => {
  let calls = 0;
  await assert.rejects(
    structuredCall({
      key: "fixture-key",
      model: "deepseek-flash",
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      fetchImpl: async () => {
        calls++;
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: "fixture-key" }),
        };
      },
    }),
    (error) =>
      error.providerStatus === 401 && !error.message.includes("fixture-key"),
  );
  assert.equal(calls, 1);
});

test("backend reports live DeepSeek and forwards server-only configuration without exposing credentials", async (t) => {
  const recordDir = await mkdtemp(join(tmpdir(), "maison-provider-"));
  let received;
  const app = createApp({
    recordDir,
    env: {
      DEEPSEEK_API_KEY: "fixture-key",
      DEEPSEEK_BASE_URL: "https://api.deepseek.com",
      DEEPSEEK_MODEL: "deepseek-flash",
    },
    generator: async (input, ctx, options) => {
      received = options;
      return {
        candidates: demoCandidates(input, ctx),
        model: options.model,
        mode: "live",
        provider: options.provider,
      };
    },
  });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.close(r));
    await rm(recordDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${app.address().port}`;
  const bootstrap = await (await fetch(base + "/api/bootstrap")).json();
  assert.equal(bootstrap.mode, "live");
  assert.equal(bootstrap.provider, "deepseek");
  assert.equal(bootstrap.model, "deepseek-flash");
  const result = await fetch(base + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  assert.equal(result.status, 200);
  assert.equal(received.key, "fixture-key");
  assert.equal(received.baseUrl, "https://api.deepseek.com");
  const records = await (await fetch(base + "/api/records")).json();
  assert.ok(
    !JSON.stringify({
      bootstrap,
      records,
      result: await result.json(),
    }).includes("fixture-key"),
  );
});
