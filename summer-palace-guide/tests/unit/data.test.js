import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { buildSw } from "../../tools/build-sw.mjs";

const root = new URL("../../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const { zones, spots } = read("data/spots.json");
const { routes } = read("data/routes.json");
const map = read("data/map.json");
const byId = new Map(spots.map((s) => [s.id, s]));
const BBOX = { s: 39.9775, w: 116.2525, n: 40.0035, e: 116.2795 };
const OK_LICENSE = /^(CC BY(-SA)? [0-9.]+|CC0|Public domain|PD)/i;

test("景点：id 唯一、字段齐全、位置在园区范围内", () => {
  assert.ok(spots.length >= 30);
  assert.equal(byId.size, spots.length);
  for (const s of spots) {
    assert.ok(zones[s.zone], `${s.id} 的分区无效`);
    assert.ok(s.name && s.emoji && s.summary, s.id);
    assert.ok(s.narration.length >= 80 && s.narration.length <= 700, `${s.id} 讲解词长度 ${s.narration.length}`);
    assert.ok(s.radius >= 25 && s.radius <= 150, `${s.id} 半径 ${s.radius}`);
    assert.ok(s.at.length >= 1);
    for (const [lat, lon] of s.at) {
      assert.ok(lat > BBOX.s && lat < BBOX.n && lon > BBOX.w && lon < BBOX.e, `${s.id} 坐标越界`);
    }
    for (const f of s.facts) assert.equal(f.length, 2, `${s.id} facts 格式`);
  }
  assert.ok(spots.filter((s) => s.zone === "gate").length >= 5);
});

test("讲解词不含乱码和占位符", () => {
  for (const s of spots) {
    assert.doesNotMatch(s.narration, /TODO|待补|\?\?|�/, s.id);
  }
});

test("照片：文件存在、有署名、许可证是允许的类型；经典景点大多有图", () => {
  let withImg = 0;
  for (const s of spots) {
    if (!s.img) continue;
    withImg++;
    assert.ok(existsSync(new URL(s.img, root)), `${s.id} 大图缺失`);
    assert.ok(existsSync(new URL(s.thumb, root)), `${s.id} 缩略图缺失`);
    assert.ok(s.credit?.page?.startsWith("https://commons.wikimedia.org/"), `${s.id} 缺少原图页面`);
    assert.match(s.credit.license, OK_LICENSE, `${s.id} 许可证 ${s.credit.license}`);
    assert.ok(s.credit.artist, `${s.id} 缺少作者`);
  }
  assert.ok(withImg >= 18, `只有 ${withImg} 个景点有照片`);
  const classic = spots.filter((s) => s.classic);
  const classicWith = classic.filter((s) => s.img).length;
  assert.ok(classicWith / classic.length >= 0.75, `经典景点有图 ${classicWith}/${classic.length}`);
  // img/spots 里没有多余文件
  const used = new Set(spots.flatMap((s) => (s.img ? [s.img.split("/").pop(), s.thumb.split("/").pop()] : [])));
  for (const f of readdirSync(new URL("img/spots/", root))) assert.ok(used.has(f), `多余图片 ${f}`);
});

test("线路：景点都存在，段数、路径、距离合理", () => {
  const entrances = new Set(routes.map((r) => r.entrance));
  for (const e of ["东宫门", "北宫门", "新建宫门", "南如意门"]) assert.ok(entrances.has(e), `缺少 ${e} 的线路`);
  for (const r of routes) {
    assert.ok(r.stops.length >= 3, r.id);
    for (const id of r.stops) assert.ok(byId.has(id), `${r.id} 引用了不存在的景点 ${id}`);
    assert.equal(r.stops[0], r.from, `${r.id} 应从入口出发`);
    assert.equal(byId.get(r.from).zone, "gate", `${r.id} 起点不是门`);
    assert.equal(new Set(r.stops).size, r.stops.length, `${r.id} 有重复景点`);
    assert.equal(r.legs.length, r.stops.length - 1);
    assert.equal(r.path.length, r.legs.length);
    r.legs.forEach((l, i) => {
      assert.equal(l.from, r.stops[i]);
      assert.equal(l.to, r.stops[i + 1]);
      assert.ok(l.m > 0 && l.m < 3000, `${r.id} 第 ${i + 1} 段 ${l.m} 米`);
    });
    for (const p of r.path) assert.ok(p.pts.length >= 2);
    assert.ok(r.walkKm > 0.3 && r.walkKm < 12, `${r.id} 步行 ${r.walkKm} 公里`);
  }
  assert.ok(routes.some((r) => r.boatKm > 0), "应该有一条带乘船的线路");
});

test("地图数据：边界闭合合理，图层都有内容", () => {
  assert.ok(map.boundary.length > 50);
  for (const k of ["water", "green", "buildings", "paths", "roads", "bridges"]) assert.ok(map[k].length > 0, k);
  assert.ok(JSON.stringify(map).length < 400_000);
});

test("Service Worker：预缓存覆盖所有页面用到的文件，版本与内容同步", async () => {
  const { list, sw } = await buildSw({ write: false });
  const onDisk = readFileSync(new URL("sw.js", root), "utf8");
  assert.equal(onDisk, sw, "sw.js 已过期，请运行 npm run build");
  for (const f of list) if (f !== "./") assert.ok(existsSync(new URL(f, root)), `预缓存了不存在的文件 ${f}`);
  const set = new Set(list);
  for (const f of ["index.html", "manifest.webmanifest", "css/app.css", "vendor/leaflet/leaflet.js", "data/map.json", "data/spots.json", "data/routes.json", "icons/icon-192.png", "icons/icon-512.png"]) {
    assert.ok(set.has(f), `预缓存缺少 ${f}`);
  }
  for (const f of readdirSync(new URL("js/", root))) assert.ok(set.has(`js/${f}`), `预缓存缺少 js/${f}`);
  for (const s of spots) if (s.img) assert.ok(set.has(s.img) && set.has(s.thumb));
  const size = list.reduce((n, f) => (f === "./" ? n : n + readFileSync(new URL(f, root)).length), 0);
  assert.ok(size < 8_000_000, `预缓存 ${(size / 1e6).toFixed(1)} MB 太大`);
});

test("manifest：图标文件存在，类型正确", () => {
  const m = read("manifest.webmanifest");
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.purpose === "maskable"));
  for (const i of m.icons) assert.ok(existsSync(new URL(i.src, root)), i.src);
});
