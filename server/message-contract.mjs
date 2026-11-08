import { motifs, lines, products } from "../data/catalog.mjs";
import { festivalContext } from "./application-calendar.mjs";

export const MESSAGE_FORMAT_VERSION = "three-paragraph-v1";
export const DEMO_MODEL = "demo-template-v1.4";

export function greetingFor(client) {
  if (!client?.name || !client.assignedAdvisor)
    throw new Error("客户顾问资料不完整。");
  return `Bonjour，${client.name}，我是 Maison Lioré 的珠宝顾问 ${client.assignedAdvisor}。`;
}

export function splitParagraphs(text) {
  return typeof text === "string"
    ? text
        .replace(/\r\n?/g, "\n")
        .trim()
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
}

export function storyFor(product, grounding = null) {
  if (!product)
    return grounding?.motif
      ? {
          source: grounding.source,
          motif: grounding.motif,
          line: grounding.line,
          product: null,
        }
      : null;
  const sku = products.find((p) => p.sku === product.sku);
  if (!sku) throw new Error("作品资料不存在。");
  const motif = motifs.find((m) => m.id === sku.motif);
  const line = lines.find((l) => l.id === sku.line);
  return { source: "Brand Bible v1.0 · section 04", motif, line, product: sku };
}

// Style-ordered examples for each scenario, not a mandatory wording whitelist.
// Live generation may paraphrase safely; none asserts stock or a booked arrangement.
const ctas = {
  greeting: [
    "愿您近来一切顺心，常有小小欢喜。",
    "愿接下来的日子轻松顺遂，也有更多值得珍藏的美好片刻。",
    "愿温柔与喜悦，长伴您的日常。",
  ],
  recommend: [
    "想多了解这件作品，随时找我就好。",
    "如果您想近距离了解设计细节，可以提前告诉我，我会协助安排合适的到店时间。",
    "若您希望进一步了解这件作品，欢迎在方便时与我交流。",
  ],
  care: [
    "佩戴时有任何疑问，随时告诉我就好。",
    "之后佩戴这件作品时若有想进一步了解的细节，随时联系我，我会协助您一起确认。",
    "日常佩戴中若有想进一步了解的细节，欢迎随时与我交流。",
  ],
  reactivate: [
    "近来有想聊的珠宝想法，随时找我就好。",
    "如果最近有想了解的作品或新的佩戴想法，欢迎方便时告诉我，我很乐意再为您细细介绍。",
    "若您近来有想细看的设计，欢迎在闲暇时与我交流。",
  ],
  event: [
    "对这次活动感兴趣的话，告诉我就好。",
    "如果您方便参加这次活动，欢迎告诉我您的参与意向，我们再一起确认相关细节。",
    "若这次相聚正合您的兴致，欢迎在方便时与我聊聊参与意向。",
  ],
  price: [
    "您按自己的节奏考虑，有疑问随时问我就好。",
    "您可以慢慢比较；如果还有想了解的材质或设计细节，我很乐意为您进一步说明。",
    "不必急于决定，若有希望进一步了解之处，欢迎在方便时与我交流。",
  ],
};

export const occasionDirections = {
  personal:
    "自用：把已核实设计与个人风格、日常佩戴或自我表达相连，不承诺舒适度或耐久性。",
  wedding:
    "婚礼：连接仪式、庆祝和纪念片刻；不推断客户是新娘/新郎，不声称此SKU是官方婚嫁专款。",
  gift: "送礼：连接心意、作品象征与值得珍藏的记忆，不推断收礼人与客户的关系或未知喜好。",
};

export const styleDirections = {
  concise:
    "更简洁：第二段1–2句，只选一个核心故事意象与最相关SKU事实，短而完整。",
  detailed:
    "更丰富：第二段2–4句，交代Motif意象、Line叙事、精确SKU设计/材质，再用真实偏好或场合解释关联；信息最多，不能堆形容词。",
  elegant:
    "更优雅：第二段2–3句，使用该Motif/Line原文中的自然、光影与记忆意象；保留SKU事实，语言含蓄，不能只是把详细版加长。",
};

export function messagePlan(input, context) {
  const { demoPhrases, secondaryDemoPhrases, ...safeContext } =
    context.communicationContext || {};
  return {
    version: MESSAGE_FORMAT_VERSION,
    greeting: greetingFor(context.client),
    story: storyFor(context.resolved?.product, context.normalized?.grounding),
    grounding: context.normalized?.grounding || null,
    selection: context.normalized?.selection || null,
    occasion:
      input.occasion && ["recommend", "price"].includes(input.scenario)
        ? { id: input.occasion, direction: occasionDirections[input.occasion] }
        : null,
    communicationContext: context.communicationContext ? safeContext : null,
    greetingContext:
      input.scenario === "greeting"
        ? {
            kind: input.greetingKind || "birthday",
            calendar: context.calendar,
            birthMonth: context.client.birthMonth,
            festival:
              input.greetingKind === "festival"
                ? festivalContext(input.greetingName, context.calendar)
                : null,
          }
        : null,
    styles: context.resolved?.product
      ? styleDirections
      : {
          concise: "更简洁：直接回应当前场景与主要背景，不填充单品细节。",
          detailed:
            "更丰富：展开真实沟通背景、已知活动或所选意象/系列；没有明确单品就不编造规格。",
          elegant:
            "更优雅：以克制自然的语言回应场景，可浓缩已选故事，不推断私人生活或商品事实。",
        },
    ctaOptions:
      input.scenario === "recommend" && !context.resolved?.product
        ? ctas.recommend.map((text) =>
            text
              .replace("这件作品", "这个设计方向")
              .replace("作品细节", "设计方向"),
          )
        : ctas[input.scenario] || [],
  };
}

export function assembleCandidates(parts, input, context) {
  const plan = messagePlan(input, context);
  const styles = ["concise", "detailed", "elegant"];
  if (!Array.isArray(parts) || parts.length !== 3)
    throw new Error("模型返回格式无效，请重试。");
  return parts.map((part, i) => {
    if (
      part?.style !== styles[i] ||
      typeof part.main !== "string" ||
      !part.main.trim() ||
      typeof part.cta !== "string" ||
      !part.cta.trim() ||
      part.cta.trim().length > 100
    )
      throw new Error("模型返回格式无效，请重试。");
    return {
      style: part.style,
      text: [
        plan.greeting,
        part.main.replace(/\s+/gu, " ").trim(),
        part.cta.replace(/\s+/gu, " ").trim(),
      ].join("\n\n"),
    };
  });
}
