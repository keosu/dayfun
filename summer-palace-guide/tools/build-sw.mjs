// 生成 sw.js：把应用壳、数据、图片、图标列进预缓存，版本号 = 所有文件内容的哈希。
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

export async function collectFiles() {
  const files = [];
  files.push(join(ROOT, "index.html"), join(ROOT, "manifest.webmanifest"));
  for (const d of ["css", "js", "data", "img", "icons"]) files.push(...(await walk(join(ROOT, d))));
  files.push(join(ROOT, "vendor", "leaflet", "leaflet.js"), join(ROOT, "vendor", "leaflet", "leaflet.css"));
  return files
    .map((f) => relative(ROOT, f).split(sep).join("/"))
    .filter((f) => !f.endsWith(".svg") || f === "icons/icon.svg")
    .sort();
}

export async function buildSw({ write = true } = {}) {
  const files = await collectFiles();
  const hash = createHash("sha256");
  for (const f of files) {
    hash.update(f);
    hash.update(await readFile(join(ROOT, f)));
  }
  const version = hash.digest("hex").slice(0, 10);
  const tpl = await readFile(join(ROOT, "tools", "sw.template.js"), "utf8");
  const list = ["./", ...files];
  const sw = tpl.replace("__VERSION__", version).replace("__FILES__", JSON.stringify(list, null, 2));
  if (write) await writeFile(join(ROOT, "sw.js"), sw);
  return { version, list, sw };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])) {
  const { version, list } = await buildSw();
  console.log(`sw.js 已生成：版本 ${version}，预缓存 ${list.length} 个文件`);
}