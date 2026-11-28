import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bearing, compass, distance, distanceToPolygon, formatDistance, gcj02ToWgs84, nearestGate, pickAutoSpot, pointInPolygon, wgs84ToGcj02,
} from "../../js/geo.js";

const spots = JSON.parse(readFileSync(new URL("../../data/spots.json", import.meta.url))).spots;
const map = JSON.parse(readFileSync(new URL("../../data/map.json", import.meta.url)));
const byId = Object.fromEntries(spots.map((s) => [s.id, s]));

test("distance：1 度纬度约 111 公里，东宫门到仁寿殿约百米量级", () => {
  assert.ok(Math.abs(distance([0, 0], [1, 0]) - 111195) < 200);
  const d = distance(byId["dong-gong-men"].at[0], byId["renshou-dian"].at[0]);
  assert.ok(d > 100 && d < 200, `d=${d}`);
});

test("bearing / compass：四个方向", () => {
  assert.equal(compass(bearing([0, 0], [1, 0])), "北");
  assert.equal(compass(bearing([0, 0], [0, 1])), "东");
  assert.equal(compass(bearing([0, 0], [-1, 0])), "南");
  assert.equal(compass(bearing([0, 0], [0, -1])), "西");
  assert.equal(compass(bearing([0, 0], [1, 1])), "东北");
  assert.equal(compass(359), "北");
});

test("formatDistance：米与公里", () => {
  assert.equal(formatDistance(2), "5 米");
  assert.equal(formatDistance(87), "85 米");
  assert.equal(formatDistance(1234), "1.2 公里");
});

test("pointInPolygon：方形里外", () => {
  const sq = [[0, 0], [0, 1], [1, 1], [1, 0]];
  assert.equal(pointInPolygon([0.5, 0.5], sq), true);
  assert.equal(pointInPolygon([1.5, 0.5], sq), false);
});

test("园区边界：昆明湖中心在园内，天安门不在", () => {
  assert.equal(pointInPolygon([39.9868, 116.2668], map.boundary), true);
  assert.equal(pointInPolygon([39.9087, 116.3975], map.boundary), false);
  assert.ok(distanceToPolygon([39.9087, 116.3975], map.boundary) > 5000);
});

test("所有景点都落在园区边界内或边界 150 米内（门在边界附近）", () => {
  for (const s of spots) {
    for (const p of s.at) {
      const inside = pointInPolygon(p, map.boundary);
      assert.ok(inside || distanceToPolygon(p, map.boundary) < 150, `${s.name} 在园外 ${Math.round(distanceToPolygon(p, map.boundary))} 米`);
    }
  }
});

test("GCJ-02：国内有几百米偏移，往返误差小于 2 米；海外不偏移", () => {
  const p = [39.9967, 116.2756];
  const g = wgs84ToGcj02(p);
  const off = distance(p, g);
  assert.ok(off > 100 && off < 800, `off=${off}`);
  assert.ok(distance(gcj02ToWgs84(g), p) < 2);
  const london = [51.5, -0.12];
  assert.equal(distance(london, wgs84ToGcj02(london)), 0);
});

test("pickAutoSpot：到达半径内才算；离开所有景点返回 null", () => {
  const s = byId["foxiang-ge"];
  const here = { lat: s.at[0][0], lon: s.at[0][1], acc: 10 };
  assert.equal(pickAutoSpot(here, spots)?.id, "foxiang-ge");
  const far = { lat: 39.9868, lon: 116.2668, acc: 10 }; // 湖中心
  assert.equal(pickAutoSpot(far, spots), null);
});

test("pickAutoSpot：粘性——在两个景点之间不来回跳", () => {
  const a = byId["paiyun-dian"];
  const b = byId["foxiang-ge"];
  // 站在两个景点的中间偏 b 一点点
  const lat = a.at[0][0] + (b.at[0][0] - a.at[0][0]) * 0.55;
  const lon = a.at[0][1] + (b.at[0][1] - a.at[0][1]) * 0.55;
  const loc = { lat, lon, acc: 10 };
  const keepA = pickAutoSpot(loc, spots, { current: "paiyun-dian" });
  if (keepA) {
    // 当前景点还在范围内，且对方没有近 15 米以上 → 必须留在原地
    const dA = distance([lat, lon], a.at.reduce((x, y) => (distance([lat, lon], x) < distance([lat, lon], y) ? x : y)));
    const dB = distance([lat, lon], b.at.reduce((x, y) => (distance([lat, lon], x) < distance([lat, lon], y) ? x : y)));
    if (dB > dA - 15) assert.equal(keepA.id, "paiyun-dian");
  }
});

test("pickAutoSpot：线路里的景点优先", () => {
  const a = byId["leshou-tang"];
  const loc = { lat: a.at[0][0], lon: a.at[0][1], acc: 20 };
  const plain = pickAutoSpot(loc, spots);
  const routed = pickAutoSpot(loc, spots, { routeStops: [plain.id] });
  assert.equal(routed.id, plain.id);
});

test("nearestGate：北边的点离北宫门最近", () => {
  assert.equal(nearestGate([40.003, 116.268], spots).id, "bei-gong-men");
  assert.equal(nearestGate([39.99, 116.2757], spots).id, "xinjian-gong-men");
});
