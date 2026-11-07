import { products, motifs, lines } from "../data/catalog.mjs";
import { clients } from "../data/clients.mjs";

const scopes = [
  {},
  ...motifs.map((motif) => ({ motif: motif.id })),
  ...lines.map((line) => ({ motif: line.motif, line: line.id })),
  ...products.map((product) => ({
    motif: product.motif,
    line: product.line,
    sku: product.sku,
  })),
];
const contexts = {
  greeting: "客户刚完成一个项目，最近比较忙。",
  recommend: "客户希望找到适合日常佩戴的珠宝，喜欢低调、不夸张的设计。",
  reactivate: "客户最近比较忙。",
  event: "客户最近比较忙。",
  price: "客户觉得价格偏高，正在比较其他品牌。",
};
const definitions = [];
for (const scenario of [
  "greeting",
  "recommend",
  "reactivate",
  "event",
  "price",
]) {
  for (const scope of scopes.filter(
    (scope) => scenario !== "greeting" || !scope.sku,
  )) {
    const variants =
      scope.sku && ["recommend", "price"].includes(scenario)
        ? [null, "personal", "wedding", "gift"]
        : [null];
    for (const occasion of variants) {
      const festivals =
        scenario === "greeting" ? ["birthday", "圣诞节", "春节"] : [null];
      for (const festival of festivals) {
        const base = {
          clientId: "CL-001",
          scenario,
          ...scope,
          ...(occasion ? { occasion } : {}),
          ...(scenario === "event" ? { eventId: "EV-DEMO-01" } : {}),
          ...(scenario === "price"
            ? { concern: "价格高于预期，想了解设计。" }
            : {}),
          ...(festival === "birthday"
            ? { greetingKind: "birthday" }
            : festival
              ? { greetingKind: "festival", greetingName: festival }
              : {}),
        };
        for (const notes of ["", contexts[scenario]])
          definitions.push({ input: { ...base, notes } });
      }
    }
  }
}
for (const client of clients)
  for (const purchase of client.purchases) {
    const product = products.find((p) => p.sku === purchase.sku);
    for (const notes of [
      "",
      `客户说${product.category}佩戴很舒服，想了解日常搭配。`,
    ])
      definitions.push({
        input: {
          clientId: client.id,
          scenario: "care",
          purchaseId: purchase.id,
          notes,
        },
      });
  }
// Sparse profile, conflicting old interests, and a mismatched new suggestion in aftercare.
definitions.push(
  { input: { clientId: "CL-009", scenario: "recommend" } },
  {
    input: {
      clientId: "CL-001",
      scenario: "recommend",
      motif: "feuille",
      line: "aqua",
      sku: "FEU-A-B01",
      occasion: "gift",
    },
  },
  {
    input: {
      clientId: "CL-001",
      scenario: "care",
      purchaseId: "PUR-001-02",
      motif: "muguet",
      line: "rosee",
      sku: "MUG-R-R01",
    },
  },
);
export const reliabilityCases = definitions.map((definition, index) => ({
  id: `REL-${String(index + 1).padStart(3, "0")}`,
  ...definition,
}));

const bracelet = {
  clientId: "CL-001",
  scenario: "recommend",
  motif: "jasmin",
  line: "jasmin",
  sku: "JAS-B01",
  occasion: "personal",
  notes: "客户喜欢低调、适合日常佩戴的珠宝，不喜欢过于夸张的设计。",
};
export const liveSampleCases = [
  {
    id: "LIVE-GREETING",
    input: {
      clientId: "CL-002",
      scenario: "greeting",
      greetingKind: "festival",
      greetingName: "圣诞节",
      notes: "客户刚完成一个项目，最近比较忙。",
    },
  },
  { id: "LIVE-BRACELET-1", input: bracelet },
  {
    id: "LIVE-CARE-NECKLACE",
    input: {
      clientId: "CL-001",
      scenario: "care",
      purchaseId: "PUR-001-02",
      notes: "客户说项链佩戴很舒服，想了解日常搭配。",
    },
  },
  {
    id: "LIVE-REACTIVATE-NONE",
    input: {
      clientId: "CL-009",
      scenario: "reactivate",
      reconnectReason: "自然问候，听听近来的珠宝想法。",
      notes: "",
    },
  },
  {
    id: "LIVE-EVENT-MOTIF",
    input: {
      clientId: "CL-001",
      scenario: "event",
      motif: "muguet",
      eventId: "EV-DEMO-01",
      notes: "客户最近比较忙。",
    },
  },
  {
    id: "LIVE-PRICE-GENERAL",
    input: {
      clientId: "CL-001",
      scenario: "price",
      concern: "价格偏高，正在比较其他品牌，希望慢慢考虑。",
      notes: "",
    },
  },
  {
    id: "LIVE-RING",
    input: {
      clientId: "CL-001",
      scenario: "recommend",
      motif: "feuille",
      line: "vive",
      sku: "FEU-V-R01",
      occasion: "gift",
      notes: "",
    },
  },
  { id: "LIVE-BRACELET-2", input: { ...bracelet } },
];
