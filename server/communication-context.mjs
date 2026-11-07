// Conservative, source-evidenced facets for common demo contexts and live validation.
// Raw notes remain untrusted data. Unknown relevant contexts are interpreted semantically only in live mode.
const preferenceKinds = {
  material: [
    ["玫瑰金", "18K玫瑰金"],
    ["白金", "18K白金"],
    ["黄金", "18K黄金"],
  ],
  category: [
    ["戒指", "戒指"],
    ["项链", "项链"],
    ["手镯", "手镯"],
  ],
  gemstone: [["海蓝宝", "海蓝宝"]],
};

export function explicitPreferences(notes = "") {
  const preferences = {},
    avoidedMaterials = [];
  for (const clause of notes.split(/[。；;，,\n]/)) {
    const negative = /不(?:再)?(?:喜欢|考虑|想要|想|要)|不要|避免/.test(clause);
    if (
      !/偏爱|偏好|喜欢|只考虑|只想|希望.*(?:找|要|选择)|想找|想要|更想|倾向/.test(
        clause,
      )
    )
      continue;
    for (const [kind, words] of Object.entries(preferenceKinds))
      for (const [word, value] of words) {
        if (!clause.includes(word)) continue;
        if (negative) {
          if (kind === "material") avoidedMaterials.push(value);
        } else preferences[kind] = value;
      }
  }
  return { preferences, avoidedMaterials: [...new Set(avoidedMaterials)] };
}

export function currentPreferenceScore(product, context) {
  const p = context.preferences;
  return (
    (p.material === product.material ? 2 : 0) +
    (p.category === product.category ? 2 : 0) +
    (p.gemstone && p.gemstone === product.gemstone ? 2 : 0) -
    (context.avoidedMaterials.includes(product.material) ? 2 : 0)
  );
}

