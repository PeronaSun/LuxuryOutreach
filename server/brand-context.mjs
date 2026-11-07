import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const text = await readFile(
  new URL("../docs/brand-bible-v1.txt", import.meta.url),
  "utf8",
);
export const BRAND_SOURCE_SHA256 = createHash("sha256")
  .update(text)
  .digest("hex");
const sections = new Map(
  [...text.matchAll(/^(0[1-8])  [\s\S]*?(?=^0[1-8]  |$(?![\s\S]))/gm)].map(
    (match) => [match[1], match[0].trim()],
  ),
);
if (sections.size !== 8)
  throw new Error("Brand Bible section extraction failed");
const scenarioNumber = {
  greeting: 1,
  recommend: 2,
  care: 3,
  reactivate: 4,
  event: 5,
  price: 6,
};
const scenarioRows = sections.get("07").split("\n");
const cache = new Map();
export function brandContext(scenario, { audit = false } = {}) {
  const key = `${scenario}:${audit}`;
  if (!cache.has(key)) {
    const index = scenarioRows.findIndex((line) =>
      line.startsWith(`${scenarioNumber[scenario]} `),
    );
    if (index < 0) throw new Error("Unknown brand scenario");
    // Exact source excerpts, not an LLM summary. Canonical selected Motif/Line/SKU
    // facts remain in messagePlan; unrelated personas and 14 other SKUs are omitted.
    cache.set(
      key,
      [
        sections.get("01"),
        ...(audit ? [] : [sections.get("03")]),
        sections.get("06"),
        "07 场景原文",
        ...scenarioRows.slice(index, index + 4),
      ].join("\n\n"),
    );
  }
  return cache.get(key);
}
