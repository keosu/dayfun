import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("test-results/screenshots", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (error) => console.log("ERROR", error.message));
for (const theme of ["light", "dark"]) {
  await page.goto("http://localhost:4173/");
  await page.locator(".header-actions .settings-trigger").click();
  await page.locator(`[data-theme-choice="${theme}"]`).click();
  await page.screenshot({
    path: `test-results/screenshots/settings-${theme}.png`,
  });
  await page.locator(".modal-close").click();
  await page.screenshot({ path: `test-results/screenshots/home-${theme}.png` });
  await page.goto("http://localhost:4173/#/picker");
  await page.locator("#sound-toggle").uncheck();
  for (const mode of ["wheel", "capsule", "pixel"]) {
    await page.locator(`[data-mode="${mode}"]`).click();
    await page.screenshot({
      path: `test-results/screenshots/${theme}-${mode}-idle.png`,
    });
    await page.locator("#start-pick").click();
    await page.waitForTimeout(mode === "pixel" ? 2400 : 3000);
    await page.screenshot({
      path: `test-results/screenshots/${theme}-${mode}-motion.png`,
    });
    await page
      .locator("#scene-result")
      .waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `test-results/screenshots/${theme}-${mode}-revealed.png`,
    });
    await page.locator(".result-popover.show").waitFor({ state: "visible" });
    await page.screenshot({
      path: `test-results/screenshots/${theme}-${mode}-popup.png`,
    });
    await page.locator("#accept-pick").click();
    console.log(theme, mode, await page.locator(".result-value").textContent());
  }
  await page.goto("http://localhost:4173/#/kitchen");
  await page.screenshot({
    path: `test-results/screenshots/kitchen-${theme}.png`,
  });
}
await browser.close();
