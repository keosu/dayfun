// Draws the PWA icons as SVG and rasterizes them with Chromium: node scripts/generate-icons.mjs
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const dir = "public/icons";

// A smiling sun for 趣日常; its rays use the four brand colors.
// `scale` shrinks the artwork for the maskable variant; `radius` rounds the background for the favicon.
function appIcon({ scale = 1, radius = 0 } = {}) {
  const colors = ["#e9a389", "#a99acb", "#8fb7d6", "#a3bfac"];
  const dots = Array.from(
    { length: 8 },
    (_, index) =>
      `<rect x="243" y="${262 - 196}" width="26" height="46" rx="13" fill="${colors[index % 4]}" transform="rotate(${index * 45} 256 262)"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff6e2"/>
      <stop offset="1" stop-color="#ffdfca"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.38" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#ffdb73"/>
      <stop offset="1" stop-color="#f1b23a"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#bg)"/>
  <g transform="translate(256 262) scale(${scale}) translate(-256 -262)">
    ${dots}
    <circle cx="256" cy="262" r="126" fill="url(#sun)"/>
    <g fill="none" stroke="#6e4a22" stroke-width="15" stroke-linecap="round">
      <path d="M190 246q23-28 46 0"/>
      <path d="M276 246q23-28 46 0"/>
    </g>
    <circle cx="184" cy="286" r="18" fill="#f2836f" opacity="0.55"/>
    <circle cx="328" cy="286" r="18" fill="#f2836f" opacity="0.55"/>
    <path d="M216 284h80c0 30-18 50-40 50s-40-20-40-50Z" fill="#6e4a22"/>
    <path d="M232 320c14-12 34-12 48 0-6 9-14 14-24 14s-18-5-24-14Z" fill="#f2836f"/>
  </g>
</svg>
`;
}

const timerIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="116" fill="#e3eee1"/><g transform="rotate(-8 256 270)"><circle cx="168" cy="170" r="54" fill="#f2c14e"/><circle cx="344" cy="170" r="54" fill="#f2c14e"/><path d="M256 132v26" stroke="#d8705f" stroke-width="22" stroke-linecap="round"/><path d="m186 384-26 34m166-34 26 34" stroke="#d8705f" stroke-width="22" stroke-linecap="round"/><circle cx="256" cy="282" r="124" fill="#ef8b7a"/><circle cx="256" cy="282" r="96" fill="#fff"/><path d="M256 222v62l40 26" fill="none" stroke="#5b4a3a" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><circle cx="256" cy="284" r="12" fill="#5b4a3a"/></g></svg>
`;

const calendarIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="116" fill="#dfeaf6"/><g transform="rotate(-6 256 270)"><rect x="106" y="126" width="300" height="290" rx="48" fill="#fff"/><path d="M106 174a48 48 0 0 1 48-48h204a48 48 0 0 1 48 48v50H106z" fill="#ef8b7a"/><rect x="170" y="92" width="26" height="62" rx="13" fill="#5b4a3a"/><rect x="316" y="92" width="26" height="62" rx="13" fill="#5b4a3a"/><g fill="#c7d6ea"><rect x="146" y="256" width="40" height="34" rx="10"/><rect x="236" y="256" width="40" height="34" rx="10"/><rect x="146" y="324" width="40" height="34" rx="10"/><rect x="326" y="324" width="40" height="34" rx="10"/></g><rect x="326" y="256" width="40" height="34" rx="10" fill="#ef8b7a"/><rect x="236" y="324" width="40" height="34" rx="10" fill="#8fb39b"/></g></svg>`;
await writeFile(`${dir}/icon.svg`, appIcon({ radius: 116 }));
await writeFile(`${dir}/timer.svg`, timerIcon);
await writeFile(`${dir}/calendar.svg`, calendarIcon);

const fullBleed = (svg) => svg.replace(/rx="116"/, 'rx="0"');
const jobs = [
  [appIcon(), "icon", [192, 512]],
  [appIcon(), "apple-touch-icon", [180]],
  [appIcon({ scale: 0.78 }), "icon-maskable", [512]],
];
for (const name of ["picker", "kitchen", "timer", "calendar"])
  jobs.push([fullBleed(await readFile(`${dir}/${name}.svg`, "utf8")), name, [192, 512]]);

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [svg, name, sizes] of jobs)
  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    const file =
      name === "apple-touch-icon" ? `${dir}/${name}.png` : `${dir}/${name}-${size}.png`;
    await page.screenshot({ path: file });
  }
await browser.close();
console.log("Icons generated.");
