import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act } from "react";
import { readFile } from "node:fs/promises";
import {
  products,
  motifs,
  lines,
  scenarios,
  occasions,
} from "../data/catalog.mjs";
import { clients, events, clientProfile } from "../data/clients.mjs";
import { evaluateRequest } from "../server/rules.mjs";
import { demoCandidates } from "../server/generation.mjs";
import { splitParagraphs } from "../server/message-contract.mjs";
test("workspace DOM: buttons, dependent selection, scenarios, generate, edit, copy and records", async (t) => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://localhost:5173" },
  );
  const style = dom.window.document.createElement("style");
  style.textContent = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  dom.window.document.head.append(style);
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
  let copied = "",
    lastTask = null,
    generateCount = 0;
  Object.defineProperty(navigator, "clipboard", {
    value: {
      writeText: async (text) => {
        copied = text;
      },
    },
  });
  const bootstrap = {
    products,
    motifs,
    lines,
    scenarios,
    occasions,
    events,
    clients: clients.map((c) => ({
      ...clientProfile(c),
      initial: c.initial,
      note: c.note,
    })),
    mode: "demo",
  };
  const records = [];
  globalThis.fetch = async (url, opts) => {
    if (url === "/api/bootstrap")
      return { ok: true, json: async () => bootstrap };
    if (url === "/api/records")
      return { ok: true, json: async () => ({ records }) };
    const task = JSON.parse(opts.body);
    lastTask = task;
    const ctx = evaluateRequest(task);
    const validation = {
      status: ctx.status,
      issues: ctx.issues,
      notices: ctx.notices,
      resolvedProduct: ctx.resolved?.product || null,
      reason: ctx.resolved?.reason,
    };
    if (url === "/api/validate")
      return { ok: true, json: async () => validation };
    if (url === "/api/generate") {
      generateCount++;
      const result = {
        ...validation,
        candidates: demoCandidates(task, ctx),
        mode: "demo",
        checks: "基础规则检查 · 示例模板",
      };
      records.push({
        id: "ui-test-" + generateCount,
        createdAt: new Date().toISOString(),
        clientId: task.clientId,
        scenario: task.scenario,
        model: "demo-template-v1.2",
        validationStatus: "READY",
        candidates: result.candidates,
        promptVersion: "advisor-1.0.0",
      });
      return { ok: true, json: async () => result };
    }
    if (url === "/api/review")
      return {
        ok: true,
        json: async () => ({
          errors: [],
          label: "基础检查未发现问题；仍需顾问核实事实与语气",
        }),
      };
    throw new Error("Unexpected API " + url);
  };
  const vite = await createServer({
    server: { middlewareMode: true, ws: false, hmr: false },
    appType: "custom",
  });
  let applicationRoot;
  t.after(async () => {
    await act(async () => {
      applicationRoot?.unmount();
    });
    await vite.close();
    globalThis.fetch = originalFetch;
    dom.window.close();
  });
  await act(async () => {
    ({ applicationRoot } = await vite.ssrLoadModule("/src/main.jsx"));
  });
  const settle = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 220));
    });
  await settle();
  const buttons = () => [...document.querySelectorAll("button")];
  const find = (text) => {
    const b = buttons().find((b) => b.textContent.trim() === text);
    assert.ok(b, "button " + text);
    return b;
  };
  const click = async (b) => {
    await act(async () =>
      b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })),
    );
    await settle();
  };
  const group = (name) =>
    document.querySelector(`[role="group"][aria-label="${name}"]`);
  assert.equal(document.querySelectorAll("select").length, 0);
  assert.equal(
    dom.window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--navy")
      .trim(),
    "#172f4d",
  );
  // jsdom exposes the theme tokens, but does not resolve inherited custom properties
  // in computed button backgrounds. Pixel/layout QA still requires a real browser.
  assert.equal(
    dom.window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--powder")
      .trim(),
    "#dce8f1",
  );
  assert.equal(
    dom.window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--blue-white")
      .trim(),
    "#f4f8fb",
  );
  assert.equal(group("沟通场景").children.length, 6);
  assert.ok(
    document
      .querySelector(".advisor-assignment")
      .textContent.includes("Sophie"),
  );
  assert.equal(group("自然意象").children.length, 3);
  assert.ok(document.body.textContent.includes("示例模式 · 非 AI 生成"));
  assert.equal(
    group("设计系列").querySelector('[aria-pressed="true"]'),
    null,
    "no first line auto-selected",
  );
  await click(group("设计系列").querySelector("button"));
  assert.equal(group("具体作品").children.length, 3);
  assert.equal(
    group("具体作品").querySelector('[aria-pressed="true"]'),
    null,
    "no SKU auto-selected",
  );
  await click(group("具体作品").children[0]);
  assert.equal(lastTask.sku, "JAS-R01");
  await click(group("自然意象").children[2]);
  assert.equal(lastTask.line, null);
  assert.equal(lastTask.sku, null);
  assert.equal(group("具体作品"), null);
  assert.equal(group("设计系列").children.length, 2);
  await click(group("设计系列").children[1]);
  assert.equal(lastTask.line, "aqua");
  assert.ok(document.body.textContent.includes("历史偏好保持原记录"));
  assert.equal(
    buttons().some((b) => b.textContent.includes("确认本次")),
    false,
  );
  assert.equal(find("生成微信消息").disabled, false);
  await click(find("生成微信消息"));
  assert.equal(document.querySelectorAll(".message-card").length, 3);
  assert.equal(generateCount, 1);
  assert.ok(
    [...document.querySelectorAll(".message-text")].every(
      (p) => splitParagraphs(p.textContent).length === 3,
    ),
  );
  await click(document.querySelector(".select-message"));
  assert.ok(document.getElementById("final-message"));
  assert.equal(document.querySelectorAll(".message-card.selected").length, 1);
  const textarea = document.getElementById("final-message");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      "value",
    ).set.call(textarea, textarea.value + " 我会认真倾听您的想法。");
    textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  assert.ok(document.body.textContent.includes("已编辑 · 尚未重新审核"));
  await click(find("复制最终消息"));
  assert.ok(copied.includes("我会认真倾听您的想法"));
  assert.equal(splitParagraphs(copied).length, 3);
  assert.ok(
    copied.startsWith("Bonjour，林女士，我是 Maison Lioré 的珠宝顾问 Sophie。"),
  );
  await click(find("基础检查"));
  assert.ok(document.body.textContent.includes("仍需顾问核实事实与语气"));
  await click(find("购买后关怀"));
  assert.equal(group("自然意象"), null);
  assert.equal(group("购买场合"), null);
  assert.equal(group("关怀购买记录").children.length, 2);
  assert.equal(
    group("关怀购买记录").querySelector('[aria-pressed="true"]'),
    null,
  );
  assert.equal(find("生成微信消息").disabled, true);
  await click(group("关怀购买记录").children[1]);
  assert.equal(lastTask.purchaseId, "PUR-001-02");
  await click(find("生成微信消息"));
  assert.ok(
    [...document.querySelectorAll(".message-text")].every((p) =>
      p.textContent.includes("Jasmin Étoilé的项链"),
    ),
  );
  await click(find("生日 / 节日祝福"));
  assert.ok(group("问候类型"));
  assert.equal(group("自然意象"), null);
  assert.equal(document.querySelector('input[type="date"]'), null);
  assert.ok(!document.body.textContent.includes("YYYY-MM-DD"));
  assert.equal(find("生成微信消息").disabled, false);
  await click(find("生成微信消息"));
  assert.ok(
    [...document.querySelectorAll(".message-text")].every(
      (p) => p.textContent.includes("11月") && !p.textContent.includes("今天"),
    ),
  );
  await click(find("节日问候"));
  await click(find("中秋节"));
  assert.equal(lastTask.greetingName, "中秋节");
  assert.equal(find("生成微信消息").disabled, false);
  await click(find("活动邀请"));
  assert.ok(document.querySelector(".event-card"));
  await click(find("价格异议"));
  assert.ok(document.body.textContent.includes("客户实际表达的价格顾虑"));
  await click(find("更多客户"));
  await click(
    buttons().find(
      (b) =>
        b.textContent.includes("顾女士") &&
        b.classList.contains("client-choice"),
    ),
  );
  assert.equal(find("生成微信消息").disabled, false);
  assert.ok(!document.body.textContent.includes("禁止主动联系"));
  assert.equal(group("沟通方式"), null);
  for (const client of clients) {
    await click(
      buttons().find(
        (b) =>
          b.classList.contains("client-choice") &&
          b.textContent.includes(client.name),
      ),
    );
    assert.equal(find("生成微信消息").disabled, false, client.id);
    assert.ok(
      document
        .querySelector(".advisor-assignment")
        .textContent.includes(client.assignedAdvisor),
    );
    assert.ok(
      !/授权|许可|主动联系|联系限制|具体日期/.test(
        document.querySelector(".client-profile").textContent,
      ),
    );
  }
  await click(
    buttons().find(
      (b) => b.textContent.includes("生成记录") && b.closest("nav"),
    ),
  );
  assert.ok(document.querySelector(".record-list"));
  assert.ok(document.body.textContent.includes("demo-template-v1.2"));
});
