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
  expect(
    await page
      .locator(".settings-modal")
      .evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
  ).toBe(true);
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

test("launcher fits without vertical scrolling and the scroll thumb fades", async ({
  page,
}) => {
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await expect(page.locator("footer")).toHaveCount(0);
  await page.goto("/#/kitchen");
  await page.locator('[data-open="tomato-egg"]').first().click();
  await page.locator("dialog").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator("dialog")).toHaveClass(/is-scrolling/);
  await expect(page.locator("dialog")).not.toHaveClass(/is-scrolling/, {
    timeout: 3000,
  });
});
