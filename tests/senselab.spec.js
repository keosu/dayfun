import { test, expect } from "@playwright/test";

// 体感实验室（public/senselab）和趣日常同在一个站点下。
// 趣日常的 Service Worker 管着整个 /dayfun/ 范围，这里确认它不会把子页面换成趣日常的首页。
test("体感实验室子页面能打开，不被趣日常的应用壳接管", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker?.ready);

  await page.goto("./senselab/");
  await expect(page.locator("h1")).toHaveText("体感实验室");
  await expect(page.locator(".tile")).toHaveCount(4);
  await expect(page.locator(".tile strong").first()).toHaveText("传感器体检");

  await page.goto("./senselab/#/system");
  await expect(page.locator(".cap").first()).toBeVisible();
  expect(errors).toEqual([]);
});
