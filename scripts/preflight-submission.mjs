// Zero-network preflight. Paid generation remains a separate approval-gated command.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  finalCases,
  REQUIRED_DISTRIBUTION,
  EVALUATION_TIME,
} from "../evaluation/final-v1/cases-submission-v2.mjs";
import { products, BRAND_VERSION } from "../data/catalog.mjs";
import { clients, events } from "../data/clients.mjs";
import { evaluateRequest } from "../server/rules.mjs";
import {
  providerConfig,
  responsesEndpoint,
} from "../server/provider-config.mjs";
import { recoveryConfig } from "../server/recovery-policy.mjs";
import { judgePolicy } from "../evaluation/final-v1/judge-policy.mjs";
import { submissionExportData } from "../evaluation/final-v1/submission-export-data.mjs";
import { csv } from "../evaluation/final-v1/reporting.mjs";

const sha = (data) => createHash("sha256").update(data).digest("hex");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const config = providerConfig(),
  recovery = recoveryConfig(),
  judge = judgePolicy(config, process.env, true);
if (
  !config.key ||
  config.demo ||
  config.provider !== "deepseek" ||
  config.model !== "deepseek-flash"
)
  throw new Error(
    "Preflight requires configured live DeepSeek Flash; no calls made",
  );
responsesEndpoint(config.baseUrl); // validates URL without echoing potentially sensitive configuration
execFileSync("git", ["check-ignore", "--quiet", ".env"]);
const directory = resolve(
  "deliverables",
  `preflight-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
);
await mkdir(directory, { recursive: true });
const save = async (name, value) => {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n";
  if (text.includes(config.key))
    throw new Error("Credential redaction check failed; not writing");
  await writeFile(resolve(directory, name), text, { flag: "wx" });
};
const protectedFiles = new Map();
for (const base of ["evaluation", "runtime", "src", "server", "data", "docs"]) {
  for (const item of await readdir(base, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!item.isFile()) continue;
    const file = join(item.parentPath || item.path, item.name);
    protectedFiles.set(file, sha(await readFile(file)));
  }
}
for (const file of [".env", ".gitignore", "package.json", "package-lock.json"])
  protectedFiles.set(file, sha(await readFile(file)));
const planLog = execFileSync(
  process.execPath,
  [
    "scripts/final-evaluation.mjs",
    "--case-set",
    "submission-v2",
    "--plan",
    "--max-api-calls",
    String(50 * (recovery.maxProviderCalls + (judge.enabled ? 1 : 0))),
  ],
  { encoding: "utf8" },
);
const planDirectory = JSON.parse(planLog.split("\n")[0]).directory;
const manifest = await readJson(resolve(planDirectory, "manifest.json"));
const distribution = Object.fromEntries(
  Object.keys(REQUIRED_DISTRIBUTION).map((s) => [
    s,
    finalCases.filter((c) => c.input.scenario === s).length,
  ]),
);
const audits = finalCases.map((c) => {
  const ctx = evaluateRequest(c.input, { now: EVALUATION_TIME });
  const product = c.input.sku
    ? products.find((p) => p.sku === c.input.sku)
    : null;
  const client = clients.find((x) => x.id === c.input.clientId);
  const checks = {
    uniqueId: finalCases.filter((x) => x.id === c.id).length === 1,
    fictional: c.fictional === true,
    knownClient: Boolean(client),
    ready: ctx.status === "READY",
    expectedBehavior: Boolean(c.expectedBehavior),
    canonicalSkuRelationship:
      !c.input.sku ||
      Boolean(
        product &&
        product.motif === c.input.motif &&
        product.line === c.input.line,
      ),
    selectedPurchase:
      c.input.scenario !== "care" ||
      Boolean(
        client.purchases.some(
          (p) =>
            p.id === c.input.purchaseId &&
            p.sku === ctx.purchase?.sku &&
            p.purchasePrice === products.find((x) => x.sku === p.sku)?.price,
        ),
      ),
    verifiedFictionalEvent:
      c.input.scenario !== "event" ||
      Boolean(
        events.some(
          (e) =>
            e.id === c.input.eventId &&
            e.verified &&
            e.fictional &&
            e.name === ctx.event?.name &&
            e.date === ctx.event?.date &&
            e.location === ctx.event?.location,
        ),
      ),
    scenarioRequiredFields:
      c.input.scenario === "price"
        ? Boolean(c.input.concern?.trim())
        : c.input.scenario === "greeting" && c.input.greetingKind === "festival"
          ? Boolean(c.input.greetingName)
          : true,
  };
  return {
    caseId: c.id,
    scenario: c.input.scenario,
    status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
    checks,
    selectionDepth: ctx.normalized.selection.depth,
    resolvedSku: ctx.resolved.product?.sku || null,
    inputIssues: ctx.issues,
  };
});
if (
  JSON.stringify(distribution) !== JSON.stringify(REQUIRED_DISTRIBUTION) ||
  audits.some((a) => a.status !== "PASS")
)
  throw new Error("Case preflight failed; no calls made");
const skuCoverage = [
  ...new Set(audits.map((a) => a.resolvedSku).filter(Boolean)),
].sort();
if (
  JSON.stringify(skuCoverage) !==
  JSON.stringify(products.map((p) => p.sku).sort())
)
  throw new Error("Missing catalog coverage");
const benchmark = await readJson(
  "evaluation/final-v1/evidence/after/summary.json",
);
const tokens = Object.fromEntries(
  Object.entries(benchmark.tokens).map(([key, value]) => [
    key,
    (value * 50) / 4,
  ]),
);
const estimate = (rate, cached = true) =>
  ((tokens.input - (cached ? tokens.cached : 0)) * rate.input +
    (cached ? tokens.cached : 0) * rate.cached +
    tokens.output * rate.output) /
  1e6;
const peak = { input: 0.3, cached: 0.006, output: 1.2 },
  offPeak = { input: 0.15, cached: 0.003, output: 0.6 };
const cost = {
  currency: "USD",
  source: "https://api-docs.deepseek.com/quick_start/pricing/",
  ratesChecked: "2026-11-07",
  basis:
    "Scale four actual optimized generation+audit requests; excludes subjective judge",
  projectedTokens: tokens,
  nominalOffPeak: estimate(offPeak),
  nominalOffPeakNoCache: estimate(offPeak, false),
  nominalPeak: estimate(peak),
  nominalPeakNoCache: estimate(peak, false),
  sameAverageWithMaximumCallsPeak:
    (estimate(peak, false) * recovery.maxProviderCalls) / 2,
  conservativePeakEnvelope:
    (50 * recovery.maxProviderCalls * (64000 * 0.3 + 2400 * 1.2)) / 1e6,
  caveat:
    "Estimates, not invoices or enforced dollar limits. Conservative input size is an assumption, not an application cap. Retry/repair content can differ. API call count is enforced.",
  judgeCost: judge.enabled
    ? "Requires separately verified selected-model rates"
    : "0; no independent judge configured; leave subjective scores pending",
  optionalUnconfiguredProJudge: {
    approved: false,
    extraCalls: 50,
    estimatedUsdOffPeakToPeakNoCache: [0.11613525, 0.2322705],
    basis:
      "Prior four judge requests scaled to 50 at published DeepSeek V4 Pro rates, all cache misses. Illustrative only; not configured or included in this run.",
  },
};
const exportData = submissionExportData(manifest);
for (const [file, hash] of protectedFiles)
  if (sha(await readFile(file)) !== hash)
    throw new Error("Preexisting evidence changed");
const report = {
  createdAt: new Date().toISOString(),
  caseSetVersion: manifest.caseSetVersion,
  gitCommit: manifest.gitCommit,
  promptVersion: manifest.promptVersion,
  brandBibleVersion: BRAND_VERSION,
  brandSourceSha256: manifest.brandSourceSha256,
  status: "PREFLIGHT_PASSED_AWAITING_USER_APPROVAL",
  preparedCases: 50,
  targetMessages: 150,
  scenarioDistribution: distribution,
  skuCoverage,
  selectionDepths: [...new Set(audits.map((a) => a.selectionDepth))].sort(),
  apiCallsThisPreflight: 0,
  liveCasesExecutedThisPreflight: 0,
  liveProvider: {
    provider: config.provider,
    model: config.model,
    keyConfigured: true,
    demo: false,
    endpointValidated: true,
    envIgnoredByGit: true,
    networkVerifiedThisPreflight: false,
    previousLiveEvidence: "evaluation/final-v1/evidence/after/records.json",
  },
  judgePolicy: judge,
  proposedCalls: {
    generation: 50,
    factualAudit: 50,
    offlineJudge: judge.enabled ? 50 : 0,
    nominal: 100 + (judge.enabled ? 50 : 0),
    maximum: 50 * (recovery.maxProviderCalls + (judge.enabled ? 1 : 0)),
    concurrency: 1,
  },
  recovery,
  cost,
  caseAudits: audits,
  humanReview:
    "PENDING; prepare representative cases, all failures, difficult objections and measured low scores after execution",
  spreadsheetExport: {
    target: "deliverables/Maison_Liore_50_Cases_Evaluation.xlsx",
    sheets: [
      "50 Test Cases",
      "Evaluation Scores",
      "Defects & Iteration",
      "Summary",
    ],
    status: "PENDING_LIVE_OUTPUTS_AND_AUTHORIZED_WRITER",
    blocker:
      "Required artifact-tool dependency loader unavailable in this session. No workbook created. Alternative writer requires explicit user authorization.",
  },
  preservation: { filesChecked: protectedFiles.size, changed: 0 },
  runtimePlanDirectory: planDirectory,
};
await save("manifest.json", manifest);
await save("preflight.json", report);
await save(
  "case-inputs.jsonl",
  manifest.cases
    .map((c) =>
      JSON.stringify({ ...c, executionStatus: "NOT_EXECUTED", messages: [] }),
    )
    .join("\n") + "\n",
);
await save(
  "case-inputs.csv",
  csv([exportData.columns, ...exportData.caseRows]),
);
await save("workbook-data.json", exportData);
await save(
  "preflight.md",
  `# Submission preflight\n\nStatus: **PREFLIGHT PASSED — awaiting user approval**. Exactly 50 valid fictional cases; all 15 canonical SKUs; selection depths 0–4. No paid calls or live generations in this preflight.\n\n## Distribution\n\n| Scenario | Cases |\n| --- | ---: |\n${Object.entries(
    distribution,
  )
    .map(([s, n]) => `| ${s} | ${n} |`)
    .join(
      "\n",
    )}\n\n## Execution proposal\n\nModel: ${config.model}; provider: ${config.provider}; demo: false; key configured but never printed. Independent judge: ${judge.status}. Nominal ${report.proposedCalls.nominal} calls; maximum ${report.proposedCalls.maximum}; concurrency 1. Existing bounded recovery policy remains unchanged. No manual or demo replacements. Failed outputs remain missing.\n\nProjected generation tokens: ${Math.ceil(tokens.input)} input, ${Math.ceil(tokens.output)} output, cached input subset ${Math.ceil(tokens.cached)}. Estimated nominal cost: $${cost.nominalOffPeak.toFixed(3)}–$${cost.nominalPeakNoCache.toFixed(3)}; scaling the same average to all ${report.proposedCalls.maximum} calls is roughly $${cost.sameAverageWithMaximumCallsPeak.toFixed(3)} peak. These are not enforced spending limits. A conservative 64k-input/2400-output-token assumption at the full default call ceiling is $${cost.conservativePeakEnvelope.toFixed(2)} peak. [Pricing source](${cost.source}), checked 2026-11-07.\n\nNo independent judge is configured, so there are zero subjective grading calls in this proposal and scores remain pending. An optional, unconfigured different-model Pro judge would add 50 calls and roughly $0.12–$0.23 without caching; it requires separate configuration and approval and will not run automatically. Production factual auditing is still mandatory.\n\n## Preservation and versions\n\nGit HEAD ${manifest.gitCommit}; prompt ${manifest.promptVersion}; Brand Bible ${BRAND_VERSION}. Frozen original final-50-v1 inputs and evidence remain unchanged. ${protectedFiles.size} preexisting protected files checked, zero changes. Exact run/prompt/source hashes and expanded inputs are in manifest.json.\n\n## Excel readiness\n\nThe requested four-sheet export data and eight exact first-sheet columns are prepared. Input CSV/JSONL and workbook-data.json contain blank output cells and NOT_EXECUTED status; they are not completed test results. Target: deliverables/Maison_Liore_50_Cases_Evaluation.xlsx. No workbook exists yet. Required artifact-tool dependency loader is unavailable; the installed skill prohibits alternative workbook libraries without explicit user permission.\n\n## After approval\n\nRun the existing production generator on this versioned set, preserve every checkpoint and provider-attempt trace, export JSONL/CSV, prepare human review, then author and verify the authorized Excel workbook. No extra generation retries beyond the existing policy. Do not claim 50-case completion if any case is missing three valid live messages.\n\nApproved-run recipe (not yet executed):\n\n\`\`\`sh\nnode --env-file-if-exists=.env scripts/final-evaluation.mjs --case-set submission-v2 --live --approve-paid-run --max-api-calls ${report.proposedCalls.maximum}\n\`\`\`\n`,
);
console.log(
  JSON.stringify({
    directory,
    status: report.status,
    validCases: 50,
    skuCoverage: skuCoverage.length,
    nominalCalls: report.proposedCalls.nominal,
    maximumCalls: report.proposedCalls.maximum,
    judge: judge.status,
    externalApiCalls: 0,
  }),
);
