// 体感实验室服务：静态页面 + 手柄中继。
//   npm start                      HTTPS 8443（手机用）+ HTTP 8080（电脑和游戏用）
//   npm start -- --pin 1234        要求手柄和游戏带上口令
//   npm start -- --port 9443 --http-port 9080

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";
import { createHub, PAGES_ORIGINS } from "./hub.mjs";
import { lanAddresses, loadOrCreateCert } from "./cert.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 前端和 GitHub Pages 上的是同一份文件：位于 public/senselab，由 dayfun 一起发布。
const publicDir = path.resolve(root, "..", "public", "senselab");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const httpsPort = Number(arg("port", process.env.PORT || 8443));
const httpPort = Number(arg("http-port", process.env.HTTP_PORT || 8080));
const pin = String(arg("pin", process.env.PIN || ""));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const addresses = lanAddresses();

function serve(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/info") {
    res.writeHead(200, {
      "content-type": MIME[".json"],
      "cache-control": "no-store",
    });
    return res.end(
      JSON.stringify({
        ips: addresses.map((a) => a.address),
        httpsPort,
        httpPort,
        pinRequired: !!pin,
      }),
    );
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(publicDir, rel));
  if (!file.startsWith(publicDir + path.sep)) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("没有这个页面");
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      // 开发期间页面和 Service Worker 不缓存，改完刷新即生效
      "cache-control":
        ext === ".html" || file.endsWith("sw.js")
          ? "no-cache"
          : "public, max-age=300",
    });
    res.end(data);
  });
}

// --allow-origin 可以再加一个外部页面（例如自己托管的副本），可以多次写在一起用逗号分隔
const extraOrigins = arg("allow-origin", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const hub = createHub({
  pin,
  log: (m) => console.log(`  · ${m}`),
  allowOrigins: [...PAGES_ORIGINS, ...extraOrigins],
});
const { cert, key, source } = await loadOrCreateCert(root, addresses);

const httpsServer = https.createServer({ cert, key }, serve);
const httpServer = http.createServer(serve);
httpsServer.on("upgrade", hub.handleUpgrade);
httpServer.on("upgrade", hub.handleUpgrade);

await new Promise((resolve, reject) => {
  httpsServer.once("error", reject);
  httpsServer.listen(httpsPort, "0.0.0.0", resolve);
});
await new Promise((resolve, reject) => {
  httpServer.once("error", reject);
  httpServer.listen(httpPort, "0.0.0.0", resolve);
});

const q = pin ? `?pin=${encodeURIComponent(pin)}` : "";
const phoneIp = addresses[0]?.address;
console.log("\n🎮 体感实验室已启动");
console.log(`  证书：${source}`);
console.log(
  `  口令：${pin ? pin : "未设置（局域网内任何人都能连，可用 --pin 1234 设置）"}`,
);
console.log("\n  手机（HTTPS，传感器必须用这个）：");
for (const a of addresses)
  console.log(`    https://${a.address}:${httpsPort}/${q}   (${a.name})`);
console.log("\n  GitHub Pages（手柄地址填下面的 IP:端口）：");
console.log("    https://keosu.github.io/dayfun/senselab/");
console.log("\n  电脑和游戏（HTTP）：");
console.log(`    监视器  http://localhost:${httpPort}/pc.html${q}`);
console.log(
  `    游戏接入  ws://${phoneIp || "本机IP"}:${httpPort}/ws?role=game${pin ? `&pin=${pin}` : ""}`,
);
if (phoneIp) {
  console.log("\n  用手机相机扫码打开：");
  qrcode.generate(`https://${phoneIp}:${httpsPort}/${q}`, { small: true });
}
console.log(
  "  第一次打开会提示证书不受信任，选择“继续访问/高级”即可（原因见 README）。\n",
);

function shutdown() {
  hub.close();
  httpsServer.close();
  httpServer.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
