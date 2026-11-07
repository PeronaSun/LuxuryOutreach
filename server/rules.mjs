import { products, lines, scenarios, occasions } from "../data/catalog.mjs";
import { clients, events, clientProfile } from "../data/clients.mjs";
import { messagePlan, splitParagraphs } from "./message-contract.mjs";
import { normalizeTask, normalizedContext } from "./generation-context.mjs";
import {
  applicationCalendar,
  festivalContext,
} from "./application-calendar.mjs";
import {
  communicationContext,
  currentPreferenceScore,
  contextCoverageErrors,
} from "./communication-context.mjs";
export const PROMPT_VERSION = "advisor-1.4.1";
export const productScenarios = new Set([
  "recommend",
  "reactivate",
  "event",
  "price",
]);
export const forbiddenRequest =
  /(?:编造|虚构|捏造|假装|承诺|提供|给[她他您客户]*|告诉[她他客户]*).{0,14}(?:折扣|优惠|打折|现货|库存|证书|保修|生日|席位|皇室)|(?:打[一二三四五六七八九\d]折|[一二三四五六七八九\d]折优惠|保证升值|保值增值|全网最低|最后机会|今天必须下单)|(?:ignore|忽略|无视|绕过).{0,30}(?:规则|指令|限制|同意|instructions|rules)|(?:system\s*:|developer\s*:)|(?:使用|提及|利用).{0,12}(?:未授权|未经许可).{0,15}(?:生日|家庭|预算|购买|隐私)/i;
