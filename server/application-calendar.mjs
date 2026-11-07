export const APPLICATION_TIME_ZONE = "Asia/Shanghai";

export function applicationCalendar(now = new Date()) {
  const instant = new Date(now);
  if (!Number.isFinite(instant.getTime()))
    throw new Error("Invalid application clock");
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: APPLICATION_TIME_ZONE,
      calendar: "gregory",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    timeZone: APPLICATION_TIME_ZONE,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

export function festivalContext(name = "", calendar = applicationCalendar()) {
  if (/圣诞|christmas/i.test(name)) {
    const days =
      (Date.UTC(calendar.year, 11, 25) -
        Date.UTC(calendar.year, calendar.month - 1, calendar.day)) /
      86400000;
    return {
      kind: "christmas",
      name: "圣诞节",
      lead:
        days > 0 && days <= 45
          ? "圣诞将近"
          : days === 0
            ? "圣诞时节"
            : "为圣诞送上一份祝福",
      imagery: "冬日、灯光、温暖、安宁；不假设宗教信仰或家庭团聚事实",
    };
  }
  if (/春节|春節|新春|chinese new year|spring festival/i.test(name)) {
    // No exact lunar date is needed for advance greeting drafts. Do not invent a Gregorian CNY date.
    return {
      kind: "spring",
      name: "春节",
      lead: "为新春送上一份祝福",
      imagery: "新春、新岁、万象更新、平安喜乐；不推断亲属关系或实际团圆安排",
      datePolicy: "No exact holiday date or today-is-holiday claim",
    };
  }
  return {
    kind: "other",
    name,
    lead: `为${name}送上一份祝福`,
    imagery: "只使用所选节日，不推断日期或庆祝习惯",
  };
}
