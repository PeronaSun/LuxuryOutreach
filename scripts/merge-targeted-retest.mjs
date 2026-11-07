// Merge provenanced outputs only; this script never calls a model.
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { deterministicEvaluationV2 } from "../evaluation/final-v1/deterministic-v2.mjs";
import { evaluationSummary, csv } from "../evaluation/final-v1/reporting.mjs";
import { submissionExportData } from "../evaluation/final-v1/submission-export-data.mjs";
const target = process.argv[2];
if (!target) throw Error("Supply completed targeted run");
const load = async (p) => JSON.parse(await readFile(p, "utf8"));
const retestMeta = await load(resolve(target, "manifest.json")),
  source = retestMeta.sourceRun;
const originalManifest = await load(resolve(source, "manifest.json")),
  originalRecords = await load(resolve(source, "records.json")),
  originalSummary = await load(resolve(source, "summary.json"));
const chain = [];
async function collect(run) {
  const meta = await load(resolve(run, "manifest.json"));
  if (meta.priorRetestRun) await collect(meta.priorRetestRun);
  chain.push({
    directory: resolve(run),
    metadata: meta,
    records: await load(resolve(run, "records.json")),
    traces: await load(resolve(run, "provider-traces.json")),
    summary: await load(resolve(run, "summary.json")),
  });
}
await collect(target);
const latestById = new Map();
for (const run of chain) for (const r of run.records) latestById.set(r.id, r);
const retestRecords = [...latestById.values()];
const retestSummary = {
  actualProviderCalls: chain.reduce(
    (s, r) => s + r.summary.actualProviderCalls,
    0,
  ),
};
if (retestRecords.length !== 8) throw Error("Unexpected targeted case set");
const directory = resolve(
  "runtime/final-evaluation",
  `merged-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
);
await mkdir(directory, { recursive: true });
const save = (f, v) =>
  writeFile(resolve(directory, f), JSON.stringify(v, null, 2) + "\n", {
    flag: "wx",
  });
const records = originalRecords.map((original) => {
  const retest = retestRecords.find((r) => r.id === original.id);
  let record = structuredClone(retest || original),
    kind = retest ? "LIVE_TARGETED_RETEST" : "ORIGINAL_UNCHANGED";
  if (JSON.stringify(record.input) !== JSON.stringify(original.input))
    throw Error("Case input changed");
  if (original.id === "F-037") {
    record.deterministic = deterministicEvaluationV2(
      original.messages,
      original.context,
      original.input,
    );
    if (!record.deterministic.passed)
      throw Error("False-positive revalidation failed");
    kind = "ORIGINAL_OFFLINE_REVALIDATED";
  }
  record.generationPerformedInThisRun = false;
  record.provenance = {
    kind,
    generationSourceRun: retest ? retest.sourceRun : resolve(source),
    generationPerformedInTargetedRetest: Boolean(retest),
    originalCaseId: original.id,
    originalPromptVersion: original.promptVersion,
    originalDeterministic: original.deterministic || null,
    originalError: original.error || null,
    originalMessageCount: original.messages.length,
    originalPassed: Boolean(original.deterministic?.passed),
    selectedPromptVersion: record.promptVersion,
    selectedValidatorVersion: record.deterministic?.version || null,
  };
  return record;
});
const traces = [
  ...(await load(resolve(source, "provider-traces.json"))).map((t) => ({
    ...t,
    cohort: "original",
  })),
  ...chain
    .flatMap((run) => run.traces)
    .map((t) => ({
      ...t,
      cohort: "targeted-retest",
    })),
];
if (traces.length > 200) throw Error("Cumulative budget exceeded");
const summary = evaluationSummary(records);
summary.acceptance.finalPaidRunPerformed = false;
const manifest = {
  ...originalManifest,
  mode: "targeted-merged",
  createdAt: new Date().toISOString(),
  originalRun: resolve(source),
  targetedRun: resolve(target),
  targetedRuns: chain.map((r) => r.directory),
  originalPromptVersion: originalManifest.promptVersion,
  promptVersion: retestMeta.promptVersion,
  deterministicVersion: retestMeta.deterministicVersion,
  sourceFingerprints: retestMeta.sourceFingerprints,
  originalManifestSha256: createHash("sha256")
    .update(await readFile(resolve(source, "manifest.json")))
    .digest("hex"),
};
const finalSummary = {
  ...summary,
  mode: "targeted-merged",
  actualProviderCalls: traces.length,
  originalProviderCalls: originalSummary.actualProviderCalls,
  additionalProviderCalls: retestSummary.actualProviderCalls,
  newLiveCasesExecuted: 8,
  offlineOnlyCases: ["F-037"],
  unchangedOriginalCases: 41,
  fullFiftyRerun: false,
  originalCompletedValid: originalSummary.deterministicPassed,
  cumulativeCap: 200,
  originalRecoveryActions:
    originalSummary.generationRecoveryInEvidence.outputRepairs,
  retestRecoveryActions: chain
    .flatMap((run) => run.records)
    .reduce((s, r) => s + (r.recovery?.retryCount || 0), 0),
};
await save("manifest.json", manifest);
await save("records.json", records);
await save("summary.json", finalSummary);
await save("provider-traces.json", traces);
await writeFile(
  resolve(directory, "records.jsonl"),
  records.map((r) => JSON.stringify(r)).join("\n") + "\n",
  { flag: "wx" },
);
const data = submissionExportData(manifest, records, finalSummary);
await writeFile(
  resolve(directory, "messages.csv"),
  csv([data.columns, ...data.caseRows]),
  { flag: "wx" },
);
await save("workbook-data.json", { ...data, sourceRun: directory });
for (const [index, run] of chain.entries())
  await cp(
    run.directory,
    resolve(directory, `targeted-run-${index + 1}-evidence`),
    { recursive: true, errorOnExist: true, force: false },
  );
await mkdir(resolve(directory, "original-run-reference"));
for (const file of [
  "manifest.json",
  "records.json",
  "records.jsonl",
  "summary.json",
  "provider-traces.json",
  "provider-traces.jsonl",
])
  await cp(
    resolve(source, file),
    resolve(directory, "original-run-reference", file),
    { errorOnExist: true, force: false },
  );
console.log(
  JSON.stringify({
    directory,
    originalCompleted: originalSummary.deterministicPassed,
    currentCompleted: finalSummary.deterministicPassed,
    additionalCalls: finalSummary.additionalProviderCalls,
    totalCalls: traces.length,
    newLiveCases: 8,
    offlineRevalidated: 1,
  }),
);