export function resolveProduct(input, client) {
  if (input.scenario === "care") {
    const purchase = client.purchases.find((p) => p.id === input.purchaseId);
    return {
      product: purchase ? products.find((p) => p.sku === purchase.sku) : null,
      reason: "使用本次选定的历史购买记录。",
      scope: [],
    };
  }
  if (!productScenarios.has(input.scenario))
    return { product: null, reason: "此场景无需产品。", scope: [] };
  if (input.scenario !== "recommend" && !input.sku)
    return {
      product: null,
      reason:
        input.scenario === "price"
          ? "作品尚未明确，仅回应实际价格顾虑，不引用单品规格或价格。"
          : "保留已选意象或系列作为可选背景，不自动推荐单品。",
      scope: [],
    };
  const scope = products.filter(
    (p) =>
      (!input.motif || p.motif === input.motif) &&
      (!input.line || p.line === input.line) &&
      (!input.sku || p.sku === input.sku),
  );
  if (!scope.length)
    return { product: null, scope, reason: "没有匹配的产品。" };
  const interests = client.interests;
  const score = (p) =>
    interests.reduce(
      (s, i) =>
        s +
        (i.sku === p.sku ? 100 : 0) +
        (i.line === p.line ? 30 : 0) +
        (i.motif === p.motif ? 12 : 0) +
        (i.category === p.category ? 10 : 0) +
        (i.material === p.material ? 8 : 0) +
        (i.gemstone && i.gemstone === p.gemstone ? 8 : 0),
      0,
    ) +
    (client.latestPreference?.material === p.material ? 150 : 0) +
    (lines.find((l) => l.id === p.line).occasions.includes(input.occasion)
      ? 2
      : 0);
  const currentContext = communicationContext(input);
  const ranked = [...scope].sort(
    (a, b) =>
      currentPreferenceScore(b, currentContext) -
        currentPreferenceScore(a, currentContext) ||
      score(b) - score(a) ||
      a.sku.localeCompare(b.sku),
  );
  return {
    product: ranked[0],
    scope,
    reason: input.sku
      ? "采用顾问明确选择的 SKU。"
      : currentPreferenceScore(ranked[0], currentContext) > 0
        ? "在当前选择范围内优先匹配本次明确表达的偏好。"
        : score(ranked[0]) > 0
          ? "在当前范围内匹配已有偏好；同分按 SKU 字母顺序。"
          : "无明确偏好匹配，按 SKU 字母顺序选择；未推断客户偏好。",
  };
}
export function evaluateRequest(input, { now = new Date() } = {}) {
  input = normalizeTask(input);
  const calendar = applicationCalendar(now);
  const issues = [];
  const add = (status, message, code) => issues.push({ status, message, code });
  if (!input || typeof input !== "object" || Array.isArray(input))
    return {
      status: "BLOCKED",
      issues: [{ status: "BLOCKED", message: "请求格式无效。", code: "input" }],
    };
  const client = clients.find((c) => c.id === input.clientId);
  for (const field of [
    "clientId",
    "scenario",
    "motif",
    "line",
    "sku",
    "occasion",
    "purchaseId",
    "eventId",
    "greetingKind",
  ])
    if (
      input[field] != null &&
      (typeof input[field] !== "string" || input[field].length > 100)
    )
      add("BLOCKED", "选择值格式无效。", "selection-format");
  if (!client) add("NEEDS_REVIEW", "请选择有效的示例客户。", "client");
  if (!scenarios.some((s) => s.id === input.scenario))
    add("NEEDS_REVIEW", "请选择沟通场景。", "scenario");
  for (const field of ["notes", "concern", "reconnectReason", "greetingName"])
    if (
      input[field] != null &&
      (typeof input[field] !== "string" || input[field].length > 2000)
    )
      add("BLOCKED", "输入文本过长或格式无效。", "text");
  if (!client || issues.length)
    return {
      status: issues.some((i) => i.status === "BLOCKED")
        ? "BLOCKED"
        : "NEEDS_REVIEW",
      issues,
      client,
    };
  const joined = [
    input.notes,
    input.concern,
    input.reconnectReason,
    input.greetingName,
  ]
    .filter((v) => typeof v === "string")
    .join("\n");
  if (forbiddenRequest.test(joined))
    add(
      "BLOCKED",
      "上下文包含编造事实、不相关隐私或绕过规则的要求，请修改。",
      "unsupported",
    );
  if (input.motif && !["jasmin", "muguet", "feuille"].includes(input.motif))
    add("BLOCKED", "自然意象不存在。", "motif");
  if (
    input.line &&
    !lines.some((l) => l.id === input.line && l.motif === input.motif)
  )
    add("BLOCKED", "系列与所选自然意象不匹配。", "line");
  if (
    input.sku &&
    !products.some(
      (p) =>
        p.sku === input.sku && p.line === input.line && p.motif === input.motif,
    )
  )
    add("BLOCKED", "产品必须属于当前系列与自然意象。", "sku");
  if (input.occasion && !occasions.some((o) => o.id === input.occasion))
    add("BLOCKED", "购买场合无效。", "occasion");
  if (input.scenario === "greeting") {
    if (
      input.greetingKind !== "festival" &&
      client.birthMonth !== calendar.month
    )
      add(
        "NEEDS_REVIEW",
        `温馨提示：${client.name}的生日月为 ${client.birthMonth} 月，当前为 ${calendar.month} 月，暂不适合发送生日祝福。可改选节日问候。`,
        "birthday-month",
      );
    if (
      input.greetingKind &&
      !["birthday", "festival"].includes(input.greetingKind)
    )
      add("NEEDS_REVIEW", "请选择生日或节日。", "greeting-kind");
    if (input.greetingKind === "festival" && !input.greetingName?.trim())
      add("NEEDS_REVIEW", "请填写已确认的节日名称。", "festival");
  }
  const purchase =
    input.scenario === "care"
      ? client.purchases.find((p) => p.id === input.purchaseId) || null
      : null;
  if (input.scenario === "care" && !purchase)
    add("NEEDS_REVIEW", "选择一条历史购买记录，即可生成佩戴关怀。", "purchase");
  let event = null;
  if (input.scenario === "event") {
    event = events.find((e) => e.id === input.eventId && e.verified);
    if (!event)
      add(
        "NEEDS_REVIEW",
        "请选择一场示例活动，以使用已有的时间与地点。",
        "event",
      );
  }
  if (input.scenario === "price") {
    if (!input.concern?.trim())
      add("NEEDS_REVIEW", "请记录客户实际表达的价格顾虑。", "concern");
  }
  const resolved = resolveProduct(input, client);
  if (input.scenario === "recommend" && !resolved.product)
    add("NEEDS_REVIEW", "请重新选择有效的产品范围。", "scope");
  const notesContext = communicationContext(input, resolved.product);
  const notices = [];
  const effectiveMaterial =
    notesContext.preferences.material || client.latestPreference?.material;
  if (
    productScenarios.has(input.scenario) &&
    resolved.product &&
    effectiveMaterial &&
    resolved.product.material !== effectiveMaterial
  ) {
    notices.push(
      `本次采用${resolved.product.material}作品；客户近期偏好为${effectiveMaterial}。当前选择优先，历史偏好保持原记录。`,
    );
  }
  const status = issues.some((i) => i.status === "BLOCKED")
    ? "BLOCKED"
    : issues.length
      ? "NEEDS_REVIEW"
      : "READY";
  const context = {
    status,
    issues,
    notices,
    client: clientProfile(client),
    resolved,
    event,
    purchase,
    calendar,
    communicationContext: notesContext,
  };
  context.normalized = normalizedContext(input, context);
  return context;
}
export const styles = ["concise", "detailed", "elegant"];
export function validateMessage(t, context, { enforceCta = true } = {}) {
  const errors = [];
  if (
    typeof t !== "string" ||
    !t.trim() ||
    !/[\u4e00-\u9fff]/.test(t) ||
    t.length > 600
  )
    return ["消息语言或长度无效。"];
  const paragraphs = splitParagraphs(t);
  const plan = messagePlan(context.input || {}, context);
  if (paragraphs.length === 3 && !/[\u4e00-\u9fff]/.test(paragraphs[1]))
    errors.push("正文必须使用中文。");
  if (paragraphs.length !== 3)
    errors.push("每条消息必须恰好包含三段，以换行分隔。");
  if (
    paragraphs[0] !== plan.greeting ||
    (t.match(/Bonjour/g) || []).length !== 1
  )
    errors.push("问候必须使用客户姓名与固定顾问，并只出现一次Bonjour。");
  if (
    enforceCta &&
    paragraphs.length === 3 &&
    !plan.ctaOptions.includes(paragraphs[2])
  )
    errors.push("收尾不符合当前场景的克制表达。");
  if (
    paragraphs.length === 3 &&
    (!/[\u4e00-\u9fff]/.test(paragraphs[2]) ||
      /必须|赶紧|立刻购买|立即下单/.test(paragraphs[2]) ||
      (context.input?.scenario === "greeting" &&
        /购买|选购|预约|到店|款式推荐/.test(paragraphs[2])))
  )
    errors.push("收尾包含不合场景的行动或语言。");
  if (
    /(?:^|\n)(?:Greeting|Main(?: Message)?|Product Story|CTA|正文|第一段|第二段|第三段|行动邀请|产品故事)\s*[:：]/i.test(
      t,
    )
  )
    errors.push("客户消息不能包含段落标题。");
  if (
    /折扣|打折|优惠|现货|库存|证书|保修|保证|升值|保值|全网最低|最后机会|必须购买|高净值|沉睡客户|转化概率|皇室|手工.{0,5}小时|备妥|已为您备好|已经帮你备好|已妥善留存|专属接待时间|已预留|到店名额/.test(
      t,
    )
  )
    errors.push("输出包含未经支持的主张。");
  if (/\p{Extended_Pictographic}/u.test(t))
    errors.push("此版本默认不使用表情。");
  const allowed = context.resolved?.product;
  const grounding = context.normalized?.grounding;
  const story = plan.story;
  const factText = t
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/18k/gi, "18K");
  const skuMatches =
    factText.match(/(?:JAS|MUG-[A-Z]|FEU-[A-Z])-[A-Z]\d{2}/g) || [];
  if (skuMatches.some((s) => s !== allowed?.sku))
    errors.push("输出引用范围外 SKU。");
  if (skuMatches.some((s) => s === allowed?.sku))
    errors.push("客户消息包含内部SKU标识。");
  const clauses = factText.split(/[。！？；，]/);
  const affirmative = (word) =>
    clauses.some(
      (clause) =>
        clause.includes(word) &&
        !new RegExp(`(?:不含|没有|未镶嵌|无|并非|不是).{0,4}${word}`).test(
          clause,
        ),
    );
  const knownMaterials = new Set(
    [
      context.client?.latestPreference?.material,
      ...(context.client?.interests || []).map((interest) => interest.material),
      context.communicationContext?.preferences?.material,
    ].filter(Boolean),
  );
  for (const material of ["18K玫瑰金", "18K白金", "18K黄金"])
    if (
      affirmative(material) &&
      material !== allowed?.material &&
      !clauses
        .filter((clause) => clause.includes(material))
        .every(
          (clause) =>
            knownMaterials.has(material) &&
            /您.{0,8}(?:偏好|偏爱|喜欢|关注)/.test(clause) &&
            !/这款|作品采用|镶嵌/.test(clause),
        )
    )
      errors.push("输出材质与产品不符。");
  if (
    affirmative("海蓝宝") &&
    allowed?.gemstone !== "海蓝宝" &&
    !(
      !allowed &&
      `${story?.motif?.story || ""}${story?.line?.story || ""}`.includes(
        "海蓝宝",
      )
    )
  )
    errors.push("输出宝石与 SKU 不符。");
  if (affirmative("钻石") && allowed?.gemstone !== "钻石")
    errors.push("输出宝石未获 SKU 描述支持。");
  if (
    allowed &&
    paragraphs[1] &&
    ["戒指", "项链", "手镯"].some(
      (category) =>
        category !== allowed.category &&
        new RegExp(
          `(?:这款|这枚|这条|这件|这只|该款|所选).{0,8}${category}`,
        ).test(paragraphs[1]),
    )
  )
    errors.push("输出品类与产品不符。");
  for (const line of lines)
    if (
      t.includes(line.name) &&
      line.id !== allowed?.line &&
      line.id !== story?.line?.id &&
      line.name !== story?.motif?.name
    )
      errors.push("输出引用范围外系列。");
  const prices = [...factText.matchAll(/[¥￥]\s*([\d,]+)|([\d,]+)\s*元/g)].map(
    (m) => Number((m[1] || m[2]).replaceAll(",", "")),
  );
  if (prices.some((p) => p !== allowed?.price))
    errors.push("输出价格与档案不符。");
  if (
    /\d+\s*岁|(?<!新的)[一二三四五六七八九十百零〇两]+\s*岁|您的(?:先生|丈夫|太太|妻子|女儿|儿子|母亲|父亲)|您(?:结婚|怀孕|收入)/.test(
      t,
    )
  )
    errors.push("输出包含未经证实的私人属性。");
  if (
    context.input?.scenario === "greeting" &&
    context.input?.greetingKind !== "festival"
  ) {
    if (
      /今天|今日|当天|这个特别的日子|\d{1,2}月\d{1,2}[日号]|\d{4}-\d{2}-\d{2}|\d{1,2}[日号]/.test(
        t,
      )
    )
      errors.push("生日月问候不能推断具体生日或今天过生日。");
    const months = [...t.matchAll(/(\d{1,2})月/g)].map((m) => Number(m[1]));
    if (months.some((month) => month !== context.client?.birthMonth))
      errors.push("生日月份与客户资料不符。");
  }
  if (context.input?.scenario !== "greeting" && /生日快乐|节日快乐/.test(t))
    errors.push("问候与当前场景不符。");
  if (paragraphs.length === 3) {
    const main = paragraphs[1];
    errors.push(
      ...contextCoverageErrors(
        main,
        context.communicationContext ||
          communicationContext(context.input || {}, context.resolved?.product),
      ),
    );
    if (
      context.input?.scenario === "greeting" &&
      context.input?.greetingKind === "festival"
    ) {
      const festival = festivalContext(
        context.input.greetingName,
        context.calendar,
      );
      if (
        /今天|今日|当天|大年初一|正月初一|\d{1,2}月\d{1,2}[日号]|\d{4}-\d{2}-\d{2}/.test(
          main,
        )
      )
        errors.push("节日问候不能自行断言今天过节或编造具体日期。");
      if (festival.kind === "christmas" && !/圣诞/.test(main))
        errors.push("三种表达的正文都需要明确体现圣诞氛围。");
      if (festival.kind === "spring" && !/新春|春节|新年/.test(main))
        errors.push("三种表达的正文都需要明确体现新春氛围。");
      const allowMix = context.communicationContext?.allowFestivalMix;
      if (
        !allowMix &&
        ((festival.kind === "christmas" &&
          /春节|新春|农历|大年初/.test(main)) ||
          (festival.kind === "spring" && /圣诞/.test(main)))
      )
        errors.push("正文混用了未选择的节日氛围。");
    }
  }
  const allowedMotif = context.resolved?.product?.motif || grounding?.motif?.id;
  if (allowedMotif) {
    const imagery = {
      jasmin: ["茉莉"],
      muguet: ["铃兰"],
      feuille: ["叶脉", "叶片"],
    };
    for (const [motif, words] of Object.entries(imagery))
      if (motif !== allowedMotif && words.some((word) => t.includes(word)))
        errors.push("正文引用了其他自然意象的故事。");
  }
  return [...new Set(errors)];
}
function textSimilarity(a, b) {
  const normalize = (t) => t.replace(/[^\p{Script=Han}\d]/gu, "");
  const grams = (t) =>
    new Set(
      Array.from({ length: Math.max(0, t.length - 2) }, (_, i) =>
        t.slice(i, i + 3),
      ),
    );
  const x = grams(normalize(a)),
    y = grams(normalize(b));
  const intersection = [...x].filter((g) => y.has(g)).length;
  return intersection / (x.size + y.size - intersection || 1);
}
export function validateCandidates(candidates, context) {
  if (!Array.isArray(candidates) || candidates.length !== 3)
    return ["必须恰好返回三条候选消息。"];
  const errors = [];
  candidates.forEach((c, i) => {
    if (c?.style !== styles[i]) errors.push("候选风格或顺序无效。");
    errors.push(...validateMessage(c?.text, context));
  });
  const paragraphs = candidates.map((c) => splitParagraphs(c?.text));
  if (paragraphs.every((p) => p.length === 3)) {
    const mains = paragraphs.map((p) => p[1]);
    if (
      new Set(mains).size !== 3 ||
      [
        [0, 1],
        [0, 2],
        [1, 2],
      ].some(([a, b]) => textSimilarity(mains[a], mains[b]) > 0.84)
    )
      errors.push("三种风格的正文过于相似。");
    if (mains[1].length <= mains[0].length)
      errors.push("更丰富版本需要提供比简洁版本更多的正文信息。");
    if (new Set(paragraphs.map((p) => p[2])).size < 2)
      errors.push("请为三种表达使用适当变化的收尾。");
  }
  return [...new Set(errors)];
}
