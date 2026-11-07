export const RUBRIC_VERSION = "quality-rubric-v1";
export const criteria = {
  brandConsistency: {
    weight: 0.2,
    anchors: [
      "Overtly promotional or conflicts with restrained brand voice",
      "Several pushy/clichéd phrases or irrelevant storytelling",
      "Acceptable but generic; one noticeable tone lapse",
      "Refined, warm and restrained with relevant grounded imagery",
      "Consistently distinctive, precise and effortless without excess",
    ],
  },
  naturalness: {
    weight: 0.2,
    anchors: [
      "Unusable Chinese or incoherent sentences",
      "Awkward translation-like phrasing requiring substantial rewriting",
      "Understandable WeChat copy with noticeable stiffness",
      "Natural, fluent Chinese with only minor editing needed",
      "Reads like a thoughtful professional CA wrote it personally",
    ],
  },
  personalization: {
    weight: 0.2,
    anchors: [
      "Ignores explicit relevant context or invents personal facts",
      "Mostly generic; context appears only as pasted wording",
      "Uses one real detail but connects it weakly to purpose",
      "Naturally integrates the main known preference/context; handles sparse data honestly",
      "Precisely adapts useful known details and occasion with no intrusive assumptions",
    ],
  },
  scenarioRelevance: {
    weight: 0.25,
    anchors: [
      "Wrong scenario or essential purpose absent",
      "Purpose obscured by irrelevant selling/storytelling",
      "Purpose recognizable but priorities or details are uneven",
      "Clearly serves scenario, selected scope and occasion",
      "Every sentence advances the exact communication purpose with excellent restraint",
    ],
  },
  ctaQuality: {
    weight: 0.15,
    anchors: [
      "Unsafe pressure or unsupported promise",
      "Too commercial, confusing or multiple competing asks",
      "Safe but generic or loosely connected closing",
      "One clear, restrained next step or warm noncommercial closing",
      "Effortless closing that fits the relationship, scenario and customer's choice",
    ],
  },
};
export const differentiationAnchors = [
  "Three copies or contradictory messages",
  "Mostly synonym swaps; roles unclear",
  "Recognizable differences with overlap",
  "Concise focuses, Detailed adds useful facts, Elegant refines grounded imagery",
  "Three distinct, independently usable treatments; no padding or factual disagreement",
];
export const thresholds = {
  caseSoftScore: 4,
  minimumCandidateScore: 3.5,
  minimumBrandAndScenario: 3,
  minimumDifferentiation: 3,
  requiredCompletedCases: 50,
  requiredMessages: 150,
  minimumSoftPassRate: 0.9,
  minimumScenarioMean: 3.8,
  medianLatencyTargetMs: 8000,
  p95LatencyTargetMs: 15000,
};
export function qualityScore(judgment) {
  const scores = judgment.candidates.map((candidate) =>
    Object.entries(criteria).reduce(
      (sum, [key, criterion]) => sum + candidate.scores[key] * criterion.weight,
      0,
    ),
  );
  const mean = scores.reduce((a, b) => a + b, 0) / 3;
  return {
    candidateScores: scores,
    caseScore: 0.8 * mean + 0.2 * judgment.differentiation.score,
    softPassed:
      scores.every((score) => score >= thresholds.minimumCandidateScore) &&
      judgment.candidates.every(
        (candidate) =>
          candidate.scores.brandConsistency >= 3 &&
          candidate.scores.scenarioRelevance >= 3,
      ) &&
      judgment.differentiation.score >= 3 &&
      0.8 * mean + 0.2 * judgment.differentiation.score >= 4,
  };
}
