// Background scheduler for calendar reminders. It lives for as long as the app is open (foreground or
// recently backgrounded) and also catches up on alarms missed while the screen was off.
import { list, changeEvent } from "./storage.js";
import { alarmsBetween, alarmKey, remindText } from "./schedule-core.js";
import { notify } from "./notify.js";
import { toast } from "./ui.js";

const lastKey = "little-day:reminders-last";
const firedKey = "little-day:reminders-fired";
const MISSED_WINDOW = 15 * 60_000;
const TICK = 15_000;

let events = [];
let timer = 0;

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private mode: reminders still fire, they just may repeat after a reload. */
  }
};

async function load() {
  events = (await list("event"))
    .map((record) => record.payload)
    .filter((event) => event.enabled);
}

function describe(alarm) {
  const { event, start, at } = alarm;
  const clock = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
  const late = Date.now() - at.getTime() > 2 * 60_000;
  const lead =
    alarm.minutes === 0
      ? `现在 ${clock}`
      : `${remindText(alarm.minutes).replace("提前", "")}后 · ${clock}`;
  return {
    title: `${event.emoji ? `${event.emoji} ` : ""}${event.title}`,
    body: `${late ? "刚才错过了 · " : ""}${lead}${event.note ? `\n${event.note}` : ""}`,
  };
}

export async function check(now = new Date()) {
  const last = Number(localStorage.getItem(lastKey)) || now.getTime();
  const from = new Date(Math.max(last, now.getTime() - MISSED_WINDOW));
  localStorage.setItem(lastKey, String(now.getTime()));
  const fired = read(firedKey, {});
  const horizon = now.getTime() - 3 * 86_400_000;
  for (const key of Object.keys(fired))
    if (fired[key] < horizon) delete fired[key];
  const due = events
    .flatMap((event) => alarmsBetween(event, from, now))
    .filter((alarm) => !fired[alarmKey(alarm)]);
  for (const alarm of due) {
    fired[alarmKey(alarm)] = now.getTime();
    const { title, body } = describe(alarm);
    if (document.visibilityState === "visible")
      toast(`${title} · ${body.split("\n")[0]}`);
    navigator.vibrate?.([200, 100, 200]);
    await notify(title, { body, tag: alarmKey(alarm), url: "#/calendar" });
  }
  if (due.length) write(firedKey, fired);
}

export async function start() {
  if (timer) return;
  await load();
  window.addEventListener(changeEvent, async (event) => {
    if (["event", "merge"].includes(event.detail.type)) await load();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("focus", () => check());
  timer = setInterval(check, TICK);
  await check();
}
