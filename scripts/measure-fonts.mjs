// Prints rendered font sizes of key text on phone and desktop: `node scripts/measure-fonts.mjs`.
import { chromium, devices } from "@playwright/test";

const targets = {
  "/": [".greeting", ".launcher-hero h1", ".hero-copy > p", ".app-category", ".tool-content h3", ".tool-content > p", ".enter-app", ".activity strong"],
  "/#/picker": [".intro-row h1", ".intro-row p", ".topic-chip", ".options-heading h3", ".option-row input", ".mode-tab", ".scene-heading", ".pick-button", "#pick-hint", ".result-value", ".result-topic"],
  "/#/kitchen": [".intro-row h1", ".intro-row p", ".kitchen-banner-copy h2", ".kitchen-tab", ".cuisine-chip", "#catalog-title", ".recipe-card h3", ".recipe-description", ".recipe-meta", ".add-to-cart"],
};
const browser = await chromium.launch();
for (const [name, options] of [
  ["phone", { ...devices["iPhone 13"] }],
  ["desktop", { viewport: { width: 1280, height: 900 } }],
]) {
  const page = await browser.newPage(options);
  for (const [path, selectors] of Object.entries(targets)) {
    await page.goto(`http://localhost:4173${path}`);
    await page.waitForTimeout(700);
    const sizes = await page.evaluate(
      (list) =>
        list.map((selector) => {
          const element = [...document.querySelectorAll(selector)].find((node) => node.offsetParent);
          return `${selector}=${element ? getComputedStyle(element).fontSize : "—"}`;
        }),
      selectors,
    );
    console.log(name, path, sizes.join("  "));
  }
  if (name === "phone") {
    await page.goto("http://localhost:4173/#/picker");
    await page.waitForTimeout(700);
    console.log(
      "phone picker scene",
      await page.locator("#picker-scene").evaluate((element) => `${element.clientWidth}x${element.clientHeight}`),
    );
  }
  await page.close();
}
await browser.close();
