import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Readable } from "node:stream";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVercelHandler } from "../server/vercel-adapter.mjs";
import { requestAllowed } from "../server/request-policy.mjs";
import { generate, demoCandidates } from "../server/generation.mjs";
import { splitParagraphs } from "../server/message-contract.mjs";

const host = "luxury-outreach.vercel.app";
const origin = `https://${host}`;
const task = { clientId: "CL-001", scenario: "recommend", motif: "jasmin" };
const clock = () => new Date("2026-11-06T04:00:00Z");
async function setup(t, options = {}, decorate = (req) => req) {
  const dir = await mkdtemp(join(tmpdir(), "maison-vercel-test-"));
  const handle = createVercelHandler({
    recordDir: dir,
    env: { DEMO_MODE: "true" },
    clock,
    ...options,
  });
  const server = http.createServer((req, res) => handle(decorate(req), res));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    dir,
    request: (path, body, extra = {}) =>
      new Promise((resolve, reject) => {
        // Node fetch may normalize Host; raw HTTP models Vercel's public Host.
        const req = http.request(
          base + path,
          {
            method: body === undefined ? "GET" : "POST",
            headers: {
              Host: host,
              Origin: origin,
              ...(body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
              ...extra,
            },
          },
          (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () =>
              resolve(
                new Response(Buffer.concat(chunks), {
                  status: res.statusCode,
                  headers: res.headers,
                }),
              ),
            );
            res.on("error", reject);
          },
        );
        req.on("error", reject);
        req.end(body === undefined ? undefined : JSON.stringify(body));
      }),
  };
}

test("deployed API boots and supports selection, generation, editing, Journal and export through rewrites", async (t) => {
  const { request } = await setup(t);
  const bootstrap = await request("/api/index?__route=bootstrap");
  assert.equal(bootstrap.status, 200);
  assert.match(bootstrap.headers.get("content-type"), /application\/json/);
  const data = await bootstrap.json();
  assert.equal(data.clients.length, 9);
  assert.equal(data.products.length, 15);
  assert.equal(data.clients[0].predictedInterests[0].sku, "JAS-B01");
  assert.deepEqual(data.journalStorage, { kind: "temporary", durable: false });
  assert.ok(!JSON.stringify(data).includes("API_KEY"));
  const validation = await request("/api/index?__route=validate", task);
  assert.equal(validation.status, 200);
  assert.equal((await validation.json()).resolvedProduct.sku, "JAS-B01");
  const response = await request("/api/index?__route=generate", task);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, "demo");
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(
    result.candidates.map((c) => c.style),
    ["concise", "detailed", "elegant"],
  );
  for (const c of result.candidates) {
    const paragraphs = splitParagraphs(c.text);
    assert.equal(paragraphs.length, 3);
    assert.ok(paragraphs.every((p) => /[\u4e00-\u9fff]/.test(p)));
  }
  const review = await request("/api/index?__route=review", {
    ...task,
    text: result.candidates[0].text,
  });
  assert.equal(review.status, 200);
  assert.deepEqual((await review.json()).errors, []);
  const records = await (await request("/api/index?__route=records")).json();
  assert.equal(records.records.length, 1);
  assert.deepEqual(records.records[0].candidates, result.candidates);
  // Also handle platforms which preserve the original URL after rewriting.
  assert.equal((await request("/api/bootstrap")).status, 200);
  assert.equal((await request("/api/index?__route=missing")).status, 404);
  assert.equal(
    (
      await request("/api/validate", task, {
        Origin: "https://attacker.example",
      })
    ).status,
    403,
  );
});

test("Vercel pre-parsed request bodies preserve schema errors and byte limits", async (t) => {
  const { request } = await setup(t, {}, (req) => {
    const body = req.headers["x-test-parsed-body"];
    if (body !== undefined) {
      // An already consumed stream with the same parsed property Vercel supplies.
      req.resume();
      const parsed = Readable.from([]);
      Object.assign(parsed, {
        url: req.url,
        method: req.method,
        headers: req.headers,
      });
      if (body === "throw")
        Object.defineProperty(parsed, "body", {
          get() {
            throw new Error("malformed JSON");
          },
        });
      else parsed.body = JSON.parse(body);
      return parsed;
    }
    return req;
  });
  for (const body of [task, JSON.stringify(task)]) {
    const r = await request(
      "/api/index?__route=validate",
      {},
      { "x-test-parsed-body": JSON.stringify(body) },
    );
    assert.equal(r.status, 200);
    assert.equal((await r.json()).resolvedProduct.sku, "JAS-B01");
  }
  for (const body of [[], null, "not JSON"]) {
    assert.equal(
      (
        await request(
          "/api/validate",
          {},
          { "x-test-parsed-body": JSON.stringify(body) },
        )
      ).status,
      400,
    );
  }
  assert.equal(
    (await request("/api/validate", {}, { "x-test-parsed-body": "throw" }))
      .status,
    400,
  );
  // Avoid the HTTP header-size limit while still exercising a parsed oversized body.
  const handle = createVercelHandler({ env: { DEMO_MODE: "true" }, clock });
  let status;
  await handle(
    {
      url: "/api/validate",
      method: "POST",
      headers: { host, origin, "content-type": "application/json" },
      body: { ...task, notes: "字".repeat(6000) },
    },
    {
      writeHead(code) {
        status = code;
      },
      end() {},
    },
  );
  assert.equal(status, 413);
});

