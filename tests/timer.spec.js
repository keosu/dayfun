import { test, expect } from "@playwright/test";

function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
// Capture what the clock would say instead of producing audio.
async function recordSpeech(page) {
  await page.addInitScript(() => {
    window.spoken = [];
    if (window.speechSynthesis)
      window.speechSynthesis.speak = (utterance) =>
        window.spoken.push(utterance.text);
  });
}
const spoken = (page) => page.evaluate(() => window.spoken);

test("countdown calls you back, nags harder until dismissed", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.clock.install();
  await recordSpeech(page);
  await page.goto("/#/timer");
  const stage = page.locator(".timer-stage");
  await page.locator("#timer-sound").uncheck();
  await page.locator('[data-task="teeth"]').click();
  await expect(page.locator("#timer-digits")).toHaveText("02:00");
  await page.locator('[data-action="start"]').click();
  await expect(stage).toHaveAttribute("data-status", "running");
  expect((await spoken(page))[0]).toContain("刷牙2分钟开始");

  await page.clock.runFor(61_000);
  await expect(page.locator("#timer-digits")).toHaveText("00:59");
  await page.evaluate(() => (location.hash = "#/"));
  await expect(page.locator('[data-view="home"]')).toBeVisible();
  await expect(page.locator('[data-nav="timer"]').first()).toHaveClass(
    /is-live/,
  );

  await page.clock.runFor(60_000);
  await expect(page).toHaveURL(/#\/timer$/);
  await expect(stage).toHaveAttribute("data-status", "ringing");
  await expect(stage).toHaveAttribute("data-level", "0");
  await expect(page.locator("#timer-bubble")).toContainText(/牙齿|细菌/);
  await page.clock.runFor(1_200);
  expect((await spoken(page)).at(-1)).toMatch(/牙齿|细菌/);

  const lines = new Set([await page.locator("#timer-bubble").textContent()]);
  for (const level of ["1", "1", "2", "2", "3"]) {
    await page.clock.runFor(9_000);
    await expect(stage).toHaveAttribute("data-level", level);
    lines.add(await page.locator("#timer-bubble").textContent());
  }
  expect(lines.size).toBeGreaterThanOrEqual(5);
  await expect(page.locator("#timer-over")).toHaveText(/超时 \+0[01]:\d\d/);

  await page.locator('[data-action="dismiss"]').click();
  await expect(stage).toHaveAttribute("data-status", "idle");
  const before = (await spoken(page)).length;
  await page.clock.runFor(20_000);
  const after = await spoken(page);
  expect(after).toHaveLength(before + 1);
  expect(after.at(-1)).toMatch(/理我|收到|关掉我/);
  await expect(page.locator('[data-nav="timer"]').first()).not.toHaveClass(
    /is-live/,
  );
  expect(errors).toEqual([]);
});

test("snooze gives one more minute and a running timer survives reload", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await recordSpeech(page);
  await page.goto("/#/timer");
  await page.locator("#timer-sound").uncheck();
  await page.locator("#timer-sec").fill("2");
  await page.locator("#timer-min").fill("0");
  await page.locator("#timer-min").blur();
  await expect(page.locator("#timer-digits")).toHaveText("00:02");
  await page.locator('[data-action="start"]').click();
  await expect(page.locator(".timer-stage")).toHaveAttribute(
    "data-status",
    "ringing",
  );
  await page.locator('[data-action="snooze"]').click();
  await expect(page.locator(".timer-stage")).toHaveAttribute(
    "data-status",
    "running",
  );
  expect((await spoken(page)).at(-1)).toContain("一分钟");
  await page.reload();
  await expect(page.locator(".timer-stage")).toHaveAttribute(
    "data-status",
    "running",
  );
  await expect(page.locator("#timer-digits")).toHaveText(/00:5\d/);
  await page.locator('[data-action="reset"]').click();
  await expect(page.locator(".timer-stage")).toHaveAttribute(
    "data-status",
    "idle",
  );
  await expect(page.locator("#timer-digits")).toHaveText("00:02");
  expect(errors).toEqual([]);
});

test("whose-turn picker defaults to the family", async ({ page }) => {
  await page.goto("/#/picker");
  await page.locator('[data-topic="轮到谁"]').click();
  await expect(page.locator(".option-row input")).toHaveCount(3);
  expect(
    await page
      .locator(".option-row input")
      .evaluateAll((inputs) => inputs.map((input) => input.value)),
  ).toEqual(["宝宝 👶", "爸爸 👨", "妈妈 👩"]);
});
