import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
async function openSettings(page, tab = "preferences") {
  await page.locator(".header-actions .settings-trigger").click();
  await expect(page.locator(".settings-modal")).toBeVisible();
  await page.locator(`[data-settings-tab="${tab}"]`).click();
}
async function createRecipe(page, name, photo = false) {
  await page.goto("/#/kitchen");
  await page.locator("#add-recipe").click();
  const form = page.locator("#recipe-form");
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="ingredients"]').fill("鸡蛋 2 个\n番茄 1 个");
  await form.locator('[name="steps"]').fill("鸡蛋打散。\n翻炒至完全熟透。");
  await form.locator('[name="description"]').fill("记录一份家的味道。");
  if (photo) {
    await form
      .locator('[name="photo"]')
      .setInputFiles(resolve("public/images/tomato-egg.jpg"));
    await expect(page.locator("#recipe-form-status")).toContainText(
      "照片已准备好",
    );
  }
  await form.locator('button[type="submit"]').click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.locator(".recipe-card h3")).toContainText(name);
}
async function configureAndSync(page) {
  await openSettings(page, "sync");
  await page.locator('#sync-form [name="url"]').fill("http://localhost:8788");
  await page
    .locator('#sync-form [name="token"]')
    .fill("playwright-local-test-token");
  await page.locator("#sync-now").click();
  await expect(page.locator("#sync-status")).toContainText("同步完成");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
}

