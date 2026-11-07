import { products } from "../../data/catalog.mjs";
import { clients } from "../../data/clients.mjs";

export const CASESET_VERSION = "final-50-v1";
export const EVALUATION_TIME = "2026-11-07T04:00:00Z";
const definitions = [];
const add = (name, input, tags = []) =>
  definitions.push({ name, fictional: true, input, tags });
const selected = (sku, extra = {}) => {
  const p = products.find((p) => p.sku === sku);
  return {
    clientId: "CL-001",
    scenario: "recommend",
    motif: p.motif,
    line: p.line,
    sku,
    ...extra,
  };
};
const greeting = (clientId, greetingKind, greetingName, notes = "") => ({
  clientId,
  scenario: "greeting",
  greetingKind,
  ...(greetingName ? { greetingName } : {}),
  notes,
});
add("Birthday month, no additional context", greeting("CL-001", "birthday"), [
  "birthday",
  "empty-context",
]);
add(
  "Birthday month after completed project",
  greeting("CL-001", "birthday", null, "客户刚完成一个项目，最近比较忙。"),
  ["birthday", "context"],
);
add("Christmas, no product scope", greeting("CL-002", "festival", "圣诞节"), [
  "christmas",
]);
add(
  "Christmas with project/rest context",
  greeting("CL-002", "festival", "圣诞节", "客户刚完成一个项目，最近比较忙。"),
  ["christmas", "context"],
);
add(
  "Spring Festival with sparse profile",
  greeting("CL-009", "festival", "春节"),
  ["spring-festival", "sparse-profile"],
);
add(
  "Spring Festival during a busy period",
  greeting("CL-005", "festival", "春节", "客户最近比较忙。"),
  ["spring-festival", "context"],
);
add(
  "Mid-Autumn greeting prepared in advance",
  greeting("CL-006", "festival", "中秋节"),
  ["festival"],
);
add(
  "New Year greeting without product promotion",
  greeting("CL-003", "festival", "元旦"),
  ["festival"],
);
for (const product of products)
  add(
    `Canonical recommendation: ${product.sku}`,
    selected(product.sku, {
      occasion: "personal",
      notes:
        product.sku === "JAS-B01"
          ? "客户喜欢低调、适合日常佩戴的珠宝，不喜欢过于夸张的设计。"
          : "",
    }),
    ["all-sku", product.category, product.gemstone || "no-gemstone"],
  );
add(
  "Same bracelet, wedding occasion",
  selected("JAS-B01", {
    occasion: "wedding",
    notes: "客户喜欢低调、适合日常佩戴的珠宝，不喜欢过于夸张的设计。",
  }),
  ["occasion-comparison"],
);
add(
  "Same bracelet, gift occasion",
  selected("JAS-B01", {
    occasion: "gift",
    notes: "客户喜欢低调、适合日常佩戴的珠宝，不喜欢过于夸张的设计。",
  }),
  ["occasion-comparison"],
);
add(
  "Recommendation with sparse profile and no selection",
  { clientId: "CL-009", scenario: "recommend", notes: "" },
  ["sparse-profile", "depth-0"],
);
for (const id of ["CL-001", "CL-002", "CL-005"])
  for (const purchase of clients.find((client) => client.id === id).purchases) {
    const p = products.find((product) => product.sku === purchase.sku);
    add(
      `Care for verified purchase ${purchase.id}`,
      {
        clientId: id,
        scenario: "care",
        purchaseId: purchase.id,
        notes:
          purchase.sku === "JAS-N01"
            ? "客户说项链佩戴很舒服，想了解日常搭配。"
            : "",
      },
      ["verified-purchase", p.category],
    );
  }
