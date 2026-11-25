import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results/screenshots', { recursive: true });
const browser = await chromium.launch();
for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [name, path] of [['home','/'], ['picker','/apps/picker/'], ['kitchen','/apps/kitchen/']]) {
    await page.goto('http://localhost:4173'+path);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `test-results/screenshots/${name}-${viewport.width}.png`, fullPage: true });
    console.log(name, viewport.width, await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, missingImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src), sw: !!navigator.serviceWorker.controller })), errors);
  }
  await context.close();
}
await browser.close();
