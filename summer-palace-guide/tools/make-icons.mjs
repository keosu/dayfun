// 用 Playwright（Chromium）把 icons/icon.svg 渲染成各尺寸 PNG。
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const svg = await readFile(`${ROOT}icons/icon.svg`, "utf8");
// 蒙版图标和 iOS 图标要整幅铺满、圆角交给系统：去掉 SVG 自带的圆角底，换成外层渐变底
const square = svg.replace(/<rect width="512" height="512" rx="112"[^>]*\/>/, "");
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(markup, size, file, inset = 0) {
  const pad = Math.round((size * inset) / 2);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style><div style="width:${size}px;height:${size}px;background:linear-gradient(#e2574a,#c23a2f);display:grid;place-items:center">
      <div style="width:${size - pad * 2}px;height:${size - pad * 2}px">${markup.replace("<svg ", '<svg width="100%" height="100%" ')}</div></div>`,
  );
  await page.screenshot({ path: `${ROOT}icons/${file}`, omitBackground: true });
}

async function renderAny(size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: `${ROOT}icons/${file}`, omitBackground: true });
}

await renderAny(192, "icon-192.png");
await renderAny(512, "icon-512.png");
await render(square, 512, "icon-maskable-512.png", 0.2); // 内容缩到 80%，留出安全区
await render(square, 180, "apple-touch-icon.png");
await browser.close();
console.log("图标已生成");
