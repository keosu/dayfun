// 生成应用图标（纯 Node，不依赖图形库）：珊瑚色底，一只斜着的手机，屏幕上是笑脸，两侧有运动弧线。
//   node scripts/make-icons.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const out = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "public",
  "senselab",
  "icons",
);
fs.mkdirSync(out, { recursive: true });

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function sdRoundRect(x, y, hx, hy, r) {
  const qx = Math.abs(x) - hx + r;
  const qy = Math.abs(y) - hy + r;
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    r
  );
}

/** 返回 [r,g,b] 的 0-255 值，坐标 u、v 在 -0.5..0.5 */
function shade(u, v, scale) {
  let col = mix(hex("#f59a8f"), hex("#e2706c"), (u + v + 1) / 2);
  const x0 = u / scale;
  const y0 = v / scale;

  // 运动弧线（不随手机旋转）：以手机中心为圆心，左右各两道
  const d = Math.hypot(x0, y0);
  const ang = Math.atan2(y0, Math.abs(x0));
  for (const [rad, w] of [
    [0.37, 0.022],
    [0.44, 0.022],
  ]) {
    if (Math.abs(d - rad) < w && Math.abs(ang) < 0.5)
      col = mix(col, [255, 255, 255], 0.85);
  }

  // 手机：旋转 -16°
  const th = (-16 * Math.PI) / 180;
  const x = x0 * Math.cos(th) + y0 * Math.sin(th);
  const y = -x0 * Math.sin(th) + y0 * Math.cos(th);
  const shadow = sdRoundRect(x - 0.012, y - 0.02, 0.17, 0.285, 0.065);
  if (shadow < 0.015)
    col = mix(col, [120, 50, 60], 0.18 * Math.min(1, (0.015 - shadow) / 0.03));
  if (sdRoundRect(x, y, 0.17, 0.285, 0.065) < 0) {
    col = [255, 255, 255];
    if (sdRoundRect(x, y, 0.14, 0.25, 0.04) < 0) {
      col = mix(hex("#9b89d1"), hex("#6f5cb0"), (y + 0.25) / 0.5);
      // 眼睛
      for (const ex of [-0.055, 0.055]) {
        if (Math.hypot(x - ex, y + 0.05) < 0.022) col = [255, 255, 255];
      }
      // 笑脸
      const sd = Math.hypot(x, y - 0.01);
      if (Math.abs(sd - 0.095) < 0.0145 && y > 0.045) col = [255, 255, 255];
    }
  }
  return col;
}

function render(size, scale) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 3;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sj = 0; sj < SS; sj++) {
        for (let si = 0; si < SS; si++) {
          const c = shade(
            (i + (si + 0.5) / SS) / size - 0.5,
            (j + (sj + 0.5) / SS) / size - 0.5,
            scale,
          );
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const k = (j * size + i) * 4;
      px[k] = r / SS ** 2;
      px[k + 1] = g / SS ** 2;
      px[k + 2] = b / SS ** 2;
      px[k + 3] = 255;
    }
  }
  return px;
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const jobs = [
  ["icon-512.png", 512, 1],
  ["icon-192.png", 192, 1],
  ["icon-maskable-512.png", 512, 0.78], // 安全区更小，避免被圆形裁切
  ["apple-touch-icon.png", 180, 1],
];
for (const [name, size, scale] of jobs) {
  fs.writeFileSync(path.join(out, name), png(size, render(size, scale)));
  console.log("生成", name);
}

fs.writeFileSync(
  path.join(out, "icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f59a8f"/><stop offset="1" stop-color="#e2706c"/></linearGradient>
    <linearGradient id="sc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b89d1"/><stop offset="1" stop-color="#6f5cb0"/></linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <g fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="22" stroke-linecap="round">
    <path d="M${256 - 190} 190 a200 200 0 0 0 0 132M${256 - 225} 215 a232 232 0 0 0 0 82"/>
    <path d="M${256 + 190} 190 a200 200 0 0 1 0 132M${256 + 225} 215 a232 232 0 0 1 0 82"/>
  </g>
  <g transform="rotate(-16 256 256)">
    <rect x="169" y="110" width="174" height="292" rx="34" fill="#fff"/>
    <rect x="184" y="128" width="144" height="256" rx="22" fill="url(#sc)"/>
    <circle cx="228" cy="230" r="11" fill="#fff"/><circle cx="284" cy="230" r="11" fill="#fff"/>
    <path d="M214 270a48 48 0 0 0 84 0" fill="none" stroke="#fff" stroke-width="15" stroke-linecap="round"/>
  </g>
</svg>
`,
);
console.log("生成 icon.svg");
