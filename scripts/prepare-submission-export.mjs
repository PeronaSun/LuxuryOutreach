// Data preparation only. Actual XLSX authoring uses the authorized spreadsheet runtime.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { submissionExportData } from "../evaluation/final-v1/submission-export-data.mjs";
const source = process.argv[2];
if (!source)
  throw new Error("Supply a submission-v2 run or preflight directory");
const load = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(resolve(source, file), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
};
const manifest = await load("manifest.json"),
  records = await load("records.json", []),
  summary = await load("summary.json", null);
const data = submissionExportData(manifest, records, summary);
const directory = resolve(
  "deliverables",
  "export-data-" +
    new Date().toISOString().replace(/[:.]/g, "-") +
    "-" +
    randomUUID().slice(0, 8),
);
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, "workbook-data.json"),
  JSON.stringify({ ...data, sourceRun: resolve(source) }, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    directory,
    status: data.status,
    ...data.counts,
    externalApiCalls: 0,
  }),
);
