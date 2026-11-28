// 把 tools/raw/ 里的 OpenStreetMap 原始数据整理成 App 用的精简地图 data/map.json。
// 数据 © OpenStreetMap contributors，ODbL（需要署名，见 App 里的“数据与版权”）。
import { readFile, writeFile, mkdir } from "node:fs/promises";

const raw = async (n) => JSON.parse(await readFile(new URL(`./raw/${n}.json`, import.meta.url), "utf8")).elements;
const round = (v) => Math.round(v * 1e5) / 1e5; // 约 1 米
const pts = (e) => e.geometry.map((p) => [p.lat, p.lon]);

// Douglas–Peucker 抽稀（单位：度；1e-5 约 1 米）
function simplify(line, eps = 0.000012) {
  if (line.length < 3) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, idx = -1;
    const [ay, ax] = line[a], [by, bx] = line[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [py, px] = line[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > max) { max = d; idx = i; }
    }
    if (max > eps) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return line.filter((_, i) => keep[i]);
}
const out2 = (line, eps) => simplify(line, eps).map(([la, lo]) => [round(la), round(lo)]);
const closed = (l) => l.length > 3 && l[0][0] === l[l.length - 1][0] && l[0][1] === l[l.length - 1][1];

// 把若干条首尾相接的线段拼成闭合环（昆明湖的外轮廓由多段组成）
function joinRings(segs) {
  const rings = [];
  const pool = segs.map((s) => s.slice());
  const key = (p) => p[0] + "," + p[1];
  while (pool.length) {
    let cur = pool.pop();
    let guard = 0;
    while (!closed(cur) && guard++ < 1000) {
      const end = key(cur[cur.length - 1]);
      let found = -1, rev = false;
      for (let i = 0; i < pool.length; i++) {
        if (key(pool[i][0]) === end) { found = i; break; }
        if (key(pool[i][pool[i].length - 1]) === end) { found = i; rev = true; break; }
      }
      if (found < 0) break;
      let next = pool.splice(found, 1)[0];
      if (rev) next = next.reverse();
      cur = cur.concat(next.slice(1));
    }
    if (closed(cur)) rings.push(cur);
  }
  return rings;
}

const [boundaryEls, waterEls, waterRel, buildingEls, highwayEls, wallEls, greenEls, bridgeEls] = await Promise.all(
  ["boundary", "water", "waterrel", "buildings", "highways", "walls", "green", "bridges"].map(raw),
);

const boundary = out2(pts(boundaryEls[0]), 0.00001);
const park = { s: 39.9792, w: 116.2548, n: 40.0011, e: 116.2771 };
const M = 0.0025; // 园外保留的边距（约 250 米）
const near = (l) => l.some(([la, lo]) => la > park.s - M && la < park.n + M && lo > park.w - M && lo < park.e + M);

// 水面
const water = [];
const waterKeep = (ring) => near(ring);
for (const e of waterEls) {
  if (e.type !== "way" || e.tags?.natural !== "water") continue;
  const r = pts(e);
  if (closed(r) && waterKeep(r)) water.push([out2(r, 0.00001)]);
}
for (const rel of waterRel) {
  if (!["昆明湖", "藻鉴堂湖", "苏州河", "团城湖"].includes(rel.tags?.name)) continue;
  const outer = joinRings((rel.members || []).filter((m) => m.role === "outer" && m.geometry).map((m) => m.geometry.map((p) => [p.lat, p.lon])));
  const inner = joinRings((rel.members || []).filter((m) => m.role === "inner" && m.geometry).map((m) => m.geometry.map((p) => [p.lat, p.lon])));
  for (const o of outer) {
    if (!waterKeep(o)) continue;
    water.push([out2(o, 0.00001), ...inner.map((i) => out2(i, 0.00001))]);
  }
}
const waterLines = [];
for (const e of waterEls) {
  if (e.type !== "way" || !e.tags?.waterway || e.tags.waterway === "dam") continue;
  const l = pts(e);
  if (near(l)) waterLines.push(out2(l));
}

// 绿地
const green = [];
for (const e of greenEls) {
  if (e.id === 29228773) continue; // 园区边界本身
  if (e.tags?.name?.includes("公园") && !e.tags.name.includes("谐趣园")) continue; // 园外的公园
  const r = pts(e);
  if (closed(r) && near(r)) green.push(out2(r, 0.00002));
}

// 建筑
const buildings = [];
for (const e of buildingEls) {
  const r = pts(e);
  if (!closed(r) || !near(r)) continue;
  const b = { r: out2(r, 0.000008) };
  if (e.tags?.name) b.n = e.tags.name;
  buildings.push(b);
}

// 道路与小路
const PATH = new Set(["footway", "path", "steps", "pedestrian", "track", "cycleway", "bridleway", "corridor"]);
const ROAD = new Set(["service", "residential", "unclassified", "tertiary", "tertiary_link", "secondary", "primary", "living_street", "trunk"]);
const paths = [], roads = [], bridgeLines = [];
for (const e of highwayEls) {
  const h = e.tags?.highway;
  const l = pts(e);
  if (!near(l)) continue;
  if (e.tags.bridge && e.tags.bridge !== "no" && h && !["motorway", "motorway_link"].includes(h)) {
    bridgeLines.push({ l: out2(l, 0.000008), n: e.tags.name });
  }
  if (PATH.has(h)) paths.push(out2(l, 0.000008));
  else if (ROAD.has(h)) roads.push(out2(l, 0.000008));
}
const walls = [];
for (const e of wallEls) {
  const l = pts(e);
  if (near(l)) walls.push(out2(l));
}

const map = {
  v: 1,
  attribution: "© OpenStreetMap contributors (ODbL)",
  boundary,
  water,
  waterLines,
  green,
  buildings,
  paths,
  roads,
  walls,
  bridges: bridgeLines,
};
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
const json = JSON.stringify(map);
await writeFile(new URL("../data/map.json", import.meta.url), json);
console.log("map.json", (json.length / 1024).toFixed(0), "KB");
for (const [k, v] of Object.entries(map)) if (Array.isArray(v)) console.log(" ", k, v.length);
