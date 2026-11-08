import { products } from "./catalog.mjs";
import platformPredictions from "./platform-predictions.json" with { type: "json" };
// All profiles, months, purchases and event logistics are fictional demonstration data.
// Every demo client is eligible for outreach; only minimal, relevant profile fields reach the model.
export const DEMO_CONTEXT_DATE = "2026-11-05";
function purchaseRecord({ id, sku, date, occasion, advisorNotes }) {
  const product = products.find((p) => p.sku === sku);
  if (!product) throw new Error("Unknown purchase SKU");
  return {
    id,
    sku,
    productName: product.name,
    motif: product.motif,
    line: product.line,
    category: product.category,
    purchaseDate: date,
    purchasePrice: product.price,
    ...(occasion ? { occasion } : {}),
    ...(advisorNotes ? { advisorNotes } : {}),
  };
}
export const clients = [
  {
    birthMonth: 11,
    interests: [
      {
        motif: "jasmin",
        line: "jasmin",
        category: "戒指",
        sku: "JAS-R01",
        material: "18K玫瑰金",
      },
    ],
    history: ["喜欢星夜茉莉的戒指，希望日常佩戴也自然。"],
    latestPreference: {
      material: "18K玫瑰金",
      text: "最近明确表示偏爱玫瑰金。",
    },
    id: "CL-001",
    assignedAdvisor: "Sophie",
    name: "林女士",
    initial: "林",
    note: "偏爱茉莉花形与玫瑰金",
    purchaseInputs: [
      {
        id: "PUR-001-01",
        sku: "JAS-R01",
        date: "2026-09-18",
        occasion: "personal",
        advisorNotes: "曾表达对纤细花形设计与日常珠宝的偏好。",
      },
      {
        id: "PUR-001-02",
        sku: "JAS-N01",
        date: "2026-06-12",
        occasion: "personal",
        advisorNotes: "曾表达对纤细花形设计与日常珠宝的偏好。",
      },
    ],
  },
  {
    birthMonth: 3,
    interests: [
      {
        motif: "feuille",
        line: "aqua",
        gemstone: "海蓝宝",
        category: "项链",
      },
    ],
    history: ["想了解海蓝宝吊坠的设计，也在考虑价格。"],
    latestPreference: null,
    id: "CL-002",
    assignedAdvisor: "Camille",
    name: "陈女士",
    initial: "陈",
    note: "喜欢清透的海蓝宝",
    purchaseInputs: [
      {
        id: "PUR-002-01",
        sku: "MUG-R-N01",
        date: "2026-08-22",
        advisorNotes: "曾咨询纤细白金珠宝与有纪念意义的礼赠。",
      },
      {
        id: "PUR-002-02",
        sku: "MUG-R-B01",
        date: "2026-04-15",
        occasion: "gift",
        advisorNotes: "曾咨询纤细白金珠宝与有纪念意义的礼赠。",
      },
    ],
  },
  {
    birthMonth: 7,
    interests: [
      {
        material: "18K白金",
        category: "项链",
      },
    ],
    history: ["日常佩戴更喜欢白金项链，线条希望简洁。"],
    latestPreference: {
      material: "18K白金",
      text: "最近明确表示只考虑白金。",
    },
    id: "CL-003",
    assignedAdvisor: "Amélie",
    name: "吴女士",
    initial: "吴",
    note: "偏好白金项链",
    purchaseInputs: [
      {
        id: "PUR-003-01",
        sku: "JAS-N01",
        date: "2026-07-20",
        occasion: "personal",
      },
    ],
  },
  {
    birthMonth: 9,
    interests: [
      {
        motif: "muguet",
        line: "clochette",
        category: "项链",
      },
    ],
    history: ["正在了解适合婚礼场合佩戴的项链，尚未选定。"],
    latestPreference: null,
    id: "CL-004",
    assignedAdvisor: "Nora",
    name: "周女士",
    initial: "周",
    note: "正在了解婚礼佩戴",
    purchaseInputs: [
      {
        id: "PUR-004-01",
        sku: "MUG-C-N01",
        date: "2026-09-06",
      },
    ],
  },
  {
    birthMonth: 12,
    interests: [
      {
        line: "rosee",
        category: "手镯",
      },
    ],
    history: ["想挑一份礼物，收礼人的偏好还需要确认。"],
    latestPreference: null,
    id: "CL-005",
    assignedAdvisor: "Claire",
    name: "许先生",
    initial: "许",
    note: "想挑选一份心意礼物",
    purchaseInputs: [
      {
        id: "PUR-005-01",
        sku: "FEU-A-N01",
        date: "2026-10-10",
        occasion: "gift",
        advisorNotes: "曾咨询海蓝宝珠宝与纪念礼物。",
      },
      {
        id: "PUR-005-02",
        sku: "FEU-A-R01",
        date: "2026-07-06",
        occasion: "gift",
        advisorNotes: "曾咨询海蓝宝珠宝与纪念礼物。",
      },
    ],
  },
  {
    birthMonth: 5,
    interests: [
      {
        line: "rosee",
        material: "18K白金",
      },
    ],
    history: ["已购晨露手镯，想聊聊最近的佩戴体验。"],
    latestPreference: null,
    id: "CL-006",
    assignedAdvisor: "Élise",
    name: "沈女士",
    initial: "沈",
    note: "已有一件晨露手镯",
    purchaseInputs: [
      {
        id: "PUR-006-01",
        sku: "MUG-R-B01",
        date: "2026-10-12",
      },
    ],
  },
  {
    birthMonth: 2,
    interests: [],
    history: [],
    latestPreference: null,
    id: "CL-007",
    assignedAdvisor: "Lucie",
    name: "陆女士",
    initial: "陆",
    note: "偏好信息待完善",
    purchaseInputs: [
      {
        id: "PUR-007-01",
        sku: "FEU-V-R01",
        date: "2026-08-03",
      },
    ],
  },
  {
    birthMonth: 6,
    interests: [
      {
        line: "aqua",
        gemstone: "海蓝宝",
      },
    ],
    history: ["想问澄蓝传承戒指的材质与设计细节。"],
    latestPreference: null,
    id: "CL-008",
    assignedAdvisor: "Anaïs",
    name: "顾女士",
    initial: "顾",
    note: "喜欢海蓝宝与叶片设计",
    purchaseInputs: [
      {
        id: "PUR-008-01",
        sku: "FEU-A-R01",
        date: "2026-06-21",
      },
    ],
  },
  {
    birthMonth: 10,
    interests: [],
    history: [],
    latestPreference: null,
    id: "CL-009",
    assignedAdvisor: "Juliette",
    name: "黎女士",
    initial: "黎",
    note: "其他偏好资料暂未记录",
    purchaseInputs: [
      {
        id: "PUR-009-01",
        sku: "MUG-R-R01",
        date: "2026-09-25",
      },
    ],
  },
].map(({ purchaseInputs, ...client }) => ({
  ...client,
  predictedInterests: platformPredictions.clients[client.id],
  purchases: purchaseInputs.map(purchaseRecord),
}));
export const events = [
  {
    id: "EV-DEMO-01",
    name: "自然意象 · 珠宝设计分享",
    date: "2026-12-12 14:00",
    location: "虚构体验空间 · 上海示例路 18 号",
    registration: "回复顾问表达参与意向",
    verified: true,
    fictional: true,
  },
];
export function clientProfile(client) {
  return {
    id: client.id,
    name: client.name,
    assignedAdvisor: client.assignedAdvisor,
    interests: client.interests,
    predictedInterests: client.predictedInterests || [],
    latestPreference: client.latestPreference,
    purchases: client.purchases,
    history: client.history,
    birthMonth: client.birthMonth,
  };
}
