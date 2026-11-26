import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Captures every tool and reports whether the page itself would scroll (it must not).
const pages = [
  ["home", "/"],
  ["picker", "/#/picker"],
  ["kitchen", "/#/kitchen"],
  ["timer", "/#/timer"],
  ["calendar", "/#/calendar"],
];
await mkdir("test-results/screenshots", { recursive: true });
const browser = await chromium.launch();
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [name, path] of pages) {
    await page.goto(`http://localhost:4173${path}`);
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: `test-results/screenshots/${name}-${viewport.width}.png`,
    });
    console.log(
      name,
      viewport.width,
      await page.evaluate(() => {
        const visible = document.querySelector(".view:not([hidden])");
        const clipped = [...visible.querySelectorAll("*")].filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width > 0 &&
            (r.right > innerWidth + 1 || r.bottom > innerHeight + 1)
          );
        });
        return {
          pageScroll: document.documentElement.scrollHeight > innerHeight,
          outside: clipped.slice(0, 4).map((el) => el.className || el.tagName),
          missingImages: [...document.images]
            .filter((image) => !image.complete || !image.naturalWidth)
            .map((image) => image.src),
        };
      }),
      errors,
    );
  }
  await context.close();
}
await browser.close();
