import { scenarios, motifs, lines, money } from "../../data/catalog.mjs";
export const CASE_COLUMNS = [
  "Case ID",
  "Scenario",
  "Client information",
  "Conversation history",
  "Product information",
  "Output 1",
  "Output 2",
  "Output 3",
];
const json = (value) => JSON.stringify(value, null, 2);
const name = (rows, id) => rows.find((r) => r.id === id);
export function submissionExportData(manifest, records = [], summary = null) {
  if (
    manifest.caseSetVersion !== "final-50-submission-v2" ||
    manifest.cases.length !== 50
  )
    throw new Error("Expected the approved submission-v2 50-case manifest");
  if (records.some((r) => r.source !== "live" || r.provider !== "deepseek"))
    throw new Error(
      "Final submission export accepts original live DeepSeek records only; fixtures and reused sample runs are excluded",
    );
  if (
    new Set(records.map((r) => r.id)).size !== records.length ||
    records.some((r) => !manifest.cases.some((c) => c.id === r.id))
  )
    throw new Error("Duplicate or unknown case record");
  const caseRows = [],
    scoreRows = [],
    reviewCases = [],
    defects = [];
  let complete = 0,
    actualMessages = 0;
  for (const c of manifest.cases) {
    const r = records.find((r) => r.id === c.id),
      ctx = c.context;
    if (r && JSON.stringify(r.input) !== JSON.stringify(c.input))
      throw new Error("Run input differs from frozen manifest");
    const messages = r?.messages || [];
    if (
      messages.length &&
      (messages.length !== 3 ||
        messages.some(
          (m, i) =>
            m.style !== ["concise", "detailed", "elegant"][i] ||
            typeof m.text !== "string",
        ))
    )
      throw new Error("Cannot export a malformed candidate set");
    const passed = Boolean(messages.length === 3 && r?.deterministic?.passed);
    complete += passed ? 1 : 0;
    actualMessages += messages.length;
    const client = {
      ...ctx.client,
      currentSelection: {
        motif: c.input.motif || null,
        line: c.input.line || null,
        sku: c.input.sku || null,
        purchaseOccasion: c.input.occasion || null,
        purchaseId: c.input.purchaseId || null,
      },
      additionalCommunicationContext: c.input.notes || "",
      concern: c.input.concern || null,
      reconnectReason: c.input.reconnectReason || null,
      greetingKind: c.input.greetingKind || null,
      greetingName: c.input.greetingName || null,
      event: ctx.event || null,
      expectedScenarioBehavior: c.expectedBehavior,
    };
    const grounding = ctx.normalized.grounding,
      product =
        grounding.product ||
        (c.input.scenario === "recommend" ? ctx.resolved.product : null);
    const productInfo = {
      motif: grounding.motif || name(motifs, c.input.motif) || null,
      line: grounding.line || name(lines, c.input.line) || null,
      product: product
        ? { ...product, displayedPrice: money(product.price) }
        : null,
      selectedHistoricalPurchase: ctx.purchase || null,
      selectionMode: grounding.mode,
      canonicalSource: grounding.source,
    };
    caseRows.push([
      c.id,
      scenarios.find((s) => s.id === c.input.scenario).zh,
      json(client),
      json(ctx.client.history || []),
      json(productInfo),
      ...[0, 1, 2].map((i) => messages[i]?.text ?? null),
    ]);
    const independentJudgment =
      r?.judge?.model && r.judge.model !== r.model ? r.judge : null;
    for (const failure of r?.recovery?.failures ||
      (r?.error ? [r.error] : [])) {
      defects.push({
        caseId: c.id,
        failureType: failure.code || "GENERATION_FAILED",
        originalBehavior:
          "Production pipeline withheld the failed candidate/response; rejected message text is not exposed by the production interface.",
        relevantError: failure,
        remediation: r?.recovery?.retryCount
          ? "Existing bounded transient retry or candidate-repair policy"
          : "Pending targeted diagnosis; no out-of-policy retry",
        retestOutcome: passed
          ? "RECOVERED_WITHIN_PRODUCTION_POLICY"
          : "INCOMPLETE",
        version: r.promptVersion,
      });
    }
    for (const failure of r?.deterministic?.hard || [])
      defects.push({
        caseId: c.id,
        failureType: "DETERMINISTIC_HARD",
        originalBehavior: messages.map((m) => m.text).join("\n\n---\n\n"),
        relevantError: failure,
        remediation: "Pending targeted repair; original evidence retained",
        retestOutcome: "NOT_RUN",
        version: r.promptVersion,
      });
    if (independentJudgment && !independentJudgment.softPassed)
      defects.push({
        caseId: c.id,
        failureType: "SOFT_QUALITY",
        originalBehavior: messages.map((m) => m.text).join("\n\n---\n\n"),
        relevantError: independentJudgment.judgment,
        remediation: "Human review and calibrated iteration pending",
        retestOutcome: "NOT_RUN",
        version: r.promptVersion,
      });
    scoreRows.push({
      caseId: c.id,
      scenario: c.input.scenario,
      executionStatus: r?.executionStatus || "NOT_EXECUTED",
      liveExecuted: Boolean(r),
      complete: passed,
      messageCount: messages.length,
      deterministic: r?.deterministic || null,
      qualityScore: independentJudgment?.caseScore ?? null,
      judgeMethod: independentJudgment
        ? "independent-model-offline-rubric"
        : "PENDING_INDEPENDENT_JUDGE",
      judgeModel: independentJudgment?.model || null,
      humanReviewStatus: "PENDING",
      provider: r?.provider || null,
      model: r?.model || null,
      promptVersion: r?.promptVersion || manifest.promptVersion,
      brandBibleVersion: r?.brandBibleVersion || manifest.brandBibleVersion,
      generatedAt: r?.generatedAt || null,
      latencyMs: r?.generationMs ?? null,
      apiLatencyMs: r?.apiLatencyMs ?? null,
      retryCount: r?.recovery?.retryCount ?? null,
      tokenUsage: r?.tokenUsage || null,
      error: r?.error || null,
    });
    if (
      r &&
      (r.error ||
        !passed ||
        (independentJudgment && !independentJudgment.softPassed) ||
        (["greeting", "care", "reactivate", "event", "price"].includes(
          c.input.scenario,
        ) &&
          !reviewCases.some((x) => x.scenario === c.input.scenario)) ||
        c.id === "F-009")
    )
      reviewCases.push({
        caseId: c.id,
        scenario: c.input.scenario,
        reason:
          r.error || !passed
            ? "failure/adjudication"
            : independentJudgment && !independentJudgment.softPassed
              ? "low-score"
              : "representative/difficult scenario",
        status: "PENDING_HUMAN_REVIEW",
      });
  }
  return {
    status: records.length
      ? complete === 50
        ? "LIVE_OUTPUTS_COMPLETE_REVIEW_PENDING"
        : "LIVE_OUTPUTS_INCOMPLETE"
      : "PREFLIGHT_ONLY_NOT_EXECUTED",
    columns: CASE_COLUMNS,
    caseRows,
    scoreRows,
    defects,
    reviewCases,
    counts: {
      prepared: 50,
      liveExecuted: records.length,
      complete,
      actualMessages,
      incomplete: 50 - complete,
    },
    summary,
    metadata: {
      caseSetVersion: manifest.caseSetVersion,
      promptVersion: manifest.promptVersion,
      brandBibleVersion: manifest.brandBibleVersion,
      model: manifest.model,
      judgePolicy: manifest.judgePolicy,
      createdAt: manifest.createdAt,
    },
  };
}
