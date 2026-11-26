import { test, expect } from "@playwright/test";

test("theme preference persists across tools and updates the 3D scene", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#/picker");
  await expect(page.locator(".site-header")).toBeHidden();
  await page.locator(".settings-trigger:visible").first().click();
  await page.locator('[data-theme-choice="dark"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#picker-scene")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#171a22",
  );
  await page.locator(".modal-close").click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/#/kitchen");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator(".settings-trigger:visible").first().click();
  await page.locator('[data-theme-choice="light"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator('[data-theme-choice="system"]').click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(errors).toEqual([]);
});

test("the page never scrolls and settings open as a sheet inside the screen", async ({
  page,
}) => {
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await expect(page.locator("footer")).toHaveCount(0);
  await page.locator(".settings-trigger:visible").first().click();
  const viewport = page.viewportSize();
  // Wait for the sheet's entry animation to finish before measuring where it sits.
  await expect
    .poll(async () => {
      const box = await page.locator(".settings-modal").boundingBox();
      return (
        box &&
        box.y >= 0 &&
        box.y + box.height <= viewport.height + 1 &&
        box.x + box.width <= viewport.width + 1
      );
    })
    .toBe(true);
  await page.locator(".modal-close").click();
  await page.goto("/#/kitchen");
  await page.locator('[data-open="tomato-egg"]').first().click();
  const sheet = page.locator("dialog");
  await expect(sheet).toHaveClass(/sheet/);
  expect(
    await sheet
      .locator(".modal-content")
      .evaluate((element) => getComputedStyle(element).scrollbarWidth),
  ).toBe("none");
});
