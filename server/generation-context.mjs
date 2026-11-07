import { motifs, lines, products, occasions } from "../data/catalog.mjs";

export const taskFields = [
  "clientId",
  "scenario",
  "motif",
  "line",
  "sku",
  "occasion",
  "purchaseId",
  "eventId",
  "notes",
  "concern",
  "reconnectReason",
  "greetingKind",
  "greetingName",
];
const identifiers = new Set(
  taskFields.filter(
    (field) =>
      !["notes", "concern", "reconnectReason", "greetingName"].includes(field),
  ),
);
export function normalizeTask(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  return Object.fromEntries(
    taskFields
      .filter((field) => Object.hasOwn(input, field))
      .map((field) => {
        const value = input[field];
        return [
          field,
          typeof value === "string"
            ? identifiers.has(field)
              ? value.trim() || null
              : value.replace(/\r\n?/g, "\n").trim()
            : value,
        ];
      }),
  );
}

export function selectionFor(input) {
  const entry = (value, catalog, key = "id", applicable = true) => ({
    state:
      value != null
        ? catalog.some((item) => item[key] === value)
          ? "explicit"
          : "unknown"
        : applicable
          ? "unselected"
          : "not_applicable",
    value: value ?? null,
    applicable,
  });
  return {
    depth: input.sku
      ? input.occasion
        ? 4
        : 3
      : input.line
        ? 2
        : input.motif
          ? 1
          : 0,
    motif: entry(input.motif, motifs, "id", input.scenario !== "care"),
    line: entry(input.line, lines, "id", input.scenario !== "care"),
    sku: entry(
      input.sku,
      products,
      "sku",
      !["greeting", "care"].includes(input.scenario),
    ),
    occasion: entry(
      input.occasion,
      occasions,
      "id",
      ["recommend", "price"].includes(input.scenario),
    ),
  };
}

export function normalizedContext(input, context) {
  const { demoPhrases, secondaryDemoPhrases, ...safeAdditionalContext } =
    context.communicationContext || {};
  const product = context.resolved?.product || null;
  const motifId = product?.motif || input.motif;
  const lineId = product?.line || input.line;
  const motif = motifs.find((item) => item.id === motifId) || null;
  const line =
    lines.find((item) => item.id === lineId && item.motif === motifId) || null;
  return {
    version: "generation-context-v2",
    task: input,
    clientId: context.client?.id || input.clientId,
    assignedAdvisor: context.client?.assignedAdvisor || null,
    scenario: input.scenario,
    selection: selectionFor(input),
    conversationHistory: context.client?.history || [],
    additionalContext: safeAdditionalContext,
    scenarioContext: {
      purchase: context.purchase,
      event: context.event,
      calendar: context.calendar,
      greetingKind: input.greetingKind || "birthday",
      festival: input.greetingName || null,
      concern: input.concern || "",
      reconnectReason: input.reconnectReason || "",
    },
    grounding: {
      source: "Brand Bible v1.0 · section 04",
      level: product ? "sku" : line ? "line" : motif ? "motif" : "none",
      mode:
        input.scenario === "care"
          ? "verified_purchase"
          : product
            ? input.sku
              ? "explicit_sku"
              : "deterministic_recommendation"
            : input.scenario === "price"
              ? "general_price"
              : "optional_story",
      motif,
      line,
      product,
      storyRequired: ["recommend", "care"].includes(input.scenario),
      productFactsAllowed: Boolean(product),
      exactPriceAllowed: Boolean(product) && input.scenario === "price",
    },
  };
}
