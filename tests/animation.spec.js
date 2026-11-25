import { test, expect } from "@playwright/test";

test("physical animation progresses before showing an inline matching result", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/apps/picker/");
  const options = await page.locator(".selection-panel").boundingBox();
  const stage = await page.locator("#picker-scene").boundingBox();
  expect(options.y + options.height).toBeLessThan(stage.y);
  await page.locator("#sound-toggle").uncheck();
  await page.locator('[data-mode="capsule"]').click();
  await expect(page.locator("#picker-scene")).toHaveAttribute(
    "data-renderer",
    "webgl",
  );
  await page.locator("#start-pick").click();
  await expect(page.locator("#picker-scene")).toHaveAttribute(
    "data-phase",
    "animating",
  );
  await expect(page.locator("#scene-result")).toBeHidden();
  await expect(page.locator("#start-pick")).toBeDisabled();
  await expect(page.locator(".result-popover")).toBeHidden();
  await expect(page.locator("#scene-result")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#picker-scene")).toHaveAttribute(
    "data-phase",
    "result",
  );
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.locator("#picker-scene")).toHaveAttribute(
    "data-visual-result",
    "visible",
  );
  await expect(page.locator(".result-popover.show")).toBeVisible();
  await expect(page.locator(".result-popover strong")).toHaveText(
    await page.locator(".result-value").textContent(),
  );
  await expect(page.locator(".result-popover")).toBeHidden({ timeout: 5000 });
  await expect(page.locator(".option-row.selected input")).toHaveValue(
    await page.locator(".result-value").textContent(),
  );
  const before = await page.locator("#picker-scene canvas").screenshot();
  const bounds = await page.locator("#picker-scene canvas").boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.8,
    bounds.y + bounds.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  const after = await page.locator("#picker-scene canvas").screenshot();
  expect(Buffer.compare(before, after)).not.toBe(0);
  expect(errors).toEqual([]);
});
