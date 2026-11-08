import { motifs, lines, products } from "../data/catalog.mjs";
import { explicitPreferences } from "./communication-context.mjs";
// Conservative local checks supplement the mandatory semantic factual audit.
// Predictions are never added to this independent client-evidence ledger.
export function unsupportedPredictionAttribution(text, context) {
  if (context.resolved?.source !== "simulated_platform_prediction")
    return false;
  const p = context.resolved.product,
    client = context.client;
  const notes = String(context.input?.notes || "");
  const interests = client.interests || [];
  const hasSku =
    interests.some((i) => i.sku === p.sku) ||
    (/喜欢|偏爱|关注|留意/.test(notes) &&
      !/不喜欢|不偏爱|不关注|未提到/.test(notes) &&
      (notes.includes(p.sku) || notes.includes(p.name)));
  const hasPurchase = (client.purchases || []).some(
    (item) => item.sku === p.sku,
  );
  const knownMotif = interests.some(
    (i) =>
      i.motif === p.motif ||
      lines.some((l) => l.id === i.line && l.motif === p.motif) ||
      products.some((s) => s.sku === i.sku && s.motif === p.motif),
  );
  const knownLine = interests.some(
    (i) =>
      i.line === p.line ||
      products.some((s) => s.sku === i.sku && s.line === p.line),
  );
  const knownCategory =
    interests.some((i) => i.category === p.category) ||
    explicitPreferences(notes).preferences.category === p.category;
  const ownMotif = motifs.find((m) => m.id === p.motif),
    ownLine = lines.find((l) => l.id === p.line);
  const noIndependentProfile =
    !interests.length &&
    !client.history?.length &&
    !client.latestPreference &&
    !notes.trim();
  return text.split(/[。！？；，]/).some((clause) => {
    if (/^(?:如果|若|如您|倘若)/.test(clause.trim())) return false;
    if (
      !/您.{0,18}(?:喜欢|偏爱|关注|留意|提到|说过|表示|已购|已经购买|已经选购|买过|购买过|购买了|购入|选择过|选择了|感兴趣)/.test(
        clause,
      )
    )
      return false;
    if (
      /已购|已经购买|已经选购|买过|购买过|购买了|购入|选择过|选择了/.test(
        clause,
      ) &&
      /这(?:款|件|枚|只|条)|作品/.test(clause)
    )
      return !hasPurchase;
    if (/这(?:款|件|枚|只|条)/.test(clause) || clause.includes(p.name))
      return !hasSku;
    if (
      [ownLine.name, ownLine.zh].some(
        (name) =>
          clause.includes(name) && !(name === ownMotif.name && knownMotif),
      ) &&
      !knownLine
    )
      return true;
    if (
      [ownMotif.name, ownMotif.zh].some((name) => clause.includes(name)) &&
      !knownMotif
    )
      return true;
    if (clause.includes(p.category) && !knownCategory) return true;
    return noIndependentProfile;
  });
}
