// 列出维基共享资源 Category:Summer Palace, Beijing 的子分类树和文件数，帮助挑选每个景点的照片分类。
const UA = { "User-Agent": "summer-palace-guide/0.1 (personal PWA project; image research)" };
const API = "https://commons.wikimedia.org/w/api.php";

async function get(params) {
  const url = API + "?" + new URLSearchParams({ format: "json", formatversion: "2", ...params });
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) {
      await new Promise((r) => setTimeout(r, 400));
      return res.json();
    }
    if (res.status !== 429) throw new Error(res.status);
    await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
  }
  throw new Error("429 重试多次仍失败");
}

async function info(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const j = await get({ action: "query", prop: "categoryinfo", titles: titles.slice(i, i + 40).join("|") });
    for (const p of j.query.pages) out[p.title] = p.categoryinfo || { files: 0, subcats: 0 };
  }
  return out;
}

async function subcats(title) {
  const out = [];
  let cont;
  do {
    const j = await get({ action: "query", list: "categorymembers", cmtitle: title, cmtype: "subcat", cmlimit: "500", ...(cont || {}) });
    out.push(...j.query.categorymembers.map((m) => m.title));
    cont = j.continue;
  } while (cont);
  return out;
}

async function walk(title, depth, maxDepth, seen) {
  if (seen.has(title)) return;
  seen.add(title);
  const kids = await subcats(title);
  if (!kids.length) return;
  const meta = await info(kids);
  for (const k of kids) {
    const m = meta[k];
    console.log("  ".repeat(depth) + k.replace("Category:", "") + `  [files ${m.files ?? 0}, subcats ${m.subcats ?? 0}]`);
    if (depth + 1 < maxDepth) await walk(k, depth + 1, maxDepth, seen);
  }
}

await walk("Category:Summer Palace, Beijing", 0, 3, new Set());
