import { defineConfig } from "vite";
import { resolve } from "node:path";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

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
      const files = walk(root).filter(
        (file) => !/(sw\.js|\.nojekyll|index\.html)$/.test(file),
      );
      const precache = [
        "./",
        ...files.map((file) =>
          file.slice(root.length + 1).replaceAll("\\", "/"),
        ),
      ];
      const hash = createHash("sha256");
      walk(root)
        .filter((file) => !file.endsWith("sw.js"))
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
  plugins: [offlineBundle()],
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
