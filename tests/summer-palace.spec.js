import { test, expect } from "@playwright/test";

// 颐和园导览随站点发布在 /summer-palace-guide/，不应被 dayfun 的应用壳替换，也应能正常启动。
test("颐和园导览可以从站点子目录打开并启动", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("summer-palace-guide/");
  await expect(page).toHaveTitle("颐和园导览");
  await page.waitForSelector("body.ready", { timeout: 15000 });
  await expect(page.locator("#card")).toContainText("欢迎来颐和园");
  await expect(page.locator(".pin").first()).toBeAttached();
  expect(errors).toEqual([]);
});

test("颐和园导览的景点数据和照片可以加载", async ({ page }) => {
  await page.goto("summer-palace-guide/");
  await page.waitForSelector("body.ready", { timeout: 15000 });
  const status = await page.evaluate(async () => {
    const spots = await fetch("data/spots.json").then((r) => r.status);
    const photo = await fetch("img/spots/paiyun-dian-s.jpg").then(
      (r) => r.status,
    );
    return { spots, photo };
  });
  expect(status).toEqual({ spots: 200, photo: 200 });
});