add(
  "Reactivation, no product and sparse profile",
  {
    clientId: "CL-009",
    scenario: "reactivate",
    reconnectReason: "自然问候，听听近来的珠宝想法。",
    notes: "",
  },
  ["depth-0"],
);
add(
  "Reactivation during a busy period",
  { clientId: "CL-001", scenario: "reactivate", notes: "客户最近比较忙。" },
  ["context"],
);
add(
  "Reactivation with selected Feuille motif over old interests",
  { clientId: "CL-001", scenario: "reactivate", motif: "feuille", notes: "" },
  ["scope-conflict", "depth-1"],
);
add(
  "Reactivation at Rosée line level",
  {
    clientId: "CL-002",
    scenario: "reactivate",
    motif: "muguet",
    line: "rosee",
    notes: "",
  },
  ["depth-2"],
);
add(
  "Reactivation with explicit Aqua necklace",
  selected("FEU-A-N01", {
    clientId: "CL-005",
    scenario: "reactivate",
    notes: "",
  }),
  ["depth-3"],
);
add(
  "Reactivation with a new material direction",
  selected("FEU-V-R01", { scenario: "reactivate", notes: "客户最近比较忙。" }),
  ["scope-conflict"],
);
add(
  "Invitation with no product",
  { clientId: "CL-009", scenario: "event", eventId: "EV-DEMO-01", notes: "" },
  ["depth-0"],
);
add(
  "Invitation with Muguet motif and busy context",
  {
    clientId: "CL-001",
    scenario: "event",
    motif: "muguet",
    eventId: "EV-DEMO-01",
    notes: "客户最近比较忙。",
  },
  ["depth-1", "scope-conflict"],
);
add(
  "Invitation with Jasmin line",
  {
    clientId: "CL-001",
    scenario: "event",
    motif: "jasmin",
    line: "jasmin",
    eventId: "EV-DEMO-01",
    notes: "",
  },
  ["depth-2"],
);
add(
  "Invitation with optional Aqua product",
  selected("FEU-A-N01", {
    clientId: "CL-005",
    scenario: "event",
    eventId: "EV-DEMO-01",
    notes: "客户最近比较忙。",
  }),
  ["depth-3"],
);
add(
  "Invitation with Clochette line",
  {
    clientId: "CL-004",
    scenario: "event",
    motif: "muguet",
    line: "clochette",
    eventId: "EV-DEMO-01",
    notes: "",
  },
  ["depth-2"],
);
add(
  "Difficult competitor comparison without SKU",
  {
    clientId: "CL-001",
    scenario: "price",
    concern: "价格偏高，正在比较其他品牌，希望慢慢考虑。",
    notes: "",
  },
  ["general-price", "competitor"],
);
add(
  "General price concern at Feuille motif level",
  {
    clientId: "CL-001",
    scenario: "price",
    motif: "feuille",
    concern: "为什么不同作品价格差异这么大？",
    notes: "",
  },
  ["general-price", "depth-1"],
);
add(
  "General price concern at Clochette line level",
  {
    clientId: "CL-004",
    scenario: "price",
    motif: "muguet",
    line: "clochette",
    concern: "想了解这个系列的价格考量，尚未选定具体作品。",
    notes: "",
  },
  ["general-price", "depth-2"],
);
add(
  "Bracelet within budget, design is the concern",
  selected("JAS-B01", {
    scenario: "price",
    occasion: "personal",
    concern: "没有超出预算，更关心设计与日常搭配。",
    notes: "客户说价格在预算内，更关心日常搭配。",
  }),
  ["negation", "price"],
);
add(
  "Ring price comparison",
  selected("JAS-R01", {
    scenario: "price",
    concern: "价格偏高，想和其他品牌比较。",
    notes: "客户觉得价格偏高，正在比较其他品牌。",
  }),
  ["competitor", "price"],
);
add(
  "High-value Aqua necklace price objection",
  selected("FEU-A-N01", {
    clientId: "CL-005",
    scenario: "price",
    concern: "觉得价格很高，想知道已知材质和设计能说明什么。",
    notes: "",
  }),
  ["price", "high-value"],
);
add(
  "Leaf ring price within budget",
  selected("FEU-V-R01", {
    scenario: "price",
    concern: "价格在预算内，主要关心绿色珐琅和设计。",
    notes: "",
  }),
  ["negation", "price"],
);

export const finalCases = definitions.map((definition, index) => ({
  id: `F-${String(index + 1).padStart(3, "0")}`,
  ...definition,
}));
if (finalCases.length !== 50)
  throw new Error(`Expected 50 cases, got ${finalCases.length}`);
export const PROFILE_CASE_IDS = ["F-004", "F-010", "F-028", "F-044"];
