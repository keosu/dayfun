// 生成 App 用的 data/spots.json 与 data/routes.json：
//   1. 合并 tools/content.mjs 的文字、tools/images.json 的照片信息；
//   2. 用 OpenStreetMap 的步行路网（tools/raw/highways.json）为每条线路算出沿真实小路的路径与距离。
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { SPOTS, ROUTES, ZONES } from "./content.mjs";

const rawJson = async (n) => JSON.parse(await readFile(new URL(`./raw/${n}.json`, import.meta.url), "utf8")).elements;
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => {
  const dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]);
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

// ── 路网 ──
const WALK = new Set(["footway", "path", "steps", "pedestrian", "track", "cycleway", "service", "residential", "unclassified", "tertiary", "tertiary_link", "living_street", "corridor", "secondary", "primary"]);
const key = (p) => p[0].toFixed(6) + "," + p[1].toFixed(6);
const nodes = new Map(); // key -> {p:[lat,lon], adj: Map(key -> meters)}
const node = (p) => {
  const k = key(p);
  if (!nodes.has(k)) nodes.set(k, { p, adj: new Map() });
  return nodes.get(k);
};
for (const e of await rawJson("highways")) {
  const t = e.tags || {};
  if (!WALK.has(t.highway) || t.access === "private" || t.access === "no" || t.foot === "no") continue;
  const g = e.geometry.map((q) => [q.lat, q.lon]);
  for (let i = 0; i < g.length; i++) {
    const a = node(g[i]);
    if (i > 0) {
      const b = node(g[i - 1]);
      const d = hav(a.p, b.p) * (t.highway === "steps" ? 1.3 : 1);
      a.adj.set(key(b.p), d);
      b.adj.set(key(a.p), d);
    }
  }
}
const nodeKeys = [...nodes.keys()];
// 离某点最近的 n 个路网节点（景点本身可能在院子里或路口外，多试几个出口）
const nearestNodes = (p, n = 5, maxM = 220) =>
  nodeKeys
    .map((k) => ({ k, d: hav(p, nodes.get(k).p) }))
    .filter((x) => x.d <= maxM)
    .sort((a, b) => a.d - b.d)
    .slice(0, n);

function dijkstra(from, to) {
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const open = [[0, from]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [d, k] = open.shift();
    if (k === to) break;
    if (d > dist.get(k)) continue;
    for (const [n, w] of nodes.get(k).adj) {
      const nd = d + w;
      if (nd < (dist.get(n) ?? Infinity)) {
        dist.set(n, nd);
        prev.set(n, k);
        open.push([nd, n]);
      }
    }
  }
  if (!dist.has(to)) return null;
  const path = [];
  for (let k = to; k; k = prev.get(k)) path.push(nodes.get(k).p);
  return { m: dist.get(to), path: path.reverse() };
}

// ── 景点 ──
const bridges = await rawJson("bridges");
const images = existsSync(new URL("./images.json", import.meta.url))
  ? JSON.parse(await readFile(new URL("./images.json", import.meta.url), "utf8"))
  : {};
const boundary = (await rawJson("boundary"))[0].geometry.map((p) => [p.lat, p.lon]);
const inside = (pt) => {
  let c = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const [yi, xi] = boundary[i], [yj, xj] = boundary[j];
    if (yi > pt[0] !== yj > pt[0] && pt[1] < ((xj - xi) * (pt[0] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

const spots = [];
for (const s of SPOTS) {
  const at = s.at.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]);
  if (s.way) {
    const w = bridges.find((e) => e.id === s.way);
    if (w) {
      const g = w.geometry.map((q) => [+q.lat.toFixed(5), +q.lon.toFixed(5)]);
      at.push(g[0], g[g.length - 1]);
    }
  }
  const img = images[s.id];
  spots.push({
    id: s.id, name: s.name, zone: s.zone, emoji: s.emoji, classic: !!s.classic, approx: !!s.approx,
    radius: s.radius, at, summary: s.summary, narration: s.narration, facts: s.facts || [], tip: s.tip || "",
    img: img ? `img/spots/${s.id}.jpg` : null,
    thumb: img ? `img/spots/${s.id}-s.jpg` : null,
    credit: img ? { title: img.title, page: img.page, artist: img.artist, license: img.license } : null,
  });
}
const byId = new Map(spots.map((s) => [s.id, s]));
for (const s of spots) {
  if (!ZONES[s.zone]) throw new Error("未知分区 " + s.id);
  if (!s.at.some(inside)) console.warn("⚠ 景点不在园区边界内（可能是门区）：", s.id);
}

// ── 线路 ──
const routes = [];
for (const r of ROUTES) {
  for (const id of r.stops) if (!byId.has(id)) throw new Error(`线路 ${r.id} 引用了不存在的景点 ${id}`);
  const legs = [];
  let path = [];
  let walkM = 0, boatM = 0;
  for (let i = 0; i < r.stops.length - 1; i++) {
    const a = byId.get(r.stops[i]), b = byId.get(r.stops[i + 1]);
    const boat = (r.boatLegs || []).some(([x, y]) => x === a.id && y === b.id);
    const pa = a.at[0], pb = b.at[0];
    let leg;
    if (!boat) {
      let best = null;
      for (const na of nearestNodes(pa)) for (const nb of nearestNodes(pb)) {
        const sp = dijkstra(na.k, nb.k);
        if (sp && (!best || sp.m + na.d + nb.d < best.m)) best = { m: sp.m + na.d + nb.d, path: [pa, ...sp.path, pb], mode: "walk" };
      }
      // 绕得太远（超过直线距离两倍多）说明路网在这里没接上，宁可画直线
      if (best && best.m <= hav(pa, pb) * 2.2 + 120) leg = best;
    }
    if (!leg) leg = { m: hav(pa, pb), path: [pa, pb], mode: boat ? "boat" : "line" };
    if (leg.mode === "boat") boatM += leg.m; else walkM += leg.m;
    legs.push({ from: a.id, to: b.id, m: Math.round(leg.m), mode: leg.mode });
    path.push({ mode: leg.mode, pts: leg.path.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]) });
    if (leg.mode === "line") console.warn(`⚠ ${r.id}: ${a.id} → ${b.id} 没有找到步行路径，用直线代替`);
  }
  routes.push({
    id: r.id, from: r.from, entrance: r.entrance, name: r.name, hours: r.hours, source: r.source,
    summary: r.summary, note: r.note || "", stops: r.stops, legs, path,
    walkKm: +(walkM / 1000).toFixed(1), boatKm: +(boatM / 1000).toFixed(1),
  });
}

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(new URL("../data/spots.json", import.meta.url), JSON.stringify({ zones: ZONES, spots }));
await writeFile(new URL("../data/routes.json", import.meta.url), JSON.stringify({ routes }));
console.log(`spots ${spots.length}，routes ${routes.length}`);
for (const r of routes) console.log(`  ${r.id.padEnd(11)} ${r.entrance} ${r.name}  步行约 ${r.walkKm} km${r.boatKm ? " + 船 " + r.boatKm + " km" : ""}  ${r.hours}`);
