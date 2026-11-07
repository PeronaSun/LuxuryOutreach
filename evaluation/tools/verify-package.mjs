// Read-only verification of the completed evaluation package. It does not generate messages.
// Optional reports go into a new, exclusively-created review directory.
import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../../", import.meta.url));
const id = "baseline-2026-11-06-e5856af7";
const base = resolve(root, "evaluation/baselines", id);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const json = async path => JSON.parse(await readFile(path, "utf8"));
const plain = value => JSON.parse(JSON.stringify(value));
const versionBytes = await readFile(resolve(base, "baseline-version.json"));
const version = JSON.parse(versionBytes);
const setBytes = await readFile(resolve(base, "cases.json"));
const set = JSON.parse(setBytes);
const setVersion = await json(resolve(base, "case-set-version.json"));

// Record the files that predate this continuation. New review outputs are excluded.
const preservedArtifacts = [];
async function inventory(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const target = resolve(path, item.name);
    if (item.isDirectory()) await inventory(target);
    else if (item.isFile()) preservedArtifacts.push({ path: relative(root, target), sha256: sha(await readFile(target)) });
  }
}
await inventory(base);
await inventory(resolve(root, "evaluation/references"));
for (const path of ["evaluation/README.md", "evaluation/methodology.md", "evaluation/work-log.md", "evaluation/tools/run-baseline.mjs", "evaluation/tools/capture-baseline.mjs", "evaluation/tools/check-evidence.mjs"]) {
  preservedArtifacts.push({ path, sha256: sha(await readFile(resolve(root, path))) });
}

assert.equal(sha(versionBytes), setVersion.baselineVersionSha256);
assert.equal(sha(setBytes), setVersion.casesSha256);
assert.equal(sha(JSON.stringify(version.files)), version.sourceFingerprint);
for (const file of version.files) {
  const frozen = await readFile(resolve(base, "snapshot", file.path));
  assert.equal(sha(frozen), file.sha256, `snapshot changed: ${file.path}`);
  assert.equal(frozen.length, file.bytes);
  assert.equal(sha(await readFile(resolve(root, file.path))), file.sha256, `production changed: ${file.path}`);
}
for (const file of version.protectedOutputs) {
  assert.equal(sha(await readFile(resolve(root, file.path))), file.sha256, `prior output changed: ${file.path}`);
}
for (const [scenario, fingerprint] of Object.entries(version.promptFingerprints)) {
  assert.equal(sha(await readFile(resolve(base, "prompt-instructions", `${scenario}.txt`))), fingerprint.instructionsSha256);
}
assert.equal(set.cases.length, 18);
assert.equal(new Set(set.cases.map(c => c.id)).size, 18);
assert.equal(new Set(set.cases.map(c => c.input.scenario)).size, 6);
for (const caseId of ["B04", "B05"]) {
  const omitOccasion = c => { const input = { ...c.input }; delete input.occasion; return input; };
  assert.deepEqual(omitOccasion(set.cases.find(c => c.id === caseId)), omitOccasion(set.cases.find(c => c.id === "B03")));
}

const load = path => import(pathToFileURL(resolve(base, "snapshot", path)).href);
const { evaluateRequest, validateCandidates, PROMPT_VERSION } = await load("server/rules.mjs");
const { buildPrompt } = await load("server/generation.mjs");
const { BRAND_VERSION } = await load("data/catalog.mjs");

