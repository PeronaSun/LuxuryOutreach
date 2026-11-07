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

// The existing UI has no CTA choices. These short endings use the screenshot's
// neutral/professional consultation tone; none asserts stock, reserved time or a service benefit.
const ctas = {
  greeting: [
    "愿这份祝福，为您的日常添一份从容。",
    "若您愿意分享近来的美好片刻，我很乐意听。",
    "愿值得珍藏的小小欢喜，常伴您左右。",
  ],
  recommend: [
    "如您感兴趣，欢迎随时与我聊聊作品细节。",
    "您若想了解更多材质与设计细节，随时可以告诉我。",
    "如果您愿意，我很乐意继续为您介绍这件作品。",
  ],
  care: [
    "若有想交流的佩戴感受，欢迎随时告诉我。",
    "如果您有佩戴方面的疑问，欢迎随时与我沟通。",
    "您若愿意分享与这件作品相伴的片刻，我很乐意听。",
  ],
  reactivate: [
    "如果您愿意，欢迎随时和我聊聊珠宝想法。",
    "若您想继续了解这些设计，方便时联系我就好。",
    "您若有想分享或了解的，随时可以告诉我。",
  ],
  event: [
    "如果您有兴趣，欢迎告诉我您的参与意向。",
    "若这场分享与您的兴趣相合，欢迎与我沟通参与想法。",
    "您若愿意留意这次相聚，方便时告诉我就好。",
  ],
  price: [
    "您若愿意，可告诉我更在意哪些材质或设计细节。",
    "若还有想了解的价格与设计信息，欢迎随时与我沟通。",
    "不妨按自己的节奏考虑，想继续了解时随时告诉我。",
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
    ctaOptions: ctas[input.scenario] || [],
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
