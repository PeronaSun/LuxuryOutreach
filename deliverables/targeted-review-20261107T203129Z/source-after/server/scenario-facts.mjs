// Verified event facts are separate semantic components, not a single ordered phrase.
export const SCENARIO_FACTS_VERSION = "event-facts-v2";
const compact = (s) =>
  String(s || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]/gu, "");
const chinese = (n) =>
  n < 10
    ? "零一二三四五六七八九"[n]
    : n < 20
      ? "十" + (n % 10 ? chinese(n % 10) : "")
      : chinese(Math.floor(n / 10)) + "十" + (n % 10 ? chinese(n % 10) : "");
export function eventFactsPresent(main, event) {
  if (!event) return false;
  const match = event.date.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match;
  const text = compact(main),
    h = Number(hour),
    m = Number(minute);
  const dates = [
    `${Number(month)}月${Number(day)}日`,
    `${year}${month}${day}`,
    `${chinese(Number(month))}月${chinese(Number(day))}日`,
  ];
  const timeOK =
    text.includes(hour + minute) ||
    (m === 0 &&
      (new RegExp(
        `(?:${h}|${chinese(h)})[点时](?:整|钟)?(?![0-9一二三四五六七八九十零])`,
      ).test(text) ||
        (h > 12 &&
          new RegExp(
            `下午(?:${h - 12}|${chinese(h - 12)}|${h - 12 === 2 ? "两" : "INVALID"})[点时](?:整|钟)?(?![0-9一二三四五六七八九十零])`,
          ).test(text))));
  const wrongDate = [...main.matchAll(/(\d{1,2})月(\d{1,2})[日号]/g)].some(
    (x) => +x[1] !== +month || +x[2] !== +day,
  );
  const wrongTime = [...main.matchAll(/(\d{1,2}):(\d{2})/g)].some(
    (x) => +x[1] !== h || +x[2] !== m,
  );
  const wrongYear = [
    ...main.matchAll(/(\d{4})(?:年|[-/]\d{1,2}[-/]\d{1,2})/g),
  ].some((x) => +x[1] !== +year);
  const locationParts = event.location.split(/\s*[·•]\s*/).filter(Boolean);
  return (
    text.includes(compact(event.name)) &&
    locationParts.every((p) => text.includes(compact(p))) &&
    dates.some((d) => text.includes(d)) &&
    timeOK &&
    !wrongDate &&
    !wrongTime &&
    !wrongYear
  );
}
export function scenarioFactErrors(main, context) {
  if (context.input?.scenario !== "event" || !context.event) return [];
  const errors = [];
  if (!eventFactsPresent(main, context.event))
    errors.push("活动正文缺少或更改了已核实的名称、日期时间或地点。");
  const motif = context.normalized?.grounding?.motif;
  const topics =
    {
      jasmin: ["茉莉", "Jasmin"],
      muguet: ["铃兰", "Muguet", "Clochette", "Rosée"],
      feuille: ["叶片", "叶脉", "蔚蓝叶语", "Feuille", "Aqua"],
    }[motif?.id] || [];
  if (
    main
      .split(/[。；！？]/)
      .some(
        (clause) =>
          !/不会|不承诺|并非|尚未确认|未确认/.test(clause) &&
          topics.some(
            (word) =>
              clause.includes(word) && !context.event.name.includes(word),
          ) &&
          /(?:会|将)(?:聊到|介绍|讲解|展示|围绕)|会在.{0,12}(?:交流|活动|分享).{0,12}(?:出现|呈现|展示)|专门围绕|必定展示/.test(
            clause,
          ),
      )
  )
    errors.push("把所选意象描述成了未经核实的活动议程。");
  const client = context.client;
  if (
    !client?.history?.length &&
    !client?.interests?.length &&
    !client?.latestPreference &&
    !context.input?.notes?.trim() &&
    /您(?:之前|此前|曾经|曾|一直|一向).{0,16}(?:兴趣|喜欢|偏爱|关注|留意)/.test(
      main,
    )
  )
    errors.push("空白客户历史不能支持过去兴趣的断言。");
  return errors;
}
