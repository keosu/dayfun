// Captures timed frames of each 3D animation for visual review: `node scripts/inspect-3d.mjs [mobile]`.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const mobile = process.argv.includes("mobile");
const out = "test-results/screenshots";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
  deviceScaleFactor: mobile ? 2 : 1,
});
page.on("pageerror", (error) => console.log("ERROR", error.message));
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning")
    console.log(message.type(), message.text());
});
await page.goto("http://localhost:4173/#/picker");
await page.locator("#sound-toggle").uncheck();
const schedule = {
  wheel: [300, 1200, 2600, 4200],
  capsule: [700, 1500, 2300, 2900, 3600],
  pixel: [200, 400, 700, 1300, 2000],
};
const suffix = mobile ? "-m" : "";
for (const mode of process.argv.slice(2).filter((arg) => schedule[arg]).length
  ? process.argv.slice(2).filter((arg) => schedule[arg])
  : Object.keys(schedule)) {
  await page.locator(`[data-mode="${mode}"]`).click();
  await page.waitForTimeout(500);
  const canvas = page.locator("#picker-scene canvas");
  await canvas.screenshot({ path: `${out}/${mode}${suffix}-0-idle.png` });
  const started = Date.now();
  await page.locator("#start-pick").click();
  for (const [index, at] of schedule[mode].entries()) {
    await page.waitForTimeout(Math.max(0, at - (Date.now() - started)));
    await canvas.screenshot({ path: `${out}/${mode}${suffix}-${index + 1}.png` });
  }
  await page.locator("#scene-result").waitFor({ state: "visible", timeout: 15000 });
  const revealedAfter = Date.now() - started;
  await page.waitForTimeout(1500);
  await canvas.screenshot({ path: `${out}/${mode}${suffix}-9-result.png` });
  console.log(
    mode,
    "revealed after",
    revealedAfter,
    "ms",
    await page.locator(".result-value").textContent(),
    await page.locator("#picker-scene").getAttribute("data-renderer"),
    "fps",
    await page.locator("#picker-scene").getAttribute("data-fps"),
  );
}
await browser.close();
