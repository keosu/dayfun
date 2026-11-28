// 载入景点、线路和地图数据（都是随应用一起离线缓存的静态文件）。
export const D = {
  zones: {},
  spots: [],
  byId: new Map(),
  routes: [],
  routeById: new Map(),
  map: null,
  boundary: [],
};

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 载入失败（${res.status}）`);
  return res.json();
}

export async function loadData() {
  const [spots, routes, map] = await Promise.all([json("data/spots.json"), json("data/routes.json"), json("data/map.json")]);
  D.zones = spots.zones;
  D.spots = spots.spots;
  D.byId = new Map(D.spots.map((s) => [s.id, s]));
  D.routes = routes.routes;
  D.routeById = new Map(D.routes.map((r) => [r.id, r]));
  D.map = map;
  D.boundary = map.boundary;
  return D;
}

/** 景点有照片就用照片，没有就返回 null（界面显示 emoji 占位） */
export function thumbOf(spot) {
  return spot.thumb || null;
}
