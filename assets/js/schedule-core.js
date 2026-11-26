// Pure scheduling helpers: when does an event happen, when should it nag, and how does it look as iCalendar.
// Weekdays follow Date#getDay(): 0 = Sunday … 6 = Saturday. A monthly day of 0 means "last day of the month".

export const DAY_MS = 86_400_000;
export const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];
export const remindChoices = [0, 5, 10, 15, 30, 60, 120, 1440];

const pad = (value) => String(value).padStart(2, "0");

export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function parseDay(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
export function addDays(date, count) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
}
export function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
function atTime(day, time) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hours,
    minutes,
  );
}

export function occursOn(event, day) {
  if (event.repeat === "weekly") return event.weekdays.includes(day.getDay());
  if (event.repeat === "once") return event.date === dayKey(day);
  return event.monthDay === 0
    ? day.getDate() === daysInMonth(day)
    : day.getDate() === event.monthDay;
}

// Every start time inside [from, to].
export function occurrences(event, from, to) {
  const found = [];
  for (let day = startOfDay(from); day <= to; day = addDays(day, 1)) {
    if (!occursOn(event, day)) continue;
    const start = atTime(day, event.time);
    if (start >= from && start <= to) found.push(start);
  }
  return found;
}

export function nextOccurrence(event, after, horizonDays = 400) {
  const limit = addDays(after, horizonDays);
  return occurrences(event, after, limit)[0] || null;
}

// Alarm moments (start minus each reminder) that fall in (from, to].
export function alarmsBetween(event, from, to) {
  const reach = Math.max(...event.remind) * 60_000;
  const alarms = [];
  for (const start of occurrences(
    event,
    from,
    new Date(to.getTime() + reach),
  )) {
    for (const minutes of event.remind) {
      const at = new Date(start.getTime() - minutes * 60_000);
      if (at > from && at <= to) alarms.push({ event, start, at, minutes });
    }
  }
  return alarms.sort((a, b) => a.at - b.at);
}

export function alarmKey(alarm) {
  return `${alarm.event.id}|${alarm.start.getTime()}|${alarm.minutes}`;
}

export function weekOf(anchor) {
  const monday = addDays(startOfDay(anchor), -((anchor.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function remindText(minutes) {
  if (minutes === 0) return "准时";
  if (minutes % 1440 === 0) return `提前${minutes / 1440}天`;
  if (minutes % 60 === 0) return `提前${minutes / 60}小时`;
  return `提前${minutes}分钟`;
}
export function remindShort(minutes) {
  if (minutes === 0) return "准时";
  if (minutes % 1440 === 0) return `${minutes / 1440}天前`;
  if (minutes % 60 === 0) return `${minutes / 60}小时前`;
  return `${minutes}分钟前`;
}
export function repeatText(event) {
  if (event.repeat === "weekly") {
    const order = [1, 2, 3, 4, 5, 6, 0].filter((day) =>
      event.weekdays.includes(day),
    );
    return order.length === 7
      ? "每天"
      : `每周${order.map((day) => weekdayNames[day]).join("、")}`;
  }
  if (event.repeat === "monthly")
    return event.monthDay === 0 ? "每月月末" : `每月${event.monthDay}日`;
  const date = parseDay(event.date);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
export function relativeText(target, now = new Date()) {
  const minutes = Math.round((target - now) / 60_000);
  if (minutes < 1) return "马上";
  if (minutes < 60) return `${minutes} 分钟后`;
  if (minutes < 1440)
    return `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ""}后`;
  const days = Math.round((startOfDay(target) - startOfDay(now)) / DAY_MS);
  return days === 1 ? "明天" : `${days} 天后`;
}

// ---- iCalendar export: the phone's own calendar can ring even when this app is closed. ----

const icsDay = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const stamp = (date) =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
const utcStamp = (date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
const escapeText = (value) =>
  String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

// Content lines are folded at 75 bytes, never inside a multi-byte character.
function fold(line) {
  const encoder = new TextEncoder();
  const parts = [];
  let current = "";
  let size = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    const limit = parts.length ? 74 : 75;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += character;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function eventToICS(event, now = new Date()) {
  const first =
    nextOccurrence(event, startOfDay(now)) || atTime(now, event.time);
  const end = new Date(first.getTime() + 30 * 60_000);
  const rule =
    event.repeat === "weekly"
      ? `RRULE:FREQ=WEEKLY;BYDAY=${[1, 2, 3, 4, 5, 6, 0]
          .filter((day) => event.weekdays.includes(day))
          .map((day) => icsDay[day])
          .join(",")}`
      : event.repeat === "monthly"
        ? `RRULE:FREQ=MONTHLY;BYMONTHDAY=${event.monthDay === 0 ? -1 : event.monthDay}`
        : "";
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.id}@dayfun`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${stamp(first)}`,
    `DTEND:${stamp(end)}`,
    rule,
    `SUMMARY:${escapeText(`${event.emoji ? `${event.emoji} ` : ""}${event.title}`)}`,
    event.note ? `DESCRIPTION:${escapeText(event.note)}` : "",
  ].filter(Boolean);
  for (const minutes of event.remind)
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(event.title)}`,
      `TRIGGER:${minutes === 0 ? "PT0S" : `-PT${minutes}M`}`,
      "END:VALARM",
    );
  lines.push("END:VEVENT");
  return lines;
}

export function toICS(events, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DAYFUN//趣日常//ZH",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:趣日常",
    ...events.flatMap((event) => eventToICS(event, now)),
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
