import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { distribution } from "../server/performance-metrics.mjs";
const run = promisify(execFile),
  source = process.argv[2];
if (!source) throw new Error("Provide a completed performance phase directory");
const record = JSON.parse(
  await readFile(resolve(source, "LIVE-BRACELET-1.json"), "utf8"),
);
if (!record.succeeded)
  throw new Error("Successful real bracelet source required");
const directory = resolve(
  "runtime/performance",
  `render-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
await mkdir(directory, { recursive: true });
const timings = [];
for (let i = 0; i < 4; i++) {
  const dir = resolve(directory, String(i));
  await mkdir(dir);
  const file = resolve(dir, "source.json");
  await writeFile(
    file,
    JSON.stringify({
      passed: true,
      provider: "deepseek",
      model: record.result.model,
      task: record.input,
      result: record.result,
    }) + "\n",
    { flag: "wx" },
  );
  const { stdout } = await run(process.execPath, [
    "scripts/verify-live-result-ui.mjs",
    file,
  ]);
  const result = JSON.parse(stdout);
  timings.push(result.renderCommitMs);
}
const summary = {
  source,
  additionalProviderCalls: 0,
  method: "Four DOM replays of the saved real bracelet result",
  renderCommitMs: distribution(timings),
  samples: timings,
};
await writeFile(
  resolve(directory, "summary.json"),
  JSON.stringify(summary, null, 2) + "\n",
  { flag: "wx" },
);
console.log(JSON.stringify({ directory, summary }, null, 2));
