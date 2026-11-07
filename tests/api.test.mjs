import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./test-clock.mjs";
import { demoCandidates } from "../server/generation.mjs";
import { PROMPT_VERSION } from "../server/rules.mjs";
import { splitParagraphs } from "../server/message-contract.mjs";
const input = {
  clientId: "CL-001",
  scenario: "recommend",
  motif: "jasmin",
  line: "jasmin",
};
test("HTTP API validates, generates three, persists, exports and rejects overrides", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "maison-test-"));
  const app = createApp({ recordDir: dir, env: { DEMO_MODE: "true" } });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = (path, body) =>
    fetch(base + "/api/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const b = await (await fetch(base + "/api/bootstrap")).json();
  assert.equal(b.products.length, 15);
  assert.equal(b.mode, "demo");
  assert.equal(b.OPENAI_API_KEY, undefined);
  const validation = await (await post("validate", input)).json();
  assert.equal(validation.status, "READY");
  assert.equal(validation.resolvedProduct.sku, "JAS-R01");
  const r = await post("generate", { ...input, caseId: "HTTP-01" });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.candidates.length, 3);
  assert.ok(out.candidates.every((c) => splitParagraphs(c.text).length === 3));
  assert.ok(
    out.candidates.every(
      (c) =>
        splitParagraphs(c.text)[0] ===
        "Bonjour，林女士，我是 Maison Lioré 的珠宝顾问 Sophie。",
    ),
  );
  const validEdit = await (
    await post("review", { ...input, text: out.candidates[0].text })
  ).json();
  assert.deepEqual(validEdit.errors, []);
  const [intro, main] = splitParagraphs(out.candidates[0].text);
  const customEdit = await (
    await post("review", {
      ...input,
      text: [intro, main, "欢迎与我继续聊聊这件作品。"].join("\n\n"),
    })
  ).json();
  assert.deepEqual(customEdit.errors, []);
  assert.equal(out.mode, "demo");
  const invalid = await post("generate", {
    ...input,
    sku: "INVENTED",
    clientProfile: { name: "假资料" },
  });
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json()).status, "BLOCKED");
  assert.ok(
    b.clients.every(
      (c) => !Object.hasOwn(c, "permissions") && !Object.hasOwn(c, "contact"),
    ),
  );
  const recordResponse = await (await fetch(base + "/api/records")).json();
  assert.equal(recordResponse.records.length, 2);
  const record = recordResponse.records[0];
  assert.equal(record.caseId, "HTTP-01");
  assert.equal(record.resolvedProductSku, "JAS-R01");
  assert.ok(record.promptVersion);
  assert.ok(record.brandBibleVersion);
  assert.equal(record.candidates.length, 3);
  assert.equal(record.messageFormatVersion, "three-paragraph-v1");
  assert.equal(record.messagePlan.story.product.sku, "JAS-R01");
  assert.equal(record.clientContext.assignedAdvisor, "Sophie");
  assert.equal(
    (await readFile(join(dir, "records.jsonl"), "utf8")).trim().split("\n")
      .length,
    2,
  );
  const edit = await (
    await post("review", { ...input, text: "请今天必须购买，保证升值。" })
  ).json();
  assert.ok(edit.errors.length);
  const cors = await fetch(base + "/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://malicious.example",
    },
    body: JSON.stringify(input),
  });
  assert.equal(cors.status, 403);
  assert.equal((await post("generate", null)).status, 400);
});
test("in-flight requests cannot submit twice and failures do not expose raw provider details", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "maison-busy-"));
  let release;
  const pending = new Promise((r) => (release = r));
  const app = createApp({
    recordDir: dir,
    generator: async () => {
      await pending;
      throw new Error("模型服务暂时不可用，请稍后重试或检查服务器配置。");
    },
    env: { DEMO_MODE: "true" },
  });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = () =>
    fetch(base + "/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  const first = post();
  await new Promise((r) => setTimeout(r, 30));
  const second = await post();
  assert.equal(second.status, 429);
  release();
  assert.equal((await first).status, 502);
});

