// Actual React -> HTTP/Vite proxy -> backend -> DeepSeek -> React integration.
// JSDOM supplies the DOM; no application API/provider response is mocked.
// --preflight checks the form/servers without submitting a generation.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act } from "react";
import { createApp } from "../server/index.mjs";
import { providerConfig } from "../server/provider-config.mjs";
import { generate, buildPrompt } from "../server/generation.mjs";
import { evaluateRequest, PROMPT_VERSION } from "../server/rules.mjs";
import { assessCandidates } from "../server/output-assessment.mjs";
import { auditInstructions } from "../server/audit-policy.mjs";
import { splitParagraphs } from "../server/message-contract.mjs";

const config = providerConfig();
assert.ok(
  config.key &&
    config.provider === "deepseek" &&
    config.model === "deepseek-flash" &&
    !config.demo,
  "Live deepseek-flash configuration is required",
);
const preflight = process.argv.includes("--preflight");
const input = {
  clientId: "CL-001",
  scenario: "recommend",
  motif: "jasmin",
  line: "jasmin",
  sku: "JAS-B01",
  occasion: "personal",
  notes: "客户喜欢低调、适合日常佩戴的珠宝，不喜欢过于夸张的设计。",
};
const directory = resolve(
  "runtime",
  preflight ? "deepseek-e2e-preflight" : "deepseek-e2e",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
await mkdir(directory, { recursive: true });
const nativeFetch = globalThis.fetch;
const ctx = evaluateRequest(input);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const report = {
  startedAt: new Date().toISOString(),
  testType: preflight
    ? "preflight-no-generation"
    : "real-react-http-provider-round-trip",
  renderer: "React in JSDOM; not a visual browser test",
  clipboard: "in-memory browser API shim; not OS clipboard verification",
  provider: config.provider,
  model: config.model,
  promptVersion: PROMPT_VERSION,
  promptSha256: sha(buildPrompt(input, ctx).instructions),
  auditPromptSha256: sha(auditInstructions),
  input,
  providerRequests: [],
  diagnostics: [],
  checks: {},
  generationSubmissions: 0,
};
const providerFetch = async (url, options) => {
  assert.ok(
    !preflight && report.providerRequests.length < 2,
    "Provider request budget exceeded",
  );
  const body = JSON.parse(options.body);
  assert.equal(body.model, "deepseek-flash");
  const request = {
    stage: body.text?.format?.name,
    model: body.model,
    reasoning: body.reasoning,
    startedAt: new Date().toISOString(),
  };
  report.providerRequests.push(request);
  const response = await nativeFetch(url, options);
  request.httpStatus = response.status;
  if (response.ok) {
    const data = await response.clone().json();
    request.returnedModel = data.model;
    request.responseStatus = data.status;
    const raw = (data.output || [])
      .flatMap((item) => item.content || [])
      .filter((part) => part.type === "output_text")
      .map((part) => part.text)
      .join("");
    try {
      request.structuredOutput = JSON.parse(raw);
      request.parseSuccess = true;
    } catch {
      request.parseSuccess = false;
    }
  }
  request.finishedAt = new Date().toISOString();
  return response;
};
const app = createApp({
  recordDir: directory,
  env: { ...process.env, GENERATION_DIAGNOSTICS: "true" },
  diagnosticLogger: (event) => report.diagnostics.push(event),
  generator: (task, context, options) =>
    generate(task, context, { ...options, fetchImpl: providerFetch }),
});
let vite, root, dom;
let copied = "";
const settle = (ms = 230) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
const buttons = () => [...document.querySelectorAll("button")];
const find = (label) => {
  const button = buttons().find((b) => b.textContent.trim() === label);
  assert.ok(button, label);
  return button;
};
const click = async (button) => {
  assert.ok(button);
  await act(async () => button.click());
  await settle();
};
const group = (name) =>
  document.querySelector(`[role="group"][aria-label="${name}"]`);
const type = async (textarea, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      "value",
    ).set.call(textarea, value);
    textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await settle();
};
try {
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const backendBase = `http://127.0.0.1:${app.address().port}`;
  // Vite treats port=0 as its default port. Reserve a free numeric port instead,
  // so the verification never interrupts the user's existing dev server.
  const reservation = createHttpServer();
  await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
  const frontendPort = reservation.address().port;
  await new Promise((r) => reservation.close(r));
  vite = await createServer({
    server: {
      host: "127.0.0.1",
      port: frontendPort,
      strictPort: true,
      ws: false,
      hmr: false,
      proxy: { "/api": backendBase },
    },
  });
  await vite.listen();
  const frontendBase = `http://127.0.0.1:${vite.httpServer.address().port}`;
  report.backendBase = backendBase;
  report.frontendBase = frontendBase;
  assert.equal((await nativeFetch(frontendBase)).status, 200);
  const bootstrap = await (
    await nativeFetch(frontendBase + "/api/bootstrap")
  ).json();
  assert.equal(bootstrap.mode, "live");
  assert.equal(bootstrap.provider, "deepseek");
  assert.equal(bootstrap.model, config.model);
  report.checks.serversReachable = true;
  dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: frontendBase },
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
  Object.defineProperty(navigator, "clipboard", {
    value: {
      writeText: async (text) => {
        copied = text;
      },
    },
  });
  // Only resolve the browser's relative URLs. All requests go through real HTTP.
  globalThis.fetch = async (url, options) => {
    if (typeof url === "string" && url.startsWith("/api/")) {
      if (url === "/api/generate") {
        report.generationSubmissions++;
        assert.ok(
          !preflight && report.generationSubmissions === 1,
          "Only one generation submission is permitted",
        );
        const submitted = JSON.parse(options.body);
        for (const key of Object.keys(input))
          assert.equal(submitted[key], input[key], key);
        report.submittedInput = submitted;
      }
      const response = await nativeFetch(frontendBase + url, options);
      if (url === "/api/generate") {
        report.applicationHttpStatus = response.status;
        report.result = await response.clone().json();
      }
      if (url === "/api/review")
        report.editedMessageReview = await response.clone().json();
      return response;
    }
    return nativeFetch(url, options);
  };
  await act(async () => {
    ({ applicationRoot: root } = await vite.ssrLoadModule("/src/main.jsx"));
  });
  await settle();
  await click(group("设计系列").querySelector("button"));
  await click(
    [...group("具体作品").querySelectorAll("button")].find((b) =>
      b.textContent.includes(input.sku),
    ),
  );
  await click(group("购买场合").querySelector("button"));
  await type(document.getElementById("notes"), input.notes);
  assert.equal(find("生成微信消息").disabled, false);
  report.checks.formReady = true;
  if (!preflight) {
    await act(async () => find("生成微信消息").click());
    await settle(50);
    report.checks.loadingStateObserved = Boolean(
      document.querySelector(".loading-results"),
    );
    const deadline = Date.now() + 100000;
    while (!report.result && Date.now() < deadline) await settle(150);
    assert.ok(
      report.result,
      "Generation did not finish before the test deadline",
    );
    await settle();
    assert.equal(
      report.applicationHttpStatus,
      200,
      report.result.error || "Generation failed",
    );
    assert.equal(report.result.mode, "live");
    assert.equal(report.result.provider, "deepseek");
    assert.equal(report.result.model, "deepseek-flash");
    const displayed = [...document.querySelectorAll(".message-text")].map(
      (node) => node.textContent,
    );
    assert.equal(displayed.length, 3);
    assert.deepEqual(
      displayed,
      report.result.candidates.map((candidate) => candidate.text),
    );
    assert.ok(displayed.every((text) => splitParagraphs(text).length === 3));
    assert.ok(document.body.textContent.includes("实时 AI · deepseek-flash"));
    assert.equal(document.querySelector(".error-banner"), null);
    assert.equal(document.querySelector(".loading-results"), null);
    assert.equal(find("生成微信消息").disabled, false);
    report.checks.threeLiveMessagesDisplayed = true;
    report.checks.liveModelLabel = true;
    report.checks.warningAbsent = true;
    report.checks.loadingEnded = true;
    report.outputAssessment = assessCandidates(
      report.result.candidates,
      { ...ctx, input },
      { allowSemanticContextCheck: true },
    );
    assert.equal(report.outputAssessment.hard.length, 0);
    for (const text of displayed) {
      const main = splitParagraphs(text)[1];
      assert.match(main, /手镯|硬镯/);
      assert.match(main, /18K玫瑰金/);
      assert.match(main, /日常|每天|通勤/);
      assert.match(main, /低调|克制|不张扬|不事声张|夸张|简约/);
    }
    report.checks.correctProductAndContext = true;
    await click(document.querySelector('[aria-label="复制更简洁"]'));
    assert.equal(copied, displayed[0]);
    report.checks.copyHandler = true;
    await click(document.querySelector(".select-message"));
    const editor = document.getElementById("final-message");
    assert.equal(editor.value, displayed[0]);
    report.checks.selection = true;
    await type(editor, displayed[0] + " 欢迎继续交流。");
    assert.ok(document.body.textContent.includes("已编辑 · 尚未重新审核"));
    await click(find("复制最终消息"));
    assert.equal(copied, editor.value);
    report.checks.editAndCopy = true;
    await click(find("基础检查"));
    assert.deepEqual(report.editedMessageReview.errors, []);
    report.checks.editedMessageReview = true;
    assert.equal(report.generationSubmissions, 1);
    assert.equal(report.providerRequests.length, 2);
    assert.ok(
      report.providerRequests.every(
        (request) =>
          request.httpStatus === 200 &&
          request.returnedModel === "deepseek-flash",
      ),
    );
  }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = {
    name: error.name,
    message: String(error.message).replaceAll(config.key, "[REDACTED]"),
  };
} finally {
  if (root) await act(async () => root.unmount());
  globalThis.fetch = nativeFetch;
  await vite?.close();
  if (app.listening) await new Promise((r) => app.close(r));
  dom?.window.close();
  report.finishedAt = new Date().toISOString();
  const clean = (text) => text.replaceAll(config.key, "[REDACTED]");
  const recordPath = resolve(directory, "records.jsonl");
  try {
    const records = await readFile(recordPath, "utf8");
    if (records.includes(config.key))
      await writeFile(recordPath, clean(records));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(
    resolve(directory, "report.json"),
    clean(JSON.stringify(report, null, 2)) + "\n",
    { flag: "wx" },
  );
  console.log(
    clean(
      JSON.stringify(
        {
          passed: report.passed,
          preflight,
          model: report.model,
          applicationHttpStatus: report.applicationHttpStatus,
          generationSubmissions: report.generationSubmissions,
          providerCalls: report.providerRequests.length,
          checks: report.checks,
          failure: report.failure || null,
          evidenceDirectory: directory,
        },
        null,
        2,
      ),
    ),
  );
  process.exitCode = report.passed ? 0 : 1;
}