export function communicationContext(input, product = null) {
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const extracted = explicitPreferences(notes);
  const facets = [];
  const add = (id, meaning, anchors, phrases) =>
    facets.push({ id, meaning, anchors, phrases });
  const daily = /通勤|日常(?:佩戴|搭配|穿搭)|每天佩戴|工作日/.test(notes);
  const dailyLabel = /通勤|工作日/.test(notes) ? "日常通勤" : "日常佩戴";
  const understated =
    /低调|简约|克制|不(?:太)?(?:喜欢|想要).{0,5}夸张|不.{0,3}太夸张|不要.{0,3}夸张/.test(
      notes,
    );
  const styling = /搭配|穿搭|造型/.test(notes);
  const comfortable =
    /(?:佩戴|戴着|戴起来).{0,8}(?:舒服|舒适)/.test(notes) &&
    !/不舒服|不舒适/.test(notes);
  const wrongCategory =
    product &&
    ["戒指", "手镯", "项链"].some(
      (category) => category !== product.category && notes.includes(category),
    ) &&
    !notes.includes(product.category);
  const project =
    /完成.{0,10}项目|项目.{0,8}(?:完成|结束|告一段落)/.test(notes) &&
    !/(?:没有|还没|尚未|未能|未)完成|项目.{0,8}(?:未|没).{0,3}(?:完成|结束)/.test(
      notes,
    );
  const projectLabel = /重要项目/.test(notes) ? "重要项目" : "项目";
  const busy = /很忙|比较忙|工作忙|忙碌|工作比较忙/.test(notes);
  const comparison = /比较|对比|其他品牌|别的品牌|别家/.test(notes);
  const relevantPrice = /价格|价位|预算|偏高|太贵/.test(notes);
  if (input.scenario === "price" && comparison && relevantPrice)
    add(
      "price_comparison",
      "客户在衡量价格并比较其他品牌；尊重比较，不贬低竞争品牌",
      [
        ["价格", "价位", "预算"],
        ["比较", "对比", "不同作品", "其他品牌"],
      ],
      [
        "理解您正在比较其他品牌，也在认真考虑价格。",
        "您提到价格与其他品牌的比较，这份考量值得从具体材质与设计展开，而不急于作决定。",
        "价格与不同作品之间的比较，值得从容衡量，也让在意的细节更清楚。",
      ],
    );
  else if (input.scenario === "price" && relevantPrice)
    add(
      "price_concern",
      "回应客户明确提供的价格考量，不推断超预算或承诺优惠",
      [["价格", "价位", "预算"]],
      [
        priceAcknowledgment(input),
        `${priceAcknowledgment(input)}这次会从已知的作品细节与您一起梳理。`,
        "价格的考量值得从容回应，让作品的具体细节成为判断的依据。",
      ],
    );
  if (input.scenario === "care" && comfortable && styling && !wrongCategory)
    add(
      "comfort_styling",
      "已知佩戴舒适，客户希望继续了解日常搭配；不作舒适保证",
      [
        ["舒适", "舒服", "舒心"],
        ["搭配", "穿搭", "造型"],
      ],
      [
        "听您提到佩戴舒适，也想继续聊聊日常搭配。",
        "您说佩戴起来舒适，又在考虑如何融入日常穿搭，这两个具体感受正是这次关怀的重点。",
        "佩戴的舒适感与日常搭配的想法，都值得在这件作品的细节中慢慢聊。",
      ],
    );
  if (project)
    add(
      "project_rest",
      "客户刚完成项目，适度认可努力，祝愿休息；不推断情绪",
      [
        ["项目", "工作成果", "告一段落"],
        ["休息", "放慢", "从容", "忙碌"],
      ],
      [
        `完成${projectLabel}后，也愿您有一点休息的时间。`,
        `知道您刚完成${projectLabel}${busy ? "、这段时间也比较忙" : ""}，想为您留一份问候，愿您有时间放慢脚步。`,
        `${projectLabel}告一段落，愿有一段从容的时光留给自己。`,
      ],
    );
  if (
    daily &&
    understated &&
    ["recommend", "reactivate", "event", "price"].includes(input.scenario)
  )
    add(
      "understated_daily",
      `${dailyLabel}且不喜欢夸张设计；不保证具体作品舒适或适合每个人`,
      [
        ["通勤", "日常", "工作日"],
        ["低调", "克制", "简约", "不张扬", "夸张"],
      ],
      [
        `您希望${dailyLabel}低调自然，这份方向我记下了。`,
        `您提到希望用于${dailyLabel}、不喜欢过于夸张的设计，因此这里更关注轮廓与日常风格的呼应。`,
        `${dailyLabel}里，您偏爱的克制线条，也可以有细细品味的光。`,
      ],
    );
  if (
    !facets.length &&
    styling &&
    ["care", "recommend", "reactivate"].includes(input.scenario) &&
    !wrongCategory
  )
    add(
      "styling",
      "客户关心日常搭配",
      [["搭配", "穿搭", "造型"]],
      [
        "您关心日常搭配，这次也想围绕这个方向聊聊。",
        "您提到还在考虑日常如何搭配，可以先从作品的线条与已有穿搭之间的呼应来交流。",
        "让作品走进日常搭配的想法，也值得留一点从容的时间。",
      ],
    );
  if (
    !facets.length &&
    daily &&
    ["recommend", "reactivate", "event"].includes(input.scenario)
  )
    add(
      "daily",
      "客户关注通勤或日常佩戴",
      [["通勤", "日常", "工作日"]],
      [
        `您希望用于${dailyLabel}，这份需求我记下了。`,
        `您提到关注${dailyLabel}的场景，这次就从作品与日常风格之间的关系来介绍。`,
        `${dailyLabel}里的一点自然意象，也可以是个人风格的轻声表达。`,
      ],
    );
  if (!facets.length && busy)
    add(
      "busy_rest",
      "客户近期工作忙；关怀休息，不推断压力或生活安排",
      [["忙", "休息", "放慢", "从容"]],
      [
        "知道您这段时间比较忙，愿您也有一点休息的时间。",
        "您提到这段时间比较忙，也想借这次问候，祝您忙碌之外有机会放慢脚步。",
        "忙碌的日常之外，愿一段从容的片刻也能留给自己。",
      ],
    );
  if (
    Object.keys(extracted.preferences).length &&
    ["recommend", "reactivate", "price", "event"].includes(input.scenario)
  ) {
    const values = Object.values(extracted.preferences);
    const conflict =
      product &&
      extracted.preferences.material &&
      extracted.preferences.material !== product.material;
    add(
      "new_preference",
      `当前明确偏好：${values.join("、")}；优先于旧历史，不能改变选定SKU事实`,
      conflict ? [["材质偏好", "材质选择", "关注的材质"]] : [values],
      conflict
        ? [
            "您这次的材质偏好我记下了，这里先介绍当前作品的设计。",
            "这次先尊重您新提到的材质选择，同时仅介绍当前作品实际记载的设计与材质，不把两者混同。",
            "您关注的材质方向值得被认真听见，这里也让当前作品的设计如实呈现。",
          ]
        : [
            `您这次更关注${values.join("与")}，这份明确的想法我记下了。`,
            `您新提到对${values.join("与")}的偏好，是这次介绍的出发点；也希望把已知的设计细节介绍得更清楚。`,
            `这次您偏爱的${values.join("与")}，也让自然意象有了更贴近您想法的表达。`,
          ],
    );
  }
  // Only the most relevant facet is mandatory in each style. Detailed may include a second.
  if (facets.some((f) => f.id === "new_preference"))
    facets.sort(
      (a, b) =>
        Number(b.id === "new_preference") - Number(a.id === "new_preference"),
    );
  const allowFestivalMix =
    !/不要|不混|避免混/.test(notes) &&
    /(?:同时|一起|结合|融合|双节).{0,20}(?:圣诞|春节|新春)/.test(notes) &&
    /圣诞/.test(notes) &&
    /春节|新春/.test(notes);
  // A template cannot safely interpret arbitrary prose. Only discard clearly
  // irrelevant directives/weather or plainly conflicting catalog-only notes.
  // Unknown prose is withheld in demo mode, including notes without “客户”.
  const discardable = notes
    .split(/[。；;\n]/)
    .filter((part) => part.trim())
    .every((part) =>
      /^(?:今天)?天气[^客户]*$|^system theme\b|^请自然回应客户[^。]*$|^备注写这款[^客户]*$/i.test(
        part.trim(),
      ),
    );
  const unsupportedRelevant = Boolean(
    notes &&
    !facets.length &&
    !wrongCategory &&
    !allowFestivalMix &&
    !discardable,
  );
  return {
    version: "communication-context-v1",
    source: "CA notes (untrusted)",
    hasNotes: Boolean(notes),
    ...extracted,
    relevantFacets: facets.map(({ phrases, ...facet }) => facet),
    primaryFacet: facets[0]?.id || null,
    demoPhrases: facets.length ? facets[0].phrases : null,
    secondaryDemoPhrases: facets[1]?.phrases || null,
    unsupportedRelevant,
    allowFestivalMix,
    ignoredReason:
      notes && !facets.length && !unsupportedRelevant
        ? "No relevant supported facet; do not copy raw notes"
        : null,
  };
}

export function contextCoverageErrors(main, context) {
  const facet = context?.relevantFacets?.[0];
  if (!facet) return [];
  return facet.anchors.every((group) =>
    group.some((word) => main.includes(word)),
  )
    ? []
    : ["正文未体现本次补充沟通背景中的主要需求。"];
}

export function priceAcknowledgment(input) {
  const text = [input.notes, input.concern].filter(Boolean).join("。");
  if (/没(?:有)?超出|未超出|预算内|不是.{0,5}(?:预算|价格)/.test(text))
    return "理解价格并非您这次的主要顾虑，也愿与您把关注的作品细节看清楚。";
  if (/比较|对比|其他品牌|别家/.test(text))
    return "理解您希望从容比较作品的价格与设计。";
  if (/超出.{0,6}预算|偏高|太贵|高于.{0,6}预期/.test(text))
    return "理解您对价格的考虑，需要仔细衡量。";
  return "理解您希望进一步了解价格所对应的材质与设计。";
}
