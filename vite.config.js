import { defineConfig } from "vite";
import { resolve } from "node:path";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";

// 同一站点下的其他应用，按原样发布到 dist/<名字>/。它们有自己的 Service Worker 和离线清单，
// 不进入这里的离线清单（见 offlineBundle 里的 isOwnApp）。只列出发布需要的文件，工具和测试不发布。
const SUB_APPS = {
  "summer-palace-guide": [
    "index.html",
    "manifest.webmanifest",
    "sw.js",
    "css",
    "js",
    "data",
    "img",
    "icons",
    "vendor",
  ],
};

function subApps() {
  return {
    name: "little-day-sub-apps",
    apply: "build",
    closeBundle() {
      for (const [app, entries] of Object.entries(SUB_APPS)) {
        mkdirSync(resolve("dist", app), { recursive: true });
        for (const entry of entries) {
          cpSync(resolve(app, entry), resolve("dist", app, entry), {
            recursive: true,
          });
        }
      }
    },
  };
}

function offlineBundle() {
  return {
    name: "little-day-offline-bundle",
    apply: "build",
    closeBundle() {
      const root = resolve("dist");
      const walk = (directory) =>
        readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory()
            ? walk(resolve(directory, entry.name))
            : [resolve(directory, entry.name)],
        );
      // senselab（见 public/senselab）和颐和园导览（见 SUB_APPS）是单独的应用，不进入这里的离线清单和版本号
      const isOwnApp = (file) =>
        /\/(senselab|summer-palace-guide)\//.test(file.replaceAll("\\", "/"));
      const files = walk(root).filter(
        (file) =>
          !/(sw\.js|\.nojekyll|index\.html)$/.test(file) && !isOwnApp(file),
      );
      const precache = [
        "./",
        ...files.map((file) =>
          file.slice(root.length + 1).replaceAll("\\", "/"),
        ),
      ];
      const hash = createHash("sha256");
      walk(root)
        .filter((file) => !file.endsWith("sw.js") && !isOwnApp(file))
        .forEach((file) => hash.update(readFileSync(file)));
      const version = `little-day-v2-${hash.digest("hex").slice(0, 12)}`;
      let worker = readFileSync(resolve("public/sw.js"), "utf8");
      worker = worker.replace(
        /const VERSION = ["']little-day-v2-dev["'];/,
        `const VERSION = ${JSON.stringify(version)};`,
      );
      worker = worker.replace(
        /\/\* BUILD_PRECACHE \*\/[\s\S]*?\];/,
        `${JSON.stringify(precache)};`,
      );
      writeFileSync(resolve(root, "sw.js"), worker);
    },
  };
}

export default defineConfig({
  // Relative asset URLs: the same build runs at a domain root or under /<repo>/ on GitHub Pages.
  base: "./",
  plugins: [subApps(), offlineBundle()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) return "three-engine";
        },
      },
    },
  },
});
