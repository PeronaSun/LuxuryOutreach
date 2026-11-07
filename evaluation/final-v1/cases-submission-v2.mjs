// Additive submission distribution. The original final-50-v1 cases/evidence stay intact.
import { finalCases as priorCases, EVALUATION_TIME } from "./cases.mjs";
import { products, scenarios } from "../../data/catalog.mjs";
export { EVALUATION_TIME };
export const CASESET_VERSION = "final-50-submission-v2";
export const REQUIRED_DISTRIBUTION = {
  greeting: 8,
  recommend: 12,
  care: 8,
  reactivate: 8,
  event: 7,
  price: 7,
};
const reuse = (id) => {
  const source = priorCases.find((c) => c.id === id);
  if (!source) throw new Error("Unknown prior case");
  return { ...structuredClone(source), legacyCaseId: id };
};
const selected = (sku, extra = {}) => {
  const product = products.find((p) => p.sku === sku);
  if (!product) throw new Error("Unknown canonical product");
  return {
    clientId: "CL-001",
    scenario: "recommend",
    motif: product.motif,
    line: product.line,
    sku,
    ...extra,
  };
};
const added = (name, input, tags) => ({ name, input, tags, fictional: true });
const behavior = {
  greeting:
    "Use the requested birthday month or festival. Keep wishes warm and noncommercial; no product promotion or invented birthday day/date.",
  recommend:
    "Respect current selection and purchase occasion over historical interests. Ground product facts and Motif/Line story in the canonical resolved product; no invented specifications or discounts.",
  care: "Follow up on exactly the selected historical purchase and its canonical facts. Never substitute historical preferences or another purchase; avoid unsupported service promises.",
  reactivate:
    "Reconnect naturally using known history/context and the current optional selection. No invented prior conversations, new arrivals, stock or pressure.",
  event:
    "Invite to the verified fictional event, including its exact name, date/time and location. Optional product selection stays in scope; do not promise reserved seats or services.",
  price:
    "Address the actual concern and any negation accurately. Use only allowed known facts and current selection; no unsupported discounts, valuation claims or disparagement of competitors.",
};
const definitions = [
  ...priorCases
    .filter((c) => c.input.scenario === "greeting")
    .map((c) => reuse(c.id)),
  reuse("F-010"),
  reuse("F-024"),
  reuse("F-025"),
  added("Jasmin ring with explicit SKU and no occasion", selected("JAS-R01"), [
    "depth-3",
    "canonical-story",
  ]),
  added(
    "Rosée ring for personal use",
    selected("MUG-R-R01", { occasion: "personal" }),
    ["depth-4", "history-conflict"],
  ),
  added(
    "Clochette diamond ring gift",
    selected("MUG-C-R01", { occasion: "gift" }),
    ["canonical-story", "diamond"],
  ),
  added(
    "Clochette bracelet gift",
    selected("MUG-C-B01", { occasion: "gift" }),
    ["canonical-story", "no-gemstone"],
  ),
  added(
    "Clochette necklace for wedding",
    selected("MUG-C-N01", { clientId: "CL-004", occasion: "wedding" }),
    ["wedding", "canonical-story"],
  ),
  added(
    "Feuille Vive bracelet for personal use",
    selected("FEU-V-B01", { occasion: "personal" }),
    ["history-conflict", "no-gemstone"],
  ),
  added(
    "Feuille Vive enamel necklace",
    selected("FEU-V-N01", { occasion: "personal" }),
    ["enamel", "canonical-story"],
  ),
  added(
    "Aqua bracelet gift",
    selected("FEU-A-B01", { clientId: "CL-005", occasion: "gift" }),
    ["aquamarine", "gift"],
  ),
  reuse("F-026"),
  ...priorCases
    .filter((c) => c.input.scenario === "care")
    .map((c) => reuse(c.id)),
  added(
    "Care for Wu's exact Jasmin necklace purchase",
    {
      clientId: "CL-003",
      scenario: "care",
      purchaseId: "PUR-003-01",
      notes: "",
    },
    ["verified-purchase", "white-gold"],
  ),
  added(
    "Care for Shen's exact Rosée bracelet purchase",
    {
      clientId: "CL-006",
      scenario: "care",
      purchaseId: "PUR-006-01",
      notes: "",
    },
    ["verified-purchase", "no-gemstone"],
  ),
  ...priorCases
    .filter((c) => c.input.scenario === "reactivate")
    .map((c) => reuse(c.id)),
  added(
    "Sparse-profile reactivation with Muguet motif",
    { clientId: "CL-009", scenario: "reactivate", motif: "muguet", notes: "" },
    ["sparse-profile", "depth-1"],
  ),
  added(
    "Sparse-profile reactivation with enamel necklace",
    selected("FEU-V-N01", {
      clientId: "CL-007",
      scenario: "reactivate",
      notes: "",
    }),
    ["sparse-profile", "depth-3"],
  ),
  ...priorCases
    .filter((c) => c.input.scenario === "event")
    .map((c) => reuse(c.id)),
  added(
    "Sparse-profile event invitation at Feuille motif depth",
    {
      clientId: "CL-009",
      scenario: "event",
      motif: "feuille",
      eventId: "EV-DEMO-01",
      notes: "",
    },
    ["sparse-profile", "depth-1"],
  ),
  added(
    "Event invitation with exact Aqua bracelet",
    selected("FEU-A-B01", {
      clientId: "CL-002",
      scenario: "event",
      eventId: "EV-DEMO-01",
      notes: "",
    }),
    ["verified-event", "depth-3"],
  ),
  ...priorCases
    .filter((c) => c.input.scenario === "price")
    .map((c) => reuse(c.id)),
];
export const finalCases = definitions.map((definition, index) => ({
  ...definition,
  id: `F-${String(index + 1).padStart(3, "0")}`,
  scenarioLabel: scenarios.find((s) => s.id === definition.input.scenario).zh,
  expectedBehavior: behavior[definition.input.scenario],
}));
if (finalCases.length !== 50)
  throw new Error("Submission set must contain 50 cases");