test("deployed generation forwards server-only DeepSeek configuration and runs real pipeline with mocked provider responses", async (t) => {
  const calls = [];
  const secret = "fixture-deepseek-secret";
  const { request } = await setup(t, {
    env: {
      DEMO_MODE: "false",
      DEEPSEEK_API_KEY: secret,
      DEEPSEEK_BASE_URL: "https://api.deepseek.com",
      DEEPSEEK_MODEL: "deepseek-flash",
    },
    generator: (input, context, config) =>
      generate(input, context, {
        ...config,
        fetchImpl: async (url, options) => {
          assert.equal(url, "https://api.deepseek.com/responses");
          assert.equal(options.headers.Authorization, `Bearer ${secret}`);
          const body = JSON.parse(options.body);
          calls.push(body);
          assert.equal(body.model, "deepseek-flash");
          const output =
            body.text.format.name === "brand_audit"
              ? { passed: true, reasons: [], findings: [] }
              : {
                  candidates: demoCandidates(input, context).map((c) => ({
                    style: c.style,
                    main: splitParagraphs(c.text)[1],
                    cta: splitParagraphs(c.text)[2],
                  })),
                };
          return {
            ok: true,
            json: async () => ({
              status: "completed",
              output: [
                {
                  content: [
                    { type: "output_text", text: JSON.stringify(output) },
                  ],
                },
              ],
            }),
          };
        },
      }),
  });
  const bootstrap = await (await request("/api/bootstrap")).json();
  assert.equal(bootstrap.mode, "live");
  assert.equal(bootstrap.model, "deepseek-flash");
  const response = await request("/api/generate", task);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, "live");
  assert.equal(result.candidates.length, 3);
  assert.equal(calls.length, 2);
  const records = await (await request("/api/records")).json();
  assert.ok(!JSON.stringify({ bootstrap, result, records }).includes(secret));
});

test("serverless missing key fails clearly rather than silently generating demo output", async (t) => {
  const { request } = await setup(t, {
    env: { DEMO_MODE: "false", DEEPSEEK_MODEL: "deepseek-flash" },
  });
  const response = await request("/api/generate", task);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "API_KEY_MISSING");
});

test("origin policy keeps local DNS-rebinding protection and accepts exact HTTPS production, preview and custom origins", () => {
  for (const domain of [
    host,
    "luxury-outreach-preview.vercel.app",
    "advisor.example.com",
  ]) {
    assert.equal(
      requestAllowed(
        { headers: { host: domain, origin: `https://${domain}` } },
        { deployed: true },
      ),
      true,
    );
    for (const foreign of [
      "null",
      "https://attacker.example",
      `http://${domain}`,
      `https://${domain}.attacker.example`,
    ])
      assert.equal(
        requestAllowed(
          { headers: { host: domain, origin: foreign } },
          { deployed: true },
        ),
        false,
      );
  }
  assert.equal(
    requestAllowed({
      headers: { host: "127.0.0.1:3001", origin: "http://127.0.0.1:5173" },
    }),
    true,
  );
  assert.equal(
    requestAllowed({
      headers: { host: "attacker.example", origin: "http://127.0.0.1:5173" },
    }),
    false,
  );
  assert.equal(
    requestAllowed({ headers: { host, origin } }, { deployed: false }),
    false,
  );
  assert.equal(
    requestAllowed(
      { headers: { host, origin, "x-forwarded-host": "attacker.example" } },
      { deployed: true },
    ),
    true,
  );
});

test("deployment routes API independently of Vite static output and explicitly includes canonical Brand Bible", async () => {
  const config = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  assert.equal(config.outputDirectory, "dist");
  const route = config.rewrites.find((r) => r.source === "/api/:path*");
  assert.ok(route);
  assert.equal(route.destination, "/api/index?__route=:path*");
  const functionConfig = config.functions["api/index.mjs"];
  assert.ok(functionConfig.maxDuration >= 4 * 45 + 20);
  const brand = await readFile(
    new URL("../" + functionConfig.includeFiles, import.meta.url),
    "utf8",
  );
  assert.ok(brand.includes("Maison Lioré"));
});
