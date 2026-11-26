import { test, expect } from "@playwright/test";
import {
  occursOn,
  alarmsBetween,
  nextOccurrence,
  toICS,
  weekOf,
  parseDay,
} from "../assets/js/schedule-core.js";

function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const weekly = {
  id: "w1",
  title: "接宝宝放学",
  emoji: "🎒",
  repeat: "weekly",
  weekdays: [1, 3, 5],
  date: "2026-11-26",
  monthDay: 1,
  time: "17:30",
  remind: [30, 0],
  note: "",
  enabled: true,
};

test.describe("schedule rules", () => {
  test("weekly, monthly and one-time events occur on the right days", () => {
    expect(occursOn(weekly, parseDay("2026-11-23"))).toBe(true); // Monday
    expect(occursOn(weekly, parseDay("2026-11-24"))).toBe(false);
    const monthly = { ...weekly, repeat: "monthly", monthDay: 0 };
    expect(occursOn(monthly, parseDay("2026-02-28"))).toBe(true);
    expect(occursOn(monthly, parseDay("2024-02-28"))).toBe(false);
    expect(occursOn(monthly, parseDay("2024-02-29"))).toBe(true);
    const once = { ...weekly, repeat: "once", date: "2026-12-01" };
    expect(occursOn(once, parseDay("2026-12-01"))).toBe(true);
    expect(occursOn(once, parseDay("2026-12-08"))).toBe(false);
    expect(weekOf(parseDay("2026-11-29")).map((day) => day.getDay())).toEqual([
      1, 2, 3, 4, 5, 6, 0,
    ]);
  });

  test("alarms fire at the event time and ahead of it, once", () => {
    const from = new Date(2026, 10, 23, 16, 59);
    const to = new Date(2026, 10, 23, 18, 0);
    const alarms = alarmsBetween(weekly, from, to);
    expect(alarms.map((alarm) => alarm.at.getMinutes())).toEqual([0, 30]);
    expect(alarms.map((alarm) => alarm.minutes)).toEqual([30, 0]);
    // The window is open at its start, so consecutive checks never repeat an alarm.
    expect(alarmsBetween(weekly, to, new Date(2026, 10, 23, 19, 0))).toEqual(
      [],
    );
    expect(nextOccurrence(weekly, new Date(2026, 10, 26, 8, 0))).toEqual(
      new Date(2026, 10, 27, 17, 30),
    );
    // A reminder one day ahead crosses midnight.
    const early = { ...weekly, time: "00:10", remind: [1440] };
    expect(
      alarmsBetween(
        early,
        new Date(2026, 10, 22, 0, 0),
        new Date(2026, 10, 22, 23, 59),
      ),
    ).toHaveLength(1);
  });

  test("iCalendar export carries recurrence and alarms the system calendar can ring", () => {
    const text = toICS(
      [
        weekly,
        { ...weekly, id: "m1", repeat: "monthly", monthDay: 0, remind: [5] },
      ],
      new Date(2026, 10, 26, 8, 0),
    );
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(text).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=-1");
    expect(text).toContain("TRIGGER:-PT30M");
    expect(text).toContain("TRIGGER:PT0S");
    expect(text).toContain("DTSTART:20261127T173000");
    for (const line of text.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(text.endsWith("\r\n")).toBe(true);
  });
});

async function addEvent(
  page,
  { title, time, days = [], remind = [], repeat, monthDay },
) {
  await page.locator("#sc-add").click();
  const form = page.locator("#sc-form");
  await form.locator('[name="title"]').fill(title);
  if (repeat) await form.locator(`[data-repeat="${repeat}"]`).click();
  if (monthDay !== undefined)
    await form.locator('[name="monthDay"]').selectOption(String(monthDay));
  for (const day of days) await form.locator(`[data-day="${day}"]`).click();
  await form.locator('[name="time"]').fill(time);
  for (const minutes of remind)
    await form.locator(`[data-remind="${minutes}"]`).click();
  await form.locator('button[type="submit"]').click();
  await expect(page.locator("dialog")).toHaveCount(0);
}

test("add a weekly event in a popup; the week view lists it and it survives reload", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/#/calendar");
  await expect(page.locator(".sc-chip")).toHaveCount(0);
  await page.locator("#sc-add").click();
  await expect(page.locator(".sc-sheet")).toBeVisible();
  const today = await page.evaluate(() => new Date().getDay());
  const other = today === 1 ? 2 : 1;
  const form = page.locator("#sc-form");
  await form.locator('[name="title"]').fill("接宝宝放学");
  await form.locator(`[data-day="${other}"]`).click();
  await form.locator('[name="time"]').fill("17:30");
  await form.locator('[data-remind="5"]').click();
  await form.locator('button[type="submit"]').click();
  await expect(page.locator("#toast")).toContainText("已保存");
  await expect(page.locator(".sc-chip")).toHaveCount(2);
  await expect(page.locator(".sc-chip time").first()).toHaveText("17:30");
  await expect(page.locator("#sc-upcoming")).toContainText("接宝宝放学");
  await page.reload();
  await expect(page.locator(".sc-chip")).toHaveCount(2);
  // Edit, then delete with a confirming second tap.
  await page.locator(".sc-chip").first().click();
  await page.locator("#sc-delete").click();
  await page.locator("#sc-delete").click();
  await expect(page.locator(".sc-chip")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("one-time and monthly events appear on their day", async ({ page }) => {
  await page.goto("/#/calendar");
  // A day of the month that falls inside the week on screen.
  const monthDay = weekOf(new Date())
    .map((day) => day.getDate())
    .find((date) => date <= 28);
  await addEvent(page, {
    title: "交房租",
    time: "08:00",
    repeat: "monthly",
    monthDay,
  });
  await expect(page.locator(".sc-chip[data-repeat='monthly']")).toHaveCount(1);
  await addEvent(page, { title: "体检", time: "10:15", repeat: "once" });
  await expect(page.locator(".sc-chip[data-repeat='once']")).toHaveCount(1);
  await expect(
    page.locator(".sc-chip i").filter({ hasText: "一次" }),
  ).toHaveCount(1);
  // Next week no longer lists the one-time event.
  await page.locator("#sc-next").click();
  await expect(page.locator(".sc-chip[data-repeat='once']")).toHaveCount(0);
});

test("reminders show system notifications at the time and ahead of it", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    // Headless browsers report notifications as denied; pretend the user allowed them.
    Object.defineProperty(Notification, "permission", { get: () => "granted" });
    window.shown = [];
    ServiceWorkerRegistration.prototype.showNotification = function (
      title,
      options,
    ) {
      window.shown.push({ title, body: options.body, url: options.data?.url });
      return Promise.resolve();
    };
  });
  await page.clock.install({ time: new Date(2026, 10, 26, 7, 50) }); // Thursday
  await page.goto("/#/calendar");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await addEvent(page, {
    title: "喝水",
    time: "08:30",
    remind: [30],
  });
  await page.clock.runFor(41 * 60_000);
  const shown = await page.evaluate(() => window.shown);
  expect(shown).toHaveLength(2);
  expect(shown[0].title).toContain("喝水");
  expect(shown[0].body).toContain("30分钟后");
  expect(shown[1].body).toContain("现在 08:30");
  expect(shown[1].url).toBe("#/calendar");
  // Each alarm fires once.
  await page.clock.runFor(10 * 60_000);
  expect(await page.evaluate(() => window.shown.length)).toBe(2);
  expect(errors).toEqual([]);
});

test("notification settings explain the system calendar fallback and export a file", async ({
  page,
}) => {
  await page.goto("/#/calendar");
  await addEvent(page, { title: "吃药", time: "21:00", days: [] });
  await page.locator("#sc-bell").click();
  await expect(page.locator(".sc-sheet")).toContainText("系统日历");
  const download = page.waitForEvent("download");
  await page.locator("#sc-ics").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("趣日常日程.ics");
});
