// 为每个景点在维基共享资源（Wikimedia Commons，免 key）里找候选照片，只保留允许再利用的许可。
// 结果写到 tools/raw/image-candidates.json，并把 320px 缩略图下载到 tools/raw/thumbs/ 方便人工挑选。
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";

const UA = { "User-Agent": "summer-palace-guide/0.1 (personal PWA project; image research)" };
const API = "https://commons.wikimedia.org/w/api.php";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// id: { cats: 分类名（可多个）, q: 搜索词（可多个） }
export const SPOTS = {
  "dong-gong-men": { cats: ["Eastern Gate of the Summer Palace"], q: ["Summer Palace East Gate Beijing"] },
  "renshou-dian": { cats: ["Renshou Gate of the Summer Palace"], q: ["Hall of Benevolence and Longevity Summer Palace", "Renshou Hall Summer Palace"] },
  "dehe-yuan": { cats: ["Garden of Virtue and Harmony"], q: ["Deheyuan Grand Opera House Summer Palace"] },
  "yulan-tang": { cats: ["Hall of Jade Ripples (interiors)", "Garden of Harmony and Enchantment"], q: ["Yulan Hall Summer Palace Hall of Jade Ripples", "Yulantang Summer Palace"] },
  "yiyun-guan": { cats: ["Yiyun Hall (interiors)"], q: ["Yiyun Hall Summer Palace", "Hall of Joyful Longevity Summer Palace Leshoutang"] },
  "leshou-tang": { cats: ["Hall of Joyful Longevity (interiors)"], q: ["Leshou Tang Summer Palace courtyard", "Hall of Joyful Longevity Summer Palace"] },
  "chang-lang": { cats: ["Long Corridor"], q: ["Long Corridor Summer Palace Beijing"] },
  "paiyun-dian": { cats: ["Hall of Dispelling Clouds (interiors)"], q: ["Paiyun Hall Summer Palace", "Hall of Dispelling Clouds Summer Palace"] },
  "foxiang-ge": { cats: ["Tower of Buddhist Incense"], q: ["Tower of Buddhist Incense Summer Palace"] },
  "zhihui-hai": { cats: ["Hall of the Sea of Wisdom (details)"], q: ["Zhihuihai Summer Palace"] },
  "shi-fang": { cats: ["Marble Boat (details)"], q: ["Marble Boat Summer Palace Qingyan"] },
  "suzhou-jie": { cats: ["Suzhou Street"], q: ["Suzhou Street Summer Palace"] },
  "xiequ-yuan": { cats: ["Garden of Harmony and Enchantment"], q: ["Xiequyuan Garden of Harmonious Interests"] },
  "dannin-tang": { cats: [], q: ["Danning Hall Summer Palace", "Suzhou Street Summer Palace Danninghall"] },
  "sidabuzhou": { cats: ["Sumeru lingjing"], q: ["Sumeru Lingjing Summer Palace"] },
  "tong-niu": { cats: ["East Causeway (Summer Palace, Beijing)"], q: ["Bronze Ox Summer Palace", "Bronze ox Kunming Lake Summer Palace"] },
  "wenchang-ge": { cats: ["Wenchang Pavilion (Summer Palace, Beijing)", "Wenchang Gallery (Summer Palace, Beijing)"], q: ["Wenchang Gallery Summer Palace"] },
  "shiqikong-qiao": { cats: ["Seventeen Arch Bridge"], q: ["Seventeen-Arch Bridge Kunming Lake"] },
  "nanhu-dao": { cats: ["Islands in the Summer Palace, Beijing", "Kunming Lake"], q: ["South Lake Island Summer Palace Dragon King Temple", "Nanhu Island Summer Palace"] },
  "kuoru-ting": { cats: ["Seventeen Arch Bridge", "East Causeway (Summer Palace, Beijing)"], q: ["Kuoru Pavilion Summer Palace", "Octagonal Pavilion Eight-sided pavilion Summer Palace"] },
  "zhichun-ting": { cats: ["East Causeway (Summer Palace, Beijing)"], q: ["Zhichun Pavilion Summer Palace", "Pavilion Knowing Spring Summer Palace"] },
  "yudai-qiao": { cats: ["Jade Belt Bridge (Summer Palace)"], q: ["Jade Belt Bridge Summer Palace"] },
  "xidi": { cats: ["West Causeway (Summer Palace, Beijing)"], q: ["West Causeway Summer Palace willows"] },
  "xiuyi-qiao": { cats: ["Xiuyi Bridge"], q: ["Xiuyi Bridge Summer Palace"] },
  "changguan-tang": { cats: ["West Causeway (Summer Palace, Beijing)"], q: ["Changguan Hall Summer Palace", "Kunming Lake southwest Summer Palace West Gate"] },
  "bei-gong-men": { cats: ["Northern Gate of the Summer Palace"], q: ["Summer Palace North Gate"] },
  "xinjian-gong-men": { cats: ["New Gate of the Summer Palace", "Paifang at the New Gate of the Summer Palace"], q: ["Summer Palace New Gate Xinjian"] },
  "nan-ruyi-men": { cats: ["Entrances to the Summer Palace, Beijing"], q: ["Nanruyi Gate Summer Palace", "South Ruyi Gate Summer Palace"] },
  "xi-men": { cats: ["Western Gate of the Summer Palace"], q: ["Summer Palace West Gate"] },
  "bei-ruyi-men": { cats: ["Entrances to the Summer Palace, Beijing"], q: ["Beiruyi Gate Summer Palace", "North Ruyi Gate Summer Palace"] },
  "tingli-guan": { cats: ["Long Corridor"], q: ["Tingliguan Summer Palace theatre", "Listening to Orioles Pavilion Summer Palace"] },
  "huazhong-you": { cats: ["Longevity Hill"], q: ["Huazhongyou Summer Palace", "Chengui Pavilion Summer Palace Yongyue Tower"] },
  "baoyun-ge": { cats: [], q: ["Baoyun Pavilion Bronze Pavilion Summer Palace", "Bronze Pavilion Summer Palace"] },
  "gengzhi-tu": { cats: ["West Causeway (Summer Palace, Beijing)"], q: ["Gengzhitu Summer Palace", "Summer Palace west bank Kunming Lake Water Drill Academy"] },
  "overview-lake": { cats: ["Kunming Lake"], q: ["Kunming Lake Summer Palace panorama"] },
  "overview-hill": { cats: ["Longevity Hill"], q: ["Longevity Hill Summer Palace panorama"] },
};