test("home links and all pages fit phone and desktop widths", async ({
  page,
}) => {
  const errors = watchErrors(page);
  for (const [path, view] of [
    ["/", "home"],
    ["/#/picker", "picker"],
    ["/#/kitchen", "kitchen"],
  ]) {
    await page.goto(path);
    await expect(page.locator(`[data-view="${view}"] h1`)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await expect(page.locator("body")).toHaveAttribute("data-app", view);
    await expect(page.locator(`[data-nav="${view}"]`).first()).toHaveClass(
      /active/,
    );
  }
  await expect(page.locator(".recipe-card")).toHaveCount(24);
  await page.locator(".recipe-card").last().scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    [...document.images].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  expect(errors).toEqual([]);
});

test("switching tools stays in one document and keeps each view alive", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/#/picker");
  await page.locator('[data-topic="玩什么"]').click();
  await expect(page.locator("#picker-scene")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.evaluate(() => {
    window.spaMarker = true;
    window.pickerCanvas = document.querySelector("#picker-scene canvas");
  });
  await page.locator('[data-nav="kitchen"]:visible').first().click();
  await expect(page).toHaveURL(/#\/kitchen$/);
  await expect(page.locator('[data-view="kitchen"]')).toBeVisible();
  await expect(page.locator('[data-view="picker"]')).toBeHidden();
  await page.locator('[data-tab="favorites"]').click();
  await page.goBack();
  await expect(page.locator('[data-view="picker"]')).toBeVisible();
  await expect(page.locator('[data-topic="玩什么"]')).toHaveClass(/active/);
  expect(
    await page.evaluate(
      () =>
        window.spaMarker === true &&
        window.pickerCanvas === document.querySelector("#picker-scene canvas"),
    ),
  ).toBe(true);
  await page.locator('[data-nav="kitchen"]:visible').first().click();
  await expect(page.locator('[data-tab="favorites"]')).toHaveClass(/active/);
  await page.locator('[data-nav="home"]:visible').first().click();
  await expect(page.locator('[data-view="home"] h1')).toBeVisible();
  expect(errors).toEqual([]);
});

test("cuisine, ingredient search and recipe instructions work", async ({
  page,
}) => {
  await page.goto("/#/kitchen");
  await page.locator('[data-cuisine="粤菜"]').click();
  await expect(page.locator(".recipe-card")).toHaveCount(2);
  await page.locator('[data-cuisine="全部"]').click();
  await page.locator("#recipe-search").fill("荸荠");
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await page.locator(".recipe-title-button").click();
  await expect(page.locator(".modal-heading h2")).toHaveText("清炖狮子头");
  await expect(page.locator(".cooking-steps li")).toHaveCount(4);
  await page.locator(".ingredient-list input").first().check();
  await expect(page.locator(".ingredient-list input").first()).toBeChecked();
  await page.locator(".modal-close").click();
  await page.locator("#recipe-search").fill("不存在的菜");
  await expect(page.locator(".empty-state h3")).toHaveText("还没找到这道味道");
});

test("all random modes use custom options and persist history", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/picker");
  await page.locator('[data-topic="自定义"]').click();
  await page.locator("#bulk-edit").click();
  await page.locator("#bulk-form textarea").fill("喝茶\n散步");
  await page.locator('#bulk-form button[type="submit"]').click();
  await page.locator("#sound-toggle").uncheck();
  for (const mode of ["wheel", "capsule", "pixel"]) {
    await page.locator(`[data-mode="${mode}"]`).click();
    await page.locator("#start-pick").click();
    await expect(page.locator(".result-value")).toBeVisible();
    expect(["喝茶", "散步"]).toContain(
      await page.locator(".result-value").textContent(),
    );
    if (mode === "wheel") {
      const selectedIndex = await page
        .locator("#picker-scene")
        .evaluate((element) =>
          Math.floor(
            (((Number(element.dataset.angle) % 360) + 360) % 360) / 180,
          ),
        );
      await expect(page.locator("#picker-scene")).toHaveAttribute(
        "data-renderer",
        "webgl",
      );
      expect(await page.locator(".result-value").textContent()).toBe(
        ["喝茶", "散步"][selectedIndex],
      );
    }
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(page.locator(".option-row.selected input")).toHaveValue(
      await page.locator(".result-value").textContent(),
    );
    await page.locator("#accept-pick").click();
  }
  await page.reload();
  await expect(page.locator(".option-row input").first()).toHaveValue("喝茶");
  await expect(page.locator('[data-mode="pixel"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.locator("#picker-history").click();
  await expect(page.locator(".history-row")).toHaveCount(3);
  await page.locator(".delete-pick").first().click();
  await expect(page.locator(".history-row")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("photo recipe, favorite and rating survive reload", async ({ page }) => {
  const errors = watchErrors(page);
  const name = "我的<家常>菜";
  await createRecipe(page, name, true);
  expect(await page.locator(".recipe-card img").getAttribute("src")).toMatch(
    /^data:image\/jpeg;base64,/,
  );
  await page.locator(".recipe-title-button").click();
  await page.locator("#detail-favorite").click();
  await expect(page.locator("#detail-favorite")).toHaveText("已收藏");
  await page.locator("#review-recipe").click();
  await page.locator('[data-rating="3"]').click();
  await page.locator('#review-form [name="note"]').fill("下次少放一点盐 <3");
  await page.locator('#review-form button[type="submit"]').click();
  await page.locator('[data-tab="records"]').click();
  await expect(page.locator(".review-card h3")).toHaveText(name);
  await expect(page.locator(".review-card p")).toHaveText("下次少放一点盐 <3");
  await expect(page.locator(".review-stars .filled")).toHaveCount(3);
  await page.reload();
  await expect(page.locator(".review-card h3")).toHaveText(name);
  await page.locator('[data-tab="favorites"]').click();
  await expect(page.locator(".recipe-card h3")).toHaveText(name);
  await expect(page.locator(".recipe-rating")).toContainText("3.0");
  expect(errors).toEqual([]);
});

test("meal cart saves quantities and completed meal history", async ({
  page,
}) => {
  await page.goto("/#/kitchen");
  await page.locator('[data-cart="tomato-egg"]').click();
  await page.locator('[data-cart="kung-pao"]').click();
  await page.locator('[data-tab="orders"]').click();
  await expect(page.locator(".cart-item")).toHaveCount(2);
  await page.locator('[data-quantity="1"][data-id="tomato-egg"]').click();
  await expect(page.locator("#cart-count")).toHaveText("3");
  await page.locator('#complete-meal [name="note"]').fill("周末和家人一起吃");
  await page.locator('#complete-meal button[type="submit"]').click();
  await expect(page.locator(".cart-item")).toHaveCount(0);
  await expect(page.locator(".meal-card")).toHaveCount(1);
  await expect(page.locator(".meal-card p")).toHaveText("周末和家人一起吃");
  await page.reload();
  await expect(page.locator(".meal-card h3")).toContainText("番茄炒蛋");
});

test("backup exports without credentials, merges once and rejects malformed data", async ({
  page,
}) => {
  await page.goto("/#/kitchen");
  await page.locator('[data-favorite="tomato-egg"]').click();
  await openSettings(page, "sync");
  await page.locator('#sync-form [name="url"]').fill("http://localhost:8788");
  await page
    .locator('#sync-form [name="token"]')
    .fill("do-not-export-this-token");
  await page.locator('#sync-form button[type="submit"]').click();
  await page.locator('[data-settings-tab="data"]').click();
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#export-data").click();
  const download = await downloadEvent;
  const bytes = await readFile(await download.path());
  const backup = JSON.parse(bytes.toString());
  expect(backup.records).toHaveLength(1);
  expect(bytes.toString()).not.toContain("do-not-export-this-token");
  await page.locator("#import-data").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await expect(page.locator("dialog")).toHaveCount(0);
  await page.locator('[data-tab="favorites"]').click();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await openSettings(page, "data");
  await page.locator("#import-data").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        app: "little-day",
        version: 1,
        records: [
          {
            id: "recipe:broken",
            type: "recipe",
            payload: { name: "bad" },
            updatedAt: 1,
            deletedAt: null,
          },
        ],
      }),
    ),
  });
  await expect(page.locator("#toast")).toContainText("数据格式不正确");
  await page.locator(".modal-close").click();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
});

test("server sync transfers photos and propagates deletion between devices", async ({
  page,
  browser,
}, testInfo) => {
  const errors = watchErrors(page);
  const name = `同步菜-${testInfo.project.name}-${Date.now()}`;
  await createRecipe(page, name, true);
  await configureAndSync(page);
  const secondContext = await browser.newContext({
    baseURL: "http://localhost:4173",
    viewport: testInfo.project.use.viewport,
  });
  const second = await secondContext.newPage();
  const secondErrors = watchErrors(second);
  try {
    await second.goto("/#/kitchen?tab=own");
    await configureAndSync(second);
    const synced = second.locator(".recipe-card").filter({ hasText: name });
    await expect(synced).toHaveCount(1);
    expect(await synced.locator("img").getAttribute("src")).toMatch(
      /^data:image\/jpeg;base64,/,
    );
    await synced.locator(".recipe-title-button").click();
    await second.locator("#delete-recipe").click();
    await second.locator("#confirm-delete").click();
    await expect(synced).toHaveCount(0);
    await configureAndSync(second);
    await configureAndSync(page);
    await expect(
      page.locator(".recipe-card").filter({ hasText: name }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(secondErrors).toEqual([]);
  } finally {
    await secondContext.close();
  }
});

test("PWA manifests and all tools operate offline after installation cache", async ({
  page,
  context,
  request,
}) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("fullscreen");
  expect(manifest.start_url).toBe("./");
  expect(manifest.shortcuts.map((item) => item.url)).toEqual([
    "./#/picker",
    "./#/kitchen",
  ]);
  for (const icon of [
    ...manifest.icons,
    ...manifest.shortcuts.flatMap((item) => item.icons),
  ])
    expect((await request.get(`/${icon.src}`)).ok()).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-view="home"] h1')).toBeVisible();
  await page.goto("/#/kitchen?recipe=tomato-egg");
  await expect(page.locator(".modal-heading h2")).toHaveText("番茄炒蛋");
  await expect(page.locator(".detail-photo")).toBeVisible();
  expect(
    await page
      .locator(".detail-photo")
      .evaluate((image) => image.complete && image.naturalWidth > 0),
  ).toBeTruthy();
  await page.locator(".modal-close").click();
  await page.goto("/#/picker");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#sound-toggle").uncheck();
  await page.locator("#start-pick").click();
  await expect(page.locator(".result-value")).toBeVisible();
  await page.locator("#accept-pick").click();
  await page.goto("/");
  await expect(page.locator(".activity")).toHaveCount(1);
  expect(errors).toEqual([]);
});
