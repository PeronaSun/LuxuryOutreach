// Production build + real local HTTP flow. Isolated records; no paid API calls.
import { createApp } from "../server/index.mjs";
import { splitParagraphs } from "../server/message-contract.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(join(tmpdir(), "maison-smoke-"));
const app = createApp({
  recordDir: dir,
  env: { DEMO_MODE: "true" },
  clock: () => new Date("2026-11-06T04:00:00Z"),
});
await new Promise((r) => app.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${app.address().port}`;
try {
  const html = await fetch(base);
  assert.equal(html.status, 200);
  const markup = await html.text();
  assert.ok(markup.includes("<title>Maison Lioré"));
  const asset = markup.match(/src="([^"]+\.js)"/)[1];
  const js = await fetch(base + asset);
  assert.equal(js.status, 200);
  assert.match(js.headers.get("Content-Type"), /javascript/);
  assert.ok(!markup.includes("your_key_here"));
  const b = await (await fetch(base + "/api/bootstrap")).json();
  assert.equal(b.clients.length, 9);
  assert.equal(b.products.length, 15);
  const response = await fetch(base + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseId: "PRODUCTION-SMOKE",
      clientId: "CL-001",
      scenario: "recommend",

      motif: "jasmin",
    }),
  });
  assert.equal(response.status, 200);
  const out = await response.json();
  assert.equal(out.candidates.length, 3);
  assert.ok(out.candidates.every((c) => splitParagraphs(c.text).length === 3));
  assert.ok(
    out.candidates.every((c) =>
      splitParagraphs(c.text)[0].includes("珠宝顾问 Sophie"),
    ),
  );
  assert.equal(out.resolvedProduct.sku, "JAS-R01");
  assert.equal(out.mode, "demo");
  const records = await (await fetch(base + "/api/records")).json();
  assert.equal(records.records.length, 1);
  const post = (body) =>
    fetch(base + "/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const birthday = await post({ clientId: "CL-001", scenario: "greeting" });
  assert.equal(birthday.status, 200);
  const greeting = await birthday.json();
  assert.equal(greeting.candidates.length, 3);
  assert.ok(
    greeting.candidates.every(
      (c) => c.text.includes("11月") && !c.text.includes("今天"),
    ),
  );
  const care = await post({
    clientId: "CL-005",
    scenario: "care",
    purchaseId: "PUR-005-02",
  });
  assert.equal(care.status, 200);
  const aftercare = await care.json();
  assert.equal(aftercare.resolvedProduct.sku, "FEU-A-R01");
  assert.ok(
    aftercare.candidates.every((c) => c.text.includes("Aqua Héritage的戒指")),
  );
  const finalRecords = await (await fetch(base + "/api/records")).json();
  assert.equal(finalRecords.records.length, 3);
  assert.equal(finalRecords.records[2].selectedPurchase.id, "PUR-005-02");
  console.log(
    "PASS: production HTML, JS asset, 9 clients, 15 products, recommendation, birthday-month greetings, selected-purchase care and persisted/exportable records.",
  );
} finally {
  await new Promise((r) => app.close(r));
  await rm(dir, { recursive: true, force: true });
}
