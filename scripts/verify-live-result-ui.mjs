// Render the captured real result through the existing React UI without another
// provider request. The mocked local API replays only the successful saved response.
// Usage: node scripts/verify-live-result-ui.mjs path/to/smoke-report.json
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act } from "react";
import {
  products,
  motifs,
  lines,
  scenarios,
  occasions,
} from "../data/catalog.mjs";
import { clients, events, clientProfile } from "../data/clients.mjs";
import { evaluateRequest } from "../server/rules.mjs";
import { splitParagraphs } from "../server/message-contract.mjs";

const reportPath = resolve(process.argv[2] || "missing-report.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
assert.equal(
  report.passed,
  true,
  "A successful saved live response is required",
);
const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: "http://localhost:5173" },
);
const originalFetch = globalThis.fetch;
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
let replayRequests = 0;
const bootstrap = {
  products,
  motifs,
  lines,
  scenarios,
  occasions,
  clients: clients.map((c) => ({
    ...clientProfile(c),
    initial: c.initial,
    note: c.note,
  })),
  events,
  mode: "live",
  provider: report.provider,
  model: report.model,
};
globalThis.fetch = async (url, options) => {
  if (url === "/api/bootstrap")
    return { ok: true, json: async () => bootstrap };
  if (url === "/api/records")
    return { ok: true, json: async () => ({ records: [] }) };
  const task = JSON.parse(options.body);
  if (url === "/api/validate") {
    const ctx = evaluateRequest(task);
    return {
      ok: true,
      json: async () => ({
        status: ctx.status,
        issues: ctx.issues,
        notices: ctx.notices,
        resolvedProduct: ctx.resolved?.product,
      }),
    };
  }
  if (url === "/api/generate") {
    replayRequests++;
    for (const key of [
      "clientId",
      "scenario",
      "motif",
      "line",
      "sku",
      "occasion",
      "notes",
    ])
      assert.equal(task[key], report.task[key], key);
    return { ok: true, json: async () => report.result };
  }
  throw new Error("Unexpected local API request");
};
let vite, applicationRoot;
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 230));
  });
const click = async (button) => {
  assert.ok(button);
  await act(async () => button.click());
  await settle();
};
const group = (name) =>
  document.querySelector(`[role="group"][aria-label="${name}"]`);
try {
  vite = await createServer({
    server: { middlewareMode: true, ws: false, hmr: false },
    appType: "custom",
  });
  await act(async () => {
    ({ applicationRoot } = await vite.ssrLoadModule("/src/main.jsx"));
  });
  await settle();
  await click(group("设计系列").querySelector("button"));
  await click(
    [...group("具体作品").querySelectorAll("button")].find((b) =>
      b.textContent.includes("JAS-B01"),
    ),
  );
  const occasion = occasions.find((o) => o.id === report.task.occasion);
  await click(
    [...group("购买场合").querySelectorAll("button")].find((b) =>
      b.textContent.includes(occasion.zh),
    ),
  );
  const textarea = document.getElementById("notes");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      "value",
    ).set.call(textarea, report.task.notes);
    textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await settle();
  const generate = [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === "生成微信消息",
  );
  assert.equal(generate.disabled, false);
  await click(generate);
  const displayed = [...document.querySelectorAll(".message-text")].map(
    (node) => node.textContent,
  );
  assert.equal(displayed.length, 3);
  assert.deepEqual(
    displayed,
    report.result.candidates.map((c) => c.text),
  );
  assert.ok(displayed.every((text) => splitParagraphs(text).length === 3));
  assert.ok(document.body.textContent.includes("实时 AI · deepseek-flash"));
  assert.equal(document.querySelector(".error-banner"), null);
  assert.equal(replayRequests, 1);
  const evidence = {
    passed: true,
    verification: "Existing React UI replay of captured real DeepSeek response",
    displayedCandidates: displayed.length,
    liveModeLabel: "实时 AI · deepseek-flash",
    additionalLiveProviderCalls: 0,
    sourceReport: reportPath,
    verifiedAt: new Date().toISOString(),
  };
  await writeFile(
    resolve(dirname(reportPath), "ui-replay-verification.json"),
    JSON.stringify(evidence, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (applicationRoot) await act(async () => applicationRoot.unmount());
  await vite?.close();
  globalThis.fetch = originalFetch;
  dom.window.close();
}
