import { validateCandidates, validateMessage } from "./rules.mjs";

// Existing factual validators stay active. Only explicit mechanical quality
// checks become warnings; semantic context coverage is still audited as hard.
const softRules = {
  "三种风格的正文过于相似。": "STYLE_SIMILARITY",
  "更丰富版本需要提供比简洁版本更多的正文信息。": "STYLE_DETAIL",
  "请为三种表达使用适当变化的收尾。": "CTA_VARIATION",
  "正文未体现本次补充沟通背景中的主要需求。": "CONTEXT_LEXICAL_CHECK",
  "收尾不符合当前场景的克制表达。": "CTA_WORDING",
};
const hardRules = {
  "活动正文缺少或更改了已核实的名称、日期时间或地点。":
    "EVENT_REQUIRED_DETAILS",
  "把所选意象描述成了未经核实的活动议程。": "EVENT_UNVERIFIED_AGENDA",
  "空白客户历史不能支持过去兴趣的断言。": "FACT_CUSTOMER_HISTORY",
  "必须恰好返回三条候选消息。": "CANDIDATE_COUNT",
  "候选风格或顺序无效。": "CANDIDATE_STYLE",
  "消息语言或长度无效。": "LANGUAGE_OR_SIZE",
  "正文必须使用中文。": "CHINESE_MAIN",
  "每条消息必须恰好包含三段，以换行分隔。": "PARAGRAPH_COUNT",
  "问候必须使用客户姓名与固定顾问，并只出现一次Bonjour。": "GREETING_IDENTITY",
  "收尾不符合当前场景的克制表达。": "CTA_CONTRACT",
  "客户消息不能包含段落标题。": "CUSTOMER_HEADINGS",
  "输出包含未经支持的主张。": "PROHIBITED_CLAIM",
  "此版本默认不使用表情。": "EMOJI_POLICY",
  "输出引用范围外 SKU。": "WRONG_SKU",
  "输出材质与产品不符。": "FACT_MATERIAL",
  "输出品类与产品不符。": "FACT_CATEGORY",
  "客户消息包含内部SKU标识。": "INTERNAL_IDENTIFIER",
  "收尾包含不合场景的行动或语言。": "CTA_UNSAFE",
  "输出宝石与 SKU 不符。": "FACT_GEMSTONE",
  "输出宝石未获 SKU 描述支持。": "FACT_GEMSTONE",
  "输出引用范围外系列。": "WRONG_LINE",
  "输出价格与档案不符。": "FACT_PRICE",
  "输出包含未经证实的私人属性。": "FACT_CUSTOMER",
  "生日月问候不能推断具体生日或今天过生日。": "BIRTHDAY_DATE",
  "生日月份与客户资料不符。": "BIRTHDAY_MONTH",
  "问候与当前场景不符。": "SCENARIO_MISMATCH",
  "节日问候不能自行断言今天过节或编造具体日期。": "FESTIVAL_DATE",
  "三种表达的正文都需要明确体现圣诞氛围。": "CHRISTMAS_THEME",
  "三种表达的正文都需要明确体现新春氛围。": "SPRING_THEME",
  "正文混用了未选择的节日氛围。": "FESTIVAL_MIX",
  "正文引用了其他自然意象的故事。": "WRONG_MOTIF",
};
export function assessCandidates(
  candidates,
  context,
  { allowSemanticContextCheck = false } = {},
) {
  const errors = validateCandidates(candidates, context);
  const indexes = (error) =>
    Array.isArray(candidates)
      ? candidates.flatMap((candidate, index) =>
          validateMessage(candidate?.text, context).includes(error)
            ? [index]
            : [],
        )
      : [];
  const isSoft = (error) =>
    softRules[error] &&
    (softRules[error] !== "CONTEXT_LEXICAL_CHECK" || allowSemanticContextCheck);
  return {
    hard: errors
      .filter((error) => !isSoft(error))
      .map((error) => ({
        ruleId:
          softRules[error] === "CONTEXT_LEXICAL_CHECK"
            ? "CONTEXT_MISSING"
            : hardRules[error] || "OUTPUT_POLICY",
        severity: "hard",
        candidateIndexes: indexes(error),
      })),
    warnings: errors.filter(isSoft).map((error) => ({
      ruleId: softRules[error],
      severity: "soft",
      candidateIndexes: indexes(error),
    })),
  };
}