// Handles quoted commas, escaped quotes, and embedded paragraph newlines.
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) { row.push(field); field = ""; }
    else if (c === "\n" && !quoted) { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r" || quoted) field += c;
  }
  assert.equal(quoted, false, "unclosed CSV field");
  if (row.length || field) { row.push(field); rows.push(row); }
  return rows;
}
const states = [];
let reviewRows = 0;
for (const entry of await readdir(resolve(base, "runs"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = resolve(base, "runs", entry.name);
  const start = await json(resolve(directory, "run-start.json"));
  const summary = await json(resolve(directory, "summary.json"));
  const records = await json(resolve(directory, "records.json"));
  const jsonl = (await readFile(resolve(directory, "records.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(jsonl, records, "JSON/JSONL disagreement");
  assert.equal(start.runId, entry.name); assert.equal(summary.runId, entry.name);
  assert.equal(start.commit, version.git.commit); assert.equal(start.sourceFingerprint, version.sourceFingerprint);
  assert.equal(start.baselineVersionSha256, sha(versionBytes)); assert.equal(start.casesSha256, sha(setBytes));
  assert.equal(start.runnerSha256, sha(await readFile(resolve(base, "tooling/run-baseline.mjs"))), "archived runner differs from executed runner");
  assert.equal(records.length, 18); assert.equal(summary.cases, 18);
  assert.deepEqual(records.map(r => r.caseId), set.cases.map(c => c.id));
  for (const record of records) {
    const definition = set.cases.find(c => c.id === record.caseId);
    const context = evaluateRequest(definition.input);
    assert.deepEqual(record.input, definition.input);
    assert.deepEqual(record.context, plain(context));
    assert.equal(record.versions.prompt, PROMPT_VERSION); assert.equal(record.versions.brandBible, BRAND_VERSION);
    assert.equal(record.versions.modelConfigured, version.config.configuredModel);
    assert.equal(record.messages.length, 3); assert.deepEqual(record.messages.map(m => m.style), ["concise", "detailed", "elegant"]);
    assert.equal(record.humanReviewStatus, "PENDING"); assert.ok(record.messages.every(m => m.humanScores === null && m.reviewer === null));
    if (context.status === "READY") {
      const prompt = buildPrompt(definition.input, context);
      assert.equal(record.prompt.instructions, prompt.instructions); assert.equal(record.prompt.input, prompt.input);
      assert.equal(record.prompt.instructionsSha256, sha(prompt.instructions)); assert.equal(record.prompt.inputSha256, sha(prompt.input));
    } else assert.equal(record.prompt, null);
    if (!record.execution.attempted) {
      assert.ok(record.execution.status.startsWith("NOT_EXECUTED"));
      assert.ok(record.messages.every(m => m.text === null));
      assert.equal(record.execution.templateGenerationPerformed, false); assert.equal(record.execution.liveGenerationPerformed, false);
    }
    if (record.execution.templateGenerationPerformed) {
      assert.equal(record.execution.mode, "demo"); assert.equal(record.execution.status, "DEMO_GENERATED");
      assert.equal(record.versions.modelReportedByApplication, version.versions.demoModel);
      assert.ok(record.messages.every(m => m.stage === "DEMO_TEMPLATE" && typeof m.text === "string"));
      assert.deepEqual(record.outputValidation.errors, validateCandidates(record.messages, { ...context, input: record.input }));
    }
    assert.equal(record.providerTraceFiles.length, record.execution.providerCalls);
    for (const file of record.providerTraceFiles) assert.ok((await stat(resolve(directory, file))).isFile());
  }
  const count = selector => records.filter(selector).length;
  assert.deepEqual(summary.inputStatusCounts, records.reduce((a, r) => { a[r.inputValidation.status] = (a[r.inputValidation.status] || 0) + 1; return a; }, {}));
  assert.equal(summary.templateGenerationCompleted, count(r => r.execution.templateGenerationPerformed));
  assert.equal(summary.liveGenerationCompleted, count(r => r.execution.liveGenerationPerformed));
  assert.equal(summary.providerCalls, records.reduce((n, r) => n + r.execution.providerCalls, 0));
  assert.equal(summary.candidateTextsRecorded, records.reduce((n, r) => n + r.messages.filter(m => m.text !== null).length, 0));
  assert.equal(summary.baselineExpectationMatches, count(r => r.inputValidation.baselineExpectationMatches));
  assert.deepEqual(summary.desiredBusinessMismatches, records.filter(r => !r.inputValidation.desiredBusinessStatusMatches).map(r => r.caseId));
  assert.equal(summary.qualityScoresAssigned, false);

  const [header, ...rows] = parseCsv(await readFile(resolve(directory, "human-review.csv"), "utf8"));
  assert.equal(rows.length, 54); reviewRows += rows.length;
  const at = name => { const i = header.indexOf(name); assert.ok(i >= 0, name); return i; };
  for (const row of rows) {
    assert.equal(row.length, header.length);
    const record = records.find(r => r.caseId === row[at("case_id")]); assert.ok(record);
    const message = record.messages.find(m => m.style === row[at("style")]); assert.ok(message);
    assert.equal(row[at("message")], message.text ?? ""); assert.deepEqual(JSON.parse(row[at("complete_input_json")]), record.input);
    assert.equal(row[at("generation_status")], record.execution.status);
    for (const name of ["factual_accuracy", "brand_consistency", "personalization", "scenario_relevance", "chinese_naturalness", "cta_appropriateness", "style_differentiation", "product_story_grounding", "hard_failure_codes", "reviewer", "review_notes"]) assert.equal(row[at(name)], "");
  }
  states.push({ runId: entry.name, mode: summary.mode, status: summary.runStatus, records: records.length, candidateTexts: summary.candidateTextsRecorded, liveGenerations: summary.liveGenerationCompleted, providerCalls: summary.providerCalls });
}

const documents = ["evaluation/README.md", "evaluation/methodology.md", "evaluation/references/README.md", "evaluation/work-log.md", ...["pipeline-audit.md", "baseline-version.md", "cases.md", "rubric.md", "risks-and-next-steps.md", "initial-evaluation-report.md"].map(name => relative(root, resolve(base, name)))];
let localLinks = 0;
for (const path of documents) {
  const document = await readFile(resolve(root, path), "utf8");
  for (const match of document.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "").split("#")[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    assert.ok((await stat(resolve(root, dirname(path), decodeURIComponent(target)))).isFile(), `broken link in ${path}: ${target}`);
    localLinks++;
  }
}
for (const file of preservedArtifacts) assert.equal(sha(await readFile(resolve(root, file.path))), file.sha256, `completed artifact changed during verification: ${file.path}`);
const result = { verifiedAt: new Date().toISOString(), status: "PASS", baseline: id, baselineCommit: version.git.commit,
  currentCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceFilesUnchanged: version.files.length, priorApplicationOutputsUnchanged: version.protectedOutputs.length,
  completedEvaluationFilesPreserved: preservedArtifacts.length, scenarioInstructionHashesVerified: Object.keys(version.promptFingerprints).length,
  frozenCases: 18, scenarios: 6, recordsReconciled: states.reduce((n, s) => n + s.records, 0), reviewRowsReconciled: reviewRows,
  markdownDocumentsChecked: documents.length, localLinksVerified: localLinks, runs: states,
  newGenerationsPerformed: 0, newProviderCalls: 0, subjectiveScoresAssigned: false,
  pending: ["Live-model baseline execution: the preserved runs contain no completed real-model generation.", "Human rubric scoring: no reviewer scores have been recorded."],
  note: "Read-only integrity and artifact checks; this is not a new generation run or a language-quality score." };
if (process.argv.includes("--report")) {
  const review = resolve(root, "evaluation/reviews", new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8));
  await mkdir(dirname(review), { recursive: true }); await mkdir(review);
  await writeFile(resolve(review, "verification.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  await writeFile(resolve(review, "preserved-artifacts.json"), JSON.stringify(preservedArtifacts, null, 2) + "\n", { flag: "wx" });
  await writeFile(resolve(review, "completion-report.md"), `# Evaluation preparation closeout\n\nThe six requested preparation deliverables were reviewed and are complete in [the existing index](../../README.md). No baseline, prompt, case definition, run record, or previous report was overwritten.\n\nVerification: **PASS**. ${result.sourceFilesUnchanged} original/frozen source files, ${result.priorApplicationOutputsUnchanged} prior application outputs, and ${result.completedEvaluationFilesPreserved} completed evaluation files remain intact. All ${result.recordsReconciled} JSON/JSONL records and ${result.reviewRowsReconciled} CSV rows agree; ${localLinks} local document links resolve. Existing runs still contain 45 demo-template texts, zero real-model generations, and no subjective scores.\n\nNo generation was repeated. The prior 79-test result is historical evidence from the completed phase, not a new test run. This review exercised evidence validation and prompt reconstruction only.\n\n## Remaining prerequisites\n\n- Configure OPENAI_API_KEY securely, then execute the existing frozen live runner. The key is still absent; no real-model request was attempted during this continuation.\n- Review the resulting real-model messages with the existing rubric and a separate annotation copy. Keep demo and live scores separate.\n- The 18→50 expansion is a documented future phase, not an unfinished requirement of the requested 12–18-case baseline preparation. Generation/prompt fixes remain deferred.\n\nCommands (repository root):\n\n\`\`\`sh\nnode evaluation/tools/verify-package.mjs\nnode --env-file-if-exists=.env evaluation/tools/run-baseline.mjs --mode live\n\`\`\`\n\nSee verification.json for exact counts and preserved-artifacts.json for the completed-work inventory.\n`, { flag: "wx" });
  result.reportDirectory = relative(root, review);
}
console.log(JSON.stringify(result, null, 2));
