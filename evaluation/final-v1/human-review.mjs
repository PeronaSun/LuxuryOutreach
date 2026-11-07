import { criteria } from "./rubric.mjs";
export const CALIBRATION_CASE_IDS = [
  "F-001",
  "F-010",
  "F-028",
  "F-033",
  "F-039",
  "F-044",
];
export function reviewTemplate(records) {
  return records
    .filter((r) => r.messages?.length === 3)
    .map((r) => ({
      caseId: r.id,
      reviewer: null,
      reviewedAt: null,
      assignedCalibration: CALIBRATION_CASE_IDS.includes(r.id),
      candidates: r.messages.map((candidate) => ({
        style: candidate.style,
        scores: Object.fromEntries(Object.keys(criteria).map((k) => [k, null])),
      })),
      differentiationScore: null,
      confirmedHardRules: [],
      notes: "",
    }));
}
export function calibrate(records, reviews) {
  const differences = [],
    setDifferences = [],
    flags = [],
    reviewedIds = new Set();
  let reviewedCases = 0;
  for (const review of reviews) {
    if (!review.reviewer || !review.reviewedAt) continue;
    if (reviewedIds.has(review.caseId))
      throw new Error("Duplicate human review case");
    const record = records.find((r) => r.id === review.caseId);
    if (!record?.judge?.judgment)
      throw new Error("Human review does not match a scored case");
    if (
      !Number.isFinite(Date.parse(review.reviewedAt)) ||
      !Array.isArray(review.candidates) ||
      review.candidates.length !== 3
    )
      throw new Error("Incomplete human review");
    review.candidates.forEach((candidate, index) => {
      if (candidate.style !== record.messages[index].style)
        throw new Error("Human style mismatch");
      for (const key of Object.keys(criteria)) {
        const human = candidate.scores[key];
        if (!Number.isInteger(human) || human < 1 || human > 5)
          throw new Error("Human scores must be 1–5");
        const diff = Math.abs(
          human - record.judge.judgment.candidates[index].scores[key],
        );
        differences.push(diff);
        if (diff >= 2)
          flags.push({
            caseId: review.caseId,
            style: candidate.style,
            criterion: key,
            difference: diff,
          });
      }
    });
    if (
      !Number.isInteger(review.differentiationScore) ||
      review.differentiationScore < 1 ||
      review.differentiationScore > 5
    )
      throw new Error("Human set score required");
    setDifferences.push(
      Math.abs(
        review.differentiationScore -
          record.judge.judgment.differentiation.score,
      ),
    );
    if (setDifferences.at(-1) >= 2)
      flags.push({
        caseId: review.caseId,
        criterion: "setDifferentiation",
        difference: setDifferences.at(-1),
      });
    if (review.confirmedHardRules?.length)
      flags.push({
        caseId: review.caseId,
        criterion: "confirmedHardRules",
        ruleIds: review.confirmedHardRules,
      });
    reviewedCases++;
    reviewedIds.add(review.caseId);
  }
  return {
    status: reviewedCases ? "REVIEWED_SAMPLE" : "PENDING_HUMAN_REVIEW",
    reviewedCases,
    calibrationCasesReviewed: CALIBRATION_CASE_IDS.filter((id) =>
      reviewedIds.has(id),
    ),
    calibrationComplete: CALIBRATION_CASE_IDS.every((id) =>
      reviewedIds.has(id),
    ),
    scoreComparisons: differences.length,
    meanAbsoluteDifference: differences.length
      ? differences.reduce((a, b) => a + b, 0) / differences.length
      : null,
    setMeanAbsoluteDifference: setDifferences.length
      ? setDifferences.reduce((a, b) => a + b, 0) / setDifferences.length
      : null,
    flags,
    automaticScoreAdjustment: false,
  };
}
