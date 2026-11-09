import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRecordStore } from "../server/record-store.mjs";

test("local JSONL preserves existing records and appends new ones", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "maison-store-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createRecordStore({ recordDir: dir, env: {} });
  assert.deepEqual(await store.read(), []);
  await store.append(JSON.stringify({ id: "first" }));
  await store.append(JSON.stringify({ id: "second" }));
  assert.deepEqual(await store.read(), [{ id: "first" }, { id: "second" }]);
  assert.equal(
    (await readFile(join(dir, "records.jsonl"), "utf8")).trim().split("\n")
      .length,
    2,
  );
});

test("independent serverless stores share a durable Journal via Redis without overwrite, trimming or expiry", async () => {
  const rows = [];
  const commands = [];
  const env = {
    UPSTASH_REDIS_REST_URL: "https://fixture.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "fixture-token",
    VERCEL_ENV: "production",
  };
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://fixture.upstash.io/");
    assert.equal(options.headers.Authorization, "Bearer fixture-token");
    const args = JSON.parse(options.body);
    commands.push(args);
    assert.equal(args[1], "maison-liore:production:records");
    return {
      ok: true,
      json: async () => ({
        result: args[0] === "RPUSH" ? rows.push(args[2]) : [...rows],
      }),
    };
  };
  const first = createRecordStore({ env, deployed: true, fetchImpl });
  const second = createRecordStore({ env, deployed: true, fetchImpl });
  assert.deepEqual(first.metadata, { kind: "redis", durable: true });
  await first.append(JSON.stringify({ id: "first", text: "中文\n\n三段" }));
  await second.append(JSON.stringify({ id: "second" }));
  assert.deepEqual(await first.read(), await second.read());
  assert.equal((await second.read()).length, 2);
  assert.ok(commands.every((c) => ["RPUSH", "LRANGE"].includes(c[0])));
});

test("Redis errors are sanitized and never silently switch to temporary storage", async () => {
  for (const outcome of [
    () => {
      throw new Error("fixture-secret");
    },
    () => ({ ok: false }),
    () => ({ ok: true, json: async () => ({ error: "fixture-secret" }) }),
  ]) {
    const store = createRecordStore({
      env: {
        KV_REST_API_URL: "https://fixture.upstash.io",
        KV_REST_API_TOKEN: "fixture-secret",
      },
      fetchImpl: async () => outcome(),
    });
    await assert.rejects(
      store.append("{}"),
      (e) => !e.message.includes("fixture-secret") && /存储/.test(e.message),
    );
    await assert.rejects(
      store.read(),
      (e) => !e.message.includes("fixture-secret") && /存储/.test(e.message),
    );
  }
  const invalid = createRecordStore({
    env: {
      UPSTASH_REDIS_REST_URL: "http://user:fixture-secret@invalid",
      UPSTASH_REDIS_REST_TOKEN: "fixture-secret",
    },
    fetchImpl: () => assert.fail("invalid URL must not be fetched"),
  });
  await assert.rejects(
    invalid.read(),
    (e) => !e.message.includes("fixture-secret"),
  );
});

test("unconfigured Vercel Journal is explicitly temporary", () => {
  assert.deepEqual(createRecordStore({ env: {}, deployed: true }).metadata, {
    kind: "temporary",
    durable: false,
  });
});
