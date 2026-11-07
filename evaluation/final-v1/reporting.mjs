import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { criteria, thresholds } from "./rubric.mjs";
import { reviewTemplate, calibrate } from "./human-review.mjs";
import { distribution } from "../../server/performance-metrics.mjs";

export const csv = (rows) =>
  "\uFEFF" +
  rows
    .map((row) =>
      row
        .map((value) => '"' + String(value ?? "").replaceAll('"', '""') + '"')
        .join(","),
    )
    .join("\n") +
  "\n";
export function evaluationSummary(records, reviews = []) {
  const completed = records.filter((r) => r.messages?.length === 3),
    scored = records.filter((r) => r.judge?.judgment),
    hardPassed = records.filter((r) => r.deterministic?.passed),
    softPassed = scored.filter(
      (r) =>
        r.deterministic?.passed &&
        r.judge.softPassed &&
        !r.judge.judgment.additionalHardConcerns.length,
    );
  const human = calibrate(records, reviews);
  const styleMetrics = Object.fromEntries(
    ["concise", "detailed", "elegant"].map((style, index) => [
      style,
      {
        scoredCases: scored.length,
        criteriaMeans: Object.fromEntries(
          Object.keys(criteria).map((key) => [
            key,
            scored.length
              ? scored.reduce(
                  (sum, r) =>
                    sum + r.judge.judgment.candidates[index].scores[key],
                  0,
                ) / scored.length
              : null,
          ]),
        ),
      },
    ]),
  );
  const stages = [
    ...new Set(
      records.flatMap((r) =>
        (r.performance?.measurements || []).map((m) => m.stage),
      ),
    ),
  ];
  const byScenario = Object.fromEntries(
    [...new Set(records.map((r) => r.input.scenario))].map((s) => {
      const group = records.filter((r) => r.input.scenario === s),
        scores = group.filter((r) => r.judge?.judgment);
      return [
        s,
        {
          cases: group.length,
          generated: group.filter((r) => r.messages.length === 3).length,
          hardPassed: group.filter((r) => r.deterministic?.passed).length,
          scored: scores.length,
          meanSoftScore: scores.length
            ? scores.reduce((sum, r) => sum + r.judge.caseScore, 0) /
              scores.length
            : null,
          latency: distribution(
            group
              .filter((r) => r.messages.length === 3)
              .map((r) => r.generationMs),
          ),
        },
      ];
    }),
  );
  return {
    cases: records.length,
    generatedMessages: completed.length * 3,
    generationCompleted: completed.length,
    generationSuccessRate: records.length
      ? completed.length / records.length
      : null,
    deterministicPassed: hardPassed.length,
    hardPassRate: records.length ? hardPassed.length / records.length : null,
    generationFailures: records.filter((r) => r.error).length,
    hardFailedCases: records.filter(
      (r) => r.deterministic && !r.deterministic.passed,
    ).length,
    scored: scored.length,
    softPassed: softPassed.length,
    softPassRate: scored.length ? softPassed.length / scored.length : null,
    softPassRateAllCases: records.length
      ? softPassed.length / records.length
      : null,
    unscoredCases: records.length - scored.length,
    styleMetrics,
    differentiation: distribution(
      scored.map((r) => r.judge.judgment.differentiation.score),
    ),
    generationRecoveryInEvidence: records.reduce(
      (s, r) => ({
        providerCalls: s.providerCalls + (r.recovery?.providerCalls || 0),
        transientRetries:
          s.transientRetries + (r.recovery?.transientRetries || 0),
        outputRepairs: s.outputRepairs + (r.recovery?.outputRepairs || 0),
      }),
      { providerCalls: 0, transientRetries: 0, outputRepairs: 0 },
    ),
    judgeReviewFlags: scored.filter(
      (r) => r.judge.judgment.additionalHardConcerns.length,
    ).length,
    human,
    byScenario,
    latency: distribution(completed.map((r) => r.generationMs)),
    failureLatency: distribution(
      records.filter((r) => r.error).map((r) => r.generationMs),
    ),
    allAttemptLatency: distribution(records.map((r) => r.generationMs)),
    stageLatency: Object.fromEntries(
      stages.map((stage) => [
        stage,
        distribution(
          records.map((r) => {
            const group = (r.performance?.measurements || []).filter(
              (m) => m.stage === stage && Number.isFinite(m.durationMs),
            );
            return group.length
              ? group.reduce((sum, m) => sum + m.durationMs, 0)
              : null;
          }),
        ),
      ]),
    ),
    acceptance: {
      criteria: "Project-defined, not employer requirements",
      completion:
        records.length === 50 &&
        completed.length === 50 &&
        hardPassed.length === 50 &&
        records.every((r) => r.source !== "mock"),
      artifactSlotsComplete: records.length === 50 && completed.length === 50,
      completeLiveEvidence:
        records.length === 50 &&
        completed.length === 50 &&
        records.every((r) => r.source.startsWith("live")),
      quality:
        records.length === 50 &&
        scored.length === 50 &&
        softPassed.length >= 45 &&
        Object.values(byScenario).every(
          (s) => s.meanSoftScore >= thresholds.minimumScenarioMean,
        ),
      humanCalibration: human.calibrationComplete && human.flags.length === 0,
      finalPaidRunPerformed:
        records.length === 50 && records.every((r) => r.source === "live"),
    },
  };
}
export async function exportEvaluation(
  directory,
  records,
  metadata,
  reviews = [],
) {
  const save = (name, text) =>
    writeFile(resolve(directory, name), text, { flag: "wx" });
  const summary = evaluationSummary(records, reviews),
    template = reviewTemplate(records);
  await save(
    "human-review-submitted.json",
    JSON.stringify(reviews, null, 2) + "\n",
  );
  await save("records.json", JSON.stringify(records, null, 2) + "\n");
  await save(
    "records.jsonl",
    records.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  await save(
    "summary.json",
    JSON.stringify({ ...metadata, ...summary }, null, 2) + "\n",
  );
  const header = [
    "case_id",
    "scenario",
    "style",
    "execution_source",
    "generation_status",
    "message",
    "complete_input_json",
    "context_json",
    "deterministic_json",
    "generation_model",
    "prompt_version",
    "judge_model",
    "judge_version",
    ...Object.keys(criteria),
    "candidate_soft_score",
    "case_soft_score",
    "set_differentiation",
    "generation_ms",
    "human_review_status",
  ];
  const rows = records.flatMap((r) =>
    ["concise", "detailed", "elegant"].map((style, index) => [
      r.id,
      r.input.scenario,
      style,
      r.source,
      r.messages.length === 3 ? "COMPLETED" : "NOT_COMPLETED",
      r.messages[index]?.text ?? null,
      JSON.stringify(r.input),
      JSON.stringify(r.context),
      JSON.stringify(r.deterministic),
      r.model,
      r.promptVersion,
      r.judge?.model,
      r.judge?.version,
      ...Object.keys(criteria).map(
        (key) => r.judge?.judgment?.candidates[index]?.scores[key],
      ),
      r.judge?.candidateScores[index],
      r.judge?.caseScore,
      r.judge?.judgment?.differentiation.score,
      r.generationMs,
      reviews.some(
        (review) =>
          review.caseId === r.id && review.reviewer && review.reviewedAt,
      )
        ? "REVIEWED"
        : "PENDING",
    ]),
  );
  await save("messages.csv", csv([header, ...rows]));
  await save("human-review.json", JSON.stringify(template, null, 2) + "\n");
  await save(
    "human-review.csv",
    csv([
      [
        "case_id",
        "style",
        "message",
        ...Object.keys(criteria),
        "set_differentiation",
        "reviewer",
        "reviewed_at",
        "confirmed_hard_rules",
        "notes",
      ],
      ...records.flatMap((r) =>
        r.messages.map((c) => [
          r.id,
          c.style,
          c.text,
          ...Object.keys(criteria).map(() => ""),
          "",
          "",
          "",
          "",
          "",
        ]),
      ),
    ]),
  );
  const defects = records.flatMap((r) => [
    ...(r.error ? [{ caseId: r.id, type: "GENERATION", ...r.error }] : []),
    ...(r.deterministic?.hard || []).map((f) => ({
      caseId: r.id,
      type: "HARD",
      ...f,
    })),
    ...(r.judge?.judgment?.additionalHardConcerns || []).map((f) => ({
      caseId: r.id,
      type: "HUMAN_ADJUDICATION_REQUIRED",
      ...f,
    })),
    ...(r.judge && !r.judge.softPassed
      ? [{ caseId: r.id, type: "SOFT_QUALITY", caseScore: r.judge.caseScore }]
      : []),
    ...(r.judgeError
      ? [{ caseId: r.id, type: "UNSCORED_JUDGE_FAILURE", ...r.judgeError }]
      : []),
  ]);
  await save("defects.json", JSON.stringify(defects, null, 2) + "\n");
  await save(
    "report.md",
    `# Evaluation run\n\nSource: ${metadata.mode}. Cases: ${summary.cases}; generated messages: ${summary.generatedMessages}; deterministic passes: ${summary.deterministicPassed}; judged cases: ${summary.scored}; soft passes: ${summary.softPassed}.\n\nGeneration success rate: ${summary.generationSuccessRate}; soft pass rate among scored cases: ${summary.softPassRate}. Unscored cases are not silently treated as passes.\n\nHuman calibration: **${summary.human.status}** (${summary.human.reviewedCases} reviewed cases). No human scores were fabricated.\n\nThis run is ${summary.acceptance.finalPaidRunPerformed ? "a 50-case live run" : "not a completed 50-case live evaluation"}. See summary.json for scenario/latency breakdowns, records.jsonl and messages.csv for complete evidence, defects.json for defects, and human-review files for annotations.\n`,
  );
  return summary;
}
