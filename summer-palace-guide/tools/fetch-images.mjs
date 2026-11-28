// 把挑选好的照片下载到 img/spots/，并写出 tools/images.json（署名信息）。
// 挑选依据：tools/raw/image-candidates.json 里的序号，人工看过缩略图、核对过维基共享资源的分类。
// 没有合适照片的景点不放图，界面里用 emoji 占位（宁缺毋滥）。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const UA = "summer-palace-guide/0.1 (personal PWA project; contact: local)";

// 景点 id → 候选序号
export const PICKS = {
  "dong-gong-men": 1,
  "bei-gong-men": 2,
  "xinjian-gong-men": 3,
  "renshou-dian": 0,
  "dehe-yuan": 0,
  "yiyun-guan": 0,
  "leshou-tang": 3,
  "chang-lang": 0,
  "paiyun-dian": 3,
  "foxiang-ge": 0,
  "zhihui-hai": 3,
  "baoyun-ge": 3,
  "huazhong-you": 0,
  "shi-fang": 4,
  "suzhou-jie": 4,
  "sidabuzhou": 0,
  "xiequ-yuan": 1,
  "tong-niu": 3,
  "shiqikong-qiao": 3,
  "nanhu-dao": 2,
  "wenchang-ge": 3,
  "xiuyi-qiao": 5,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cands = JSON.parse(await readFile(`${ROOT}tools/raw/image-candidates.json`, "utf8"));
await mkdir(`${ROOT}img/spots`, { recursive: true });
await mkdir(`${ROOT}tools/raw/full`, { recursive: true });

const credits = {};
for (const [id, i] of Object.entries(PICKS)) {
  const c = cands[id][i];
  credits[id] = {
    title: decodeURIComponent(c.title.replace(/^File:/, "")),
    page: c.page,
    artist: (c.artist || "").replace(/<[^>]*>/g, "").trim(),
    license: c.license,
  };
  const out = `${ROOT}tools/raw/full/${id}.jpg`;
  if (existsSync(out)) continue;
  const url = c.url.replace(/\/\d+px-/, "/960px-").replace(/\?.*$/, "");
  for (let k = 0; k < 6; k++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      await writeFile(out, Buffer.from(await res.arrayBuffer()));
      console.log("ok", id);
      break;
    }
    console.log("重试", id, res.status);
    await sleep(3000 * (k + 1));
  }
  await sleep(1200);
}
await writeFile(`${ROOT}tools/images.json`, JSON.stringify(credits, null, 2) + "\n");
console.log("done", Object.keys(credits).length);