async function get(params) {
  const url = API + "?" + new URLSearchParams({ format: "json", formatversion: "2", ...params });
  for (let i = 0; i < 8; i++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) {
      await sleep(1500);
      return res.json();
    }
    if (res.status !== 429) throw new Error(res.status + " " + url.slice(0, 100));
    await sleep(Math.max(Number(res.headers.get("retry-after")) * 1000 || 0, 8000 * (i + 1)));
  }
  throw new Error("429 重试多次仍失败");
}

const IMG = { prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1000", iiextmetadatafilter: "LicenseShortName|Artist|Credit|ImageDescription|AttributionRequired|UsageTerms|DateTimeOriginal" };
const strip = (s = "") => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const OK_LICENSE = /^(CC BY(-SA)? \d(\.\d)?|CC0|Public domain|PD[ -]|No known)/i;

function toCandidate(p) {
  const ii = p.imageinfo?.[0];
  if (!ii || ii.mime !== "image/jpeg") return null;
  const m = ii.extmetadata || {};
  const license = strip(m.LicenseShortName?.value);
  if (!OK_LICENSE.test(license)) return null;
  if (ii.width < 1400 || ii.height < 800) return null;
  const ratio = ii.width / ii.height;
  return {
    title: p.title,
    page: "https://commons.wikimedia.org/wiki/" + encodeURIComponent(p.title.replace(/ /g, "_")),
    url: ii.thumburl || ii.url,
    original: ii.url,
    width: ii.width,
    height: ii.height,
    ratio: +ratio.toFixed(2),
    license,
    artist: strip(m.Artist?.value).slice(0, 120),
    desc: strip(m.ImageDescription?.value).slice(0, 140),
  };
}

async function fromCategory(cat) {
  const out = [];
  const j = await get({ action: "query", generator: "categorymembers", gcmtitle: "Category:" + cat, gcmtype: "file", gcmlimit: "60", ...IMG });
  for (const p of j.query?.pages || []) out.push(p);
  return out;
}

async function fromSearch(q) {
  const j = await get({ action: "query", generator: "search", gsrsearch: q + " filetype:bitmap", gsrnamespace: "6", gsrlimit: "25", ...IMG });
  return j.query?.pages || [];
}

const KW = {
  "tong-niu": /bronze ox|bronze cow|copper ox|bull|ox\b|cattle|铜牛|金牛/i,
  "zhichun-ting": /zhichun|knowing spring|知春|spring pavilion/i,
  "kuoru-ting": /kuoru|octagon|eight|八方|廓如/i,
  "nanhu-dao": /nanhu|south lake|dragon king|guangrun|hanxu|涵虚|龙王/i,
  "huazhong-you": /huazhong|painted tour|picture|chenghui|yongyue|画中游/i,
  "gengzhi-tu": /gengzhi|farming|weaving|water drill|耕织|水操/i,
  "changguan-tang": /changguan|畅观/i,
  "tingli-guan": /tingli|oriole|听鹂/i,
  "nan-ruyi-men": /ruyi|south gate|如意/i,
  "bei-ruyi-men": /ruyi|north gate|如意/i,
  "xinjian-gong-men": /new gate|xinjian|新建/i,
  "yulan-tang": /yulan|jade ripples|玉澜/i,
  "renshou-dian": /renshou|benevolence|longevity hall|仁寿/i,
  "baoyun-ge": /bronze|baoyun|铜/i,
  "wenchang-ge": /wenchang|文昌/i,
  "zhihui-hai": /zhihui|wisdom|智慧/i,
  "leshou-tang": /leshou|joyful longevity|乐寿/i,
  "yiyun-guan": /yiyun|宜芸/i,
  "paiyun-dian": /paiyun|dispelling|排云/i,
  "dehe-yuan": /dehe|virtue|opera|theatre|theater|戏/i,
};
let CURRENT_ID = "";
const score = (c) => {
  let s = Math.min(c.width, 4000) / 4000;
  if (KW[CURRENT_ID] && KW[CURRENT_ID].test(c.title + " " + c.desc)) s += 2;
  if (c.ratio >= 1.25 && c.ratio <= 1.8) s += 0.6;
  else if (c.ratio >= 1.0) s += 0.2;
  if (/CC0|Public|PD/i.test(c.license)) s += 0.1;
  return s;
};

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  await mkdir(new URL("./raw/thumbs/", import.meta.url), { recursive: true });
  const outFile = new URL("./raw/image-candidates.json", import.meta.url);
  const all = existsSync(outFile) ? JSON.parse(await readFile(outFile, "utf8")) : {};
  const only = process.argv.slice(2);
  for (const [id, cfg] of Object.entries(SPOTS)) {
    if (only.length && !only.includes(id)) continue;
    if (all[id]?.length && !only.length) continue;
    const pages = [];
    for (const c of cfg.cats) pages.push(...(await fromCategory(c)));
    for (const q of cfg.q) pages.push(...(await fromSearch(q)));
    const seen = new Set();
    const cands = [];
    for (const p of pages) {
      if (seen.has(p.title)) continue;
      seen.add(p.title);
      const c = toCandidate(p);
      if (c) cands.push(c);
    }
    CURRENT_ID = id;
    cands.sort((a, b) => score(b) - score(a));
    all[id] = cands.slice(0, 9);
    console.log(id.padEnd(18), cands.length, "个候选");
    await writeFile(outFile, JSON.stringify(all, null, 1));
  }
}
