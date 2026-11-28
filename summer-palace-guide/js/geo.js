// 纯计算：距离、方位、点在多边形内、坐标系转换、自动选景点。没有任何 DOM 依赖，方便测试。

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** 两点（[纬度, 经度]）的球面距离，米 */
export function distance(a, b) {
  const dLa = rad(b[0] - a[0]);
  const dLo = rad(b[1] - a[1]);
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** 从 a 看向 b 的方位角，0 为正北，顺时针 */
export function bearing(a, b) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const DIRS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
export function compass(b) {
  return DIRS[Math.round(b / 45) % 8];
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.max(5, Math.round(m / 5) * 5)} 米`;
  return `${(m / 1000).toFixed(1)} 公里`;
}

/** 点是否在多边形内（射线法）。poly 是 [[lat, lon], ...] */
export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > pt[0] !== yj > pt[0] && pt[1] < ((xj - xi) * (pt[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 点到多边形边界的最短距离（米）。用局部平面近似，园区尺度下误差可忽略。 */
export function distanceToPolygon(pt, poly) {
  const kx = Math.cos(rad(pt[0])) * 111320;
  const ky = 110574;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ax = (a[1] - pt[1]) * kx, ay = (a[0] - pt[0]) * ky;
    const bx = (b[1] - pt[1]) * kx, by = (b[0] - pt[0]) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

// ── GCJ-02（国内部分浏览器/地图 SDK 返回的“火星坐标”）与 WGS-84（GPS、OpenStreetMap）互转 ──
const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;
const tLat = (x, y) => {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  r += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
  r += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
  return r;
};
const tLon = (x, y) => {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  r += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
  r += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3;
  return r;
};
export function wgs84ToGcj02([lat, lon]) {
  if (lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271) return [lat, lon]; // 境外不偏移
  let dLat = tLat(lon - 105, lat - 35);
  let dLon = tLon(lon - 105, lat - 35);
  const radLat = (lat / 180) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLon = (dLon * 180) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return [lat + dLat, lon + dLon];
}
export function gcj02ToWgs84([lat, lon]) {
  let w = [lat, lon];
  for (let i = 0; i < 6; i++) {
    const c = wgs84ToGcj02(w);
    w = [w[0] - (c[0] - lat), w[1] - (c[1] - lon)];
  }
  return w;
}

/** 点到景点的最近距离（景点可能有多个点，例如长廊） */
export function distanceToSpot(pt, spot) {
  let best = Infinity;
  for (const p of spot.at) best = Math.min(best, distance(pt, p));
  return best;
}

/**
 * 根据当前位置挑出“你正在哪个景点”。
 * - 只有进入景点半径（加上一点定位误差容忍）才算到达；
 * - 当前景点有“粘性”：除非新景点明显更近，否则不切换，避免在两个景点中间来回跳；
 * - 正在走线路时，线路里的景点优先。
 * 返回 { id, dist } 或 null。
 */
export function pickAutoSpot(loc, spots, { current = null, routeStops = null } = {}) {
  const slack = Math.min(loc.acc ?? 20, 40);
  const cands = [];
  for (const s of spots) {
    const d = distanceToSpot([loc.lat, loc.lon], s);
    const limit = s.radius + slack;
    if (d <= limit) {
      let score = d / limit;
      if (routeStops && routeStops.includes(s.id)) score *= 0.75;
      cands.push({ id: s.id, dist: d, score, limit });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.score - b.score);
  const best = cands[0];
  if (current && current !== best.id) {
    const cur = cands.find((c) => c.id === current);
    // 还在当前景点范围内，并且新景点没有明显更近（近 15 米以上）→ 留在原地
    if (cur && best.dist > cur.dist - 15) return { id: cur.id, dist: cur.dist };
  }
  return { id: best.id, dist: best.dist };
}

/** 离某点最近的入口门（用于推荐线路） */
export function nearestGate(pt, spots) {
  let best = null;
  for (const s of spots) {
    if (s.zone !== "gate") continue;
    const d = distanceToSpot(pt, s);
    if (!best || d < best.dist) best = { id: s.id, dist: d };
  }
  return best;
}
