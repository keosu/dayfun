import { chromium } from '@playwright/test';
const browser = await chromium.launch();
for (const [width,height] of [[320,740],[390,844],[600,900],[768,1024],[844,390],[1440,1000]]) {
  const page = await browser.newPage({viewport:{width,height}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for (const path of ['/','/apps/picker/','/apps/kitchen/']) {
    await page.goto('http://localhost:4173'+path);
    await page.locator('h1').waitFor();
    const overflow = await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`Horizontal overflow ${path} ${width}`);
    if (path.includes('picker') && width<=600) {
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.locator('#sound-toggle').uncheck();
      await page.locator('#start-pick').click();
      await page.locator('#scene-result').waitFor({state:'visible'});
      const button = await page.locator('#start-pick').boundingBox();
      const nav = await page.locator('.bottom-nav').boundingBox();
      if (button.y+button.height>nav.y) { await page.screenshot({path:'test-results/screenshots/layout-small.png',fullPage:true}); console.log({button,nav,scroll:await page.evaluate(()=>scrollY)}); throw new Error(`Pick button hidden by navigation at ${width}x${height}`); }
    }
  }
  console.log(`${width}x${height}: all pages fit`,errors);
  await page.close();
}
await browser.close();
