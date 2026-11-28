// 下载候选照片的小缩略图（250px），用来拼“联系表”人工挑选。
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const UA = { "User-Agent": "summer-palace-guide/0.1 (personal PWA project; image research)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cands = JSON.parse(await readFile(new URL("./raw/image-candidates.json", import.meta.url), "utf8"));
await mkdir(new URL("./raw/thumbs/", import.meta.url), { recursive: true });
const N = 6;

async function download(url, file) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) {
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      return true;
    }
    if (res.status !== 429) return false;
    await sleep(Math.max(Number(res.headers.get("retry-after")) * 1000 || 0, 6000 * (i + 1)));
  }
  return false;
}

for (const [id, list] of Object.entries(cands)) {
  for (let i = 0; i < Math.min(N, list.length); i++) {
    const file = new URL(`./raw/thumbs/${id}_${i}.jpg`, import.meta.url);
    if (existsSync(file)) continue;
    const small = list[i].url.replace(/\/(\d+)px-/, "/250px-");
    const ok = await download(small, file);
    if (!ok) console.log("失败", id, i, small);
    await sleep(900);
  }
  console.log("done", id);
}
