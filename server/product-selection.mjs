import { products } from "../data/catalog.mjs";

export function strongRestrictions(input, client) {
  const materials = [
    ["玫瑰金", "18K玫瑰金"],
    ["白金", "18K白金"],
    ["黄金", "18K黄金"],
  ];
  const notes = String(input.notes || "");
  let onlyMaterial = null;
  const excluded = new Set();
  for (const [word, material] of materials) {
    if (
      new RegExp(`(?:只考虑|仅考虑|只要|仅接受|只想要)(?:18[Kk])?${word}`).test(
        notes,
      )
    )
      onlyMaterial = material;
    if (
      new RegExp(`(?:不考虑|不要|避免|不想要|不喜欢)(?:18[Kk])?${word}`).test(
        notes,
      )
    )
      excluded.add(material);
  }
  if (
    !onlyMaterial &&
    /只考虑|仅考虑/.test(client.latestPreference?.text || "")
  )
    onlyMaterial = client.latestPreference.material;
  return { onlyMaterial, excludedMaterials: [...excluded] };
}
export function pricePredictionRelevant(input) {
  if (input.scenario !== "price") return true;
  const concern = String(input.concern || "");
  if (
    /不同作品|价格差异|一般.{0,3}价格|尚未选|还未选|未选定|尚未明确/.test(
      concern,
    )
  )
    return false;
  return Boolean(
    input.motif || input.line || /推荐|选一款|介绍一款/.test(concern),
  );
}
export function resolveProduct(input, client) {
  if (input.scenario === "care") {
    const purchase = client.purchases.find((p) => p.id === input.purchaseId);
    return {
      product: purchase
        ? products.find((p) => p.sku === purchase.sku) || null
        : null,
      source: "verified_purchase",
      prediction: null,
      scope: [],
      reason: "使用本次选定的历史购买记录。",
    };
  }
  if (input.scenario === "greeting")
    return {
      product: null,
      scope: [],
      source: "not_applicable",
      prediction: null,
      reason: "祝福场景不采用平台预测或自动推荐单品。",
    };
  const scope = products.filter(
    (p) =>
      (!input.motif || p.motif === input.motif) &&
      (!input.line || p.line === input.line) &&
      (!input.sku || p.sku === input.sku),
  );
  const restrictions = strongRestrictions(input, client);
  const allowed = (p) =>
    (!restrictions.onlyMaterial || p.material === restrictions.onlyMaterial) &&
    !restrictions.excludedMaterials.includes(p.material);
  if (input.sku) {
    const product = scope.find((p) => p.sku === input.sku) || null;
    return {
      product,
      scope,
      source: "ca_sku",
      prediction: null,
      restrictionConflict: Boolean(product && !allowed(product)),
      restrictions,
      reason: "严格采用顾问明确选择的 SKU；平台预测不改变当前选择。",
    };
  }
  const automatic =
    ["recommend", "reactivate", "price"].includes(input.scenario) &&
    pricePredictionRelevant(input);
  if (automatic) {
    const candidates = (client.predictedInterests || [])
      .filter(
        (p) =>
          p.source === "simulated_platform_prediction" &&
          p.isSimulated === true &&
          Number.isInteger(p.rank) &&
          p.rank > 0,
      )
      .map((prediction) => ({
        prediction,
        product: scope.find(
          (p) =>
            p.sku === prediction.sku &&
            p.line === prediction.line &&
            p.motif === prediction.motif,
        ),
      }))
      .filter(({ product }) => product && allowed(product))
      .sort(
        (a, b) =>
          a.prediction.rank - b.prediction.rank ||
          a.product.sku.localeCompare(b.product.sku),
      );
    if (candidates.length) {
      const { product, prediction } = candidates[0];
      return {
        product,
        scope,
        prediction,
        source: "simulated_platform_prediction",
        restrictions,
        reason: `采用当前顾问范围内排名第 ${prediction.rank} 的平台模拟预测；并非客户明确表达的偏好。`,
      };
    }
  }
  return {
    product: null,
    scope,
    source: "scope_only",
    prediction: null,
    restrictions,
    reason: automatic
      ? "当前范围内没有符合明确限制的平台预测，保留意象／系列层级，不强行指定单品。"
      : "当前场景仅使用已有选择层级，不自动引入平台预测单品。",
  };
}
