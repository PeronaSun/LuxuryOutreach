import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const storageError = () =>
  new Error("生成记录存储暂时不可用，请检查服务器配置。");

export function createRecordStore({
  recordDir,
  env = process.env,
  deployed = false,
  fetchImpl = fetch,
} = {}) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url || token) {
    // Configuration stays server-side. Never return raw storage/provider errors.
    const command = async (args) => {
      try {
        const endpoint = new URL(url);
        if (
          !token ||
          endpoint.protocol !== "https:" ||
          endpoint.username ||
          endpoint.password ||
          endpoint.search ||
          endpoint.hash
        )
          throw storageError();
        const response = await fetchImpl(endpoint.toString(), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        });
        if (!response.ok) throw storageError();
        const body = await response.json();
        if (body.error || !Object.hasOwn(body, "result")) throw storageError();
        return body.result;
      } catch {
        throw storageError();
      }
    };
    // Separate production and preview journals; do not expire or trim evidence.
    const key =
      env.JOURNAL_REDIS_KEY ||
      `maison-liore:${env.VERCEL_ENV || "local"}:records`;
    return {
      metadata: { kind: "redis", durable: true },
      async append(record) {
        const count = await command(["RPUSH", key, record]);
        if (!Number.isInteger(count) || count < 1) throw storageError();
      },
      async read() {
        try {
          const rows = await command(["LRANGE", key, 0, -1]);
          if (!Array.isArray(rows)) throw storageError();
          return rows.map((row) => JSON.parse(row));
        } catch {
          throw storageError();
        }
      },
    };
  }
  // /tmp is writable in Functions, but is NOT shared or durable. Redis is
  // required for a Journal that survives cold starts, instances and redeploys.
  const directory =
    recordDir ||
    (deployed
      ? resolve(
          tmpdir(),
          "maison-liore",
          env.VERCEL_DEPLOYMENT_ID || "deployment",
        )
      : resolve(root, "runtime"));
  const file = resolve(directory, "records.jsonl");
  return {
    metadata: { kind: deployed ? "temporary" : "file", durable: !deployed },
    async append(record) {
      await mkdir(directory, { recursive: true });
      await appendFile(file, record + "\n");
    },
    async read() {
      try {
        return (await readFile(file, "utf8"))
          .trim()
          .split("\n")
          .filter(Boolean)
          .map(JSON.parse);
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw storageError();
      }
    },
  };
}
