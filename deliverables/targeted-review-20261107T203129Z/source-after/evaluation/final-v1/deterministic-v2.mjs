import { deterministicEvaluation } from "./deterministic.mjs";
import { scenarioFactErrors } from "../../server/scenario-facts.mjs";
import { splitParagraphs } from "../../server/message-contract.mjs";
export const DETERMINISTIC_VERSION = "final-deterministic-v2.1";
export function deterministicEvaluationV2(messages, context, input) {
  const original = deterministicEvaluation(messages, context, input);
  // Replace only the old ordered-location requirement. All other hard checks stay.
  const hard = original.hard.filter(
    (f) => f.ruleId !== "EVENT_REQUIRED_DETAILS",
  );
  for (const [index, candidate] of (messages || []).entries()) {
    if (
      scenarioFactErrors(splitParagraphs(candidate.text)[1] || "", {
        ...context,
        input,
      }).includes("活动正文缺少或更改了已核实的名称、日期时间或地点。")
    )
      hard.push({
        ruleId: "EVENT_REQUIRED_DETAILS",
        severity: "hard",
        candidateIndexes: [index],
      });
  }
  return {
    ...original,
    version: DETERMINISTIC_VERSION,
    passed: hard.length === 0,
    hard,
  };
}
