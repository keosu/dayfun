// 极简静态服务器：node server.mjs [端口]
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};
// 不对外提供的目录（构建脚本、原始数据、测试）
const HIDDEN = /^\/(tools|tests|node_modules|test-results|playwright-report|\.git)(\/|$)/;

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (path.endsWith("/")) path += "index.html";
      if (HIDDEN.test(path) || path.includes("..")) {
        res.writeHead(404).end("not found");
        return;
      }
      const file = join(ROOT, normalize(path));
      if (!file.startsWith(ROOT)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      const st = await stat(file).catch(() => null);
      if (!st || !st.isFile()) {
        res.writeHead(404).end("not found");
        return;
      }
      const body = await readFile(file);
      const noCache = path === "/sw.js" || path === "/index.html" || path === "/manifest.webmanifest";
      res.writeHead(200, {
        "Content-Type": TYPES[extname(file)] || "application/octet-stream",
        "Cache-Control": noCache ? "no-cache" : "public, max-age=3600",
      });
      res.end(body);
    } catch (err) {
      res.writeHead(500).end(String(err));
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => console.log(`颐和园导览：http://localhost:${PORT}/`));
}
