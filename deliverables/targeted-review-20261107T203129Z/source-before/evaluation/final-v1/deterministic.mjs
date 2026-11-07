import { assessCandidates } from "../../server/output-assessment.mjs";
import { splitParagraphs } from "../../server/message-contract.mjs";

export function deterministicEvaluation(messages, context, input) {
  const assessment = assessCandidates(
    messages,
    { ...context, input },
    { allowSemanticContextCheck: true },
  );
  const hard = [...assessment.hard];
  if (Array.isArray(messages))
    messages.forEach((candidate, index) => {
      if (
        /\b(?:JAS|MUG-[RC]|FEU-[VA])-[RBN]\d{2}\b/i.test(candidate.text || "")
      )
        hard.push({
          ruleId: "INTERNAL_IDENTIFIER",
          severity: "hard",
          candidateIndexes: [index],
        });
    });
  const compact = (s) => s.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
  const chinese = (n) =>
    n < 10
      ? ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"][n]
      : n < 20
        ? "十" + (n % 10 ? chinese(n % 10) : "")
        : chinese(Math.floor(n / 10)) + "十" + (n % 10 ? chinese(n % 10) : "");
  if (input.scenario === "event" && context.event && Array.isArray(messages)) {
    const date = context.event.date.match(
      /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/,
    );
    for (const [index, candidate] of messages.entries()) {
      const main = splitParagraphs(candidate.text)[1] || "",
        text = compact(main);
      const hour = date ? Number(date[4]) : 0,
        minute = date ? Number(date[5]) : 0;
      const dates = date
        ? [
            `${Number(date[2])}月${Number(date[3])}日`,
            `${date[1]}${date[2]}${date[3]}`,
            `${chinese(Number(date[2]))}月${chinese(Number(date[3]))}日`,
          ]
        : [];
      const timeOK =
        date &&
        (text.includes(`${date[4]}${date[5]}`) ||
          (minute === 0 &&
            new RegExp(
              `(?:${hour}|${chinese(hour)})点(?:整|钟)?(?![0-9一二三四五六七八九十零])`,
            ).test(text)) ||
          (minute === 0 &&
            hour > 12 &&
            new RegExp(
              `下午(?:${hour - 12}|${chinese(hour - 12)}|${hour - 12 === 2 ? "两" : "INVALID"})点(?:整|钟)?(?![0-9一二三四五六七八九十零])`,
            ).test(text)));
      const dateOK = date && dates.some((d) => text.includes(d)) && timeOK;
      if (
        !text.includes(compact(context.event.name)) ||
        !text.includes(compact(context.event.location)) ||
        !dateOK
      )
        hard.push({
          ruleId: "EVENT_REQUIRED_DETAILS",
          severity: "hard",
          candidateIndexes: [index],
        });
    }
  }
  if (
    input.scenario === "greeting" &&
    input.greetingKind !== "festival" &&
    Array.isArray(messages)
  )
    messages.forEach((candidate, index) => {
      if (!/生日/.test(splitParagraphs(candidate.text)[1] || ""))
        hard.push({
          ruleId: "BIRTHDAY_PURPOSE",
          severity: "hard",
          candidateIndexes: [index],
        });
    });
  return {
    version: "final-deterministic-v1",
    passed: hard.length === 0,
    hard,
    warnings: assessment.warnings,
    semanticGuard:
      "Mandatory production factual/scenario audit remains active; deterministic checks do not prove every semantic claim.",
  };
}