test("API forwards selected purchase and ignores invented facts and obsolete birthday dates", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "maison-purchase-"));
  let received;
  const app = createApp({
    recordDir: dir,
    env: { DEMO_MODE: "true" },
    generator: async (task, ctx) => {
      received = { task, ctx };
      return {
        candidates: demoCandidates(task, ctx),
        model: "test",
        mode: "demo",
      };
    },
  });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = (body) =>
    fetch(base + "/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await post({
        clientId: "CL-001",
        scenario: "care",
        purchaseId: "PUR-001-02",
        purchase: { sku: "FAKE", purchasePrice: 1 },
      })
    ).status,
    200,
  );
  assert.equal(received.ctx.purchase.sku, "JAS-N01");
  assert.equal(received.ctx.purchase.purchasePrice, 22800);
  assert.equal(received.task.purchase, undefined);
  const exportData = await (await fetch(base + "/api/records")).json();
  assert.equal(exportData.records[0].selectedPurchase.id, "PUR-001-02");
  assert.equal(
    (
      await post({
        clientId: "CL-008",
        scenario: "greeting",
        greetingKind: "festival",
        greetingName: "春节",
        greetingDate: "2026-06-15",
        greetingConfirmed: false,
      })
    ).status,
    200,
  );
  assert.equal(received.task.greetingDate, undefined);
  assert.equal(received.task.greetingConfirmed, undefined);
  assert.equal(received.ctx.client.birthMonth, 6);
  assert.equal(
    (
      await post({
        clientId: "CL-001",
        scenario: "care",
        purchaseId: "PUR-005-01",
      })
    ).status,
    422,
  );
});

test("API birthday gating uses server China time, ignores caller date overrides, and persists context-aware festival drafts", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "maison-calendar-"));
  let now = "2026-10-31T15:59:59Z",
    generationCalls = 0;
  const app = createApp({
    recordDir: dir,
    env: { DEMO_MODE: "true" },
    clock: () => new Date(now),
    generator: async (task, ctx) => {
      generationCalls++;
      return {
        candidates: demoCandidates(task, ctx),
        model: "mock-demo",
        mode: "demo",
      };
    },
  });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = (path, task) =>
    fetch(`${base}/api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
  const birthday = {
    clientId: "CL-001",
    scenario: "greeting",
    applicationCalendar: { month: 11 },
    currentMonth: 11,
    now: "2026-11-06",
    birthMonth: 10,
  };
  const blocked = await post("generate", birthday);
  assert.equal(blocked.status, 422);
  assert.equal((await blocked.json()).calendar.month, 10);
  assert.equal(generationCalls, 0);
  now = "2026-10-31T16:00:00Z";
  const bootstrap = await (await fetch(`${base}/api/bootstrap`)).json();
  assert.equal(bootstrap.calendar.date, "2026-11-01");
  assert.equal((await post("generate", birthday)).status, 200);
  assert.equal(generationCalls, 1);
  const notes = "客户最近刚完成了一个重要项目，最近工作比较忙。";
  const festival = {
    clientId: "CL-002",
    scenario: "greeting",
    greetingKind: "festival",
    greetingName: "圣诞节",
    notes,
  };
  const result = await post("generate", festival);
  assert.equal(result.status, 200);
  const draft = await result.json();
  assert.ok(
    draft.candidates.every((c) => /圣诞/.test(c.text) && /项目/.test(c.text)),
  );
  const records = (await (await fetch(`${base}/api/records`)).json()).records;
  const record = records.find((r) => r.input.notes === notes);
  assert.equal(record.applicationCalendar.timeZone, "Asia/Shanghai");
  assert.equal(record.communicationContext.primaryFacet, "project_rest");
  assert.equal(record.promptVersion, PROMPT_VERSION);
  assert.equal(record.candidates.length, 3);
  const storedBirthday = records.find(
    (r) => r.clientId === "CL-001" && r.candidates.length,
  );
  assert.equal(storedBirthday.input.now, undefined);
  assert.equal(storedBirthday.input.birthMonth, undefined);
  assert.equal(storedBirthday.clientContext.birthMonth, 11);
  const unsupported = await post("generate", {
    ...input,
    notes: "客户希望了解作品和巴洛克建筑的关系。",
  });
  assert.equal(unsupported.status, 502);
  assert.match((await unsupported.json()).error, /示例模式暂不能可靠理解/);
});
