import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("test-results/screenshots", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (error) => console.log("ERROR", error.message));
await page.goto("http://localhost:4173/apps/picker/");
await page.locator("#sound-toggle").uncheck();
for (const mode of ["wheel", "capsule", "pixel"]) {
  await page.locator(`[data-mode="${mode}"]`).click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `test-results/screenshots/3d-${mode}-idle.png`,
    fullPage: true,
  });
  await page.locator("#start-pick").click();
  await page.waitForTimeout(1600);
  await page.screenshot({
    path: `test-results/screenshots/3d-${mode}-moving.png`,
    fullPage: true,
  });
  await page
    .locator("#scene-result")
    .waitFor({ state: "visible", timeout: 12000 });
  await page.screenshot({
    path: `test-results/screenshots/3d-${mode}-result.png`,
    fullPage: true,
  });
  console.log(
    mode,
    await page.locator("#picker-scene").getAttribute("data-renderer"),
    await page.locator(".result-value").textContent(),
  );
}
await page.locator(".header-actions .settings-trigger").click();
await page.screenshot({
  path: "test-results/screenshots/settings-compact.png",
  fullPage: true,
});
await browser.close();
