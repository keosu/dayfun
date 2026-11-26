import { test, expect } from "@playwright/test";

test("physical animation progresses before showing an inline matching result", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#/picker");
  // The 3D stage is the core of the page: below the slim bar, filling the space above the button.
  const bar = await page.locator(".pk-bar").boundingBox();
  const stage = await page.locator("#picker-scene").boundingBox();
  const button = await page.locator("#start-pick").boundingBox();
  expect(bar.y + bar.height).toBeLessThanOrEqual(stage.y + 1);
  expect(stage.y + stage.height).toBeLessThanOrEqual(button.y + 1);
  expect(stage.height).toBeGreaterThan(button.y / 2);
  if (
    (await page.locator("#sound-toggle").getAttribute("aria-pressed")) ===
    "true"
  )
    await page.locator("#sound-toggle").click();
  await page.locator('[data-mode="capsule"]').click();
  await expect(page.locator("#picker-scene")).toHaveAttribute(
    "data-renderer",
    "webgl",
  );
  await page.evaluate(() => {
    const popover = document.querySelector(".result-popover");
    window.popoverShown = null;
    new MutationObserver(() => {
      if (popover.classList.contains("show"))
        window.popoverShown = {
          text: popover.querySelector("strong").textContent,
          phase: document.querySelector("#picker-scene").dataset.phase,
        };
    }).observe(popover, { attributes: true });
  });
  await page.locator("#start-pick").click();
  await expect(page.locator("#picker-scene")).toHaveAttribute(
    "data-phase",
    "animating",
  );
  await expect(page.locator("#scene-result")).toBeHidden();
  await expect(page.locator("#start-pick")).toBeDisabled();
  await expect(page.locator(".result-popover")).toBeHidden();
  // Headless browsers render WebGL in software, which can run below real time.
  await expect(page.locator("#scene-result")).toBeVisible({ timeout: 60000 });
  await expect(page.locator("#picker-scene")).toHaveAttribute(
    "data-phase",
    "result",
  );
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.locator("#picker-scene")).toHaveAttribute(
    "data-visual-result",
    "visible",
  );
  // The capsule shows its own 3D answer card, so the HTML popover stays out of the way.
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.popoverShown)).toBeNull();
  await expect(page.locator(".result-popover")).toBeHidden();
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
