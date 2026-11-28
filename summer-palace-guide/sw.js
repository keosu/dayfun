/* 颐和园导览 · Service Worker（由 tools/build-sw.mjs 生成，请不要直接改 sw.js） */
const VERSION = "e255bc5cd9";
const PRECACHE = "spg-pre-" + VERSION;
const TILES = "spg-tiles";
const MAX_TILES = 400;
const FILES = [
  "./",
  "css/app.css",
  "data/map.json",
  "data/routes.json",
  "data/spots.json",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg",
  "img/spots/baoyun-ge-s.jpg",
  "img/spots/baoyun-ge.jpg",
  "img/spots/bei-gong-men-s.jpg",
  "img/spots/bei-gong-men.jpg",
  "img/spots/chang-lang-s.jpg",
  "img/spots/chang-lang.jpg",
  "img/spots/dehe-yuan-s.jpg",
  "img/spots/dehe-yuan.jpg",
  "img/spots/dong-gong-men-s.jpg",
  "img/spots/dong-gong-men.jpg",
  "img/spots/foxiang-ge-s.jpg",
  "img/spots/foxiang-ge.jpg",
  "img/spots/huazhong-you-s.jpg",
  "img/spots/huazhong-you.jpg",
  "img/spots/leshou-tang-s.jpg",
  "img/spots/leshou-tang.jpg",
  "img/spots/nanhu-dao-s.jpg",
  "img/spots/nanhu-dao.jpg",
  "img/spots/paiyun-dian-s.jpg",
  "img/spots/paiyun-dian.jpg",
  "img/spots/renshou-dian-s.jpg",
  "img/spots/renshou-dian.jpg",
  "img/spots/shi-fang-s.jpg",
  "img/spots/shi-fang.jpg",
  "img/spots/shiqikong-qiao-s.jpg",
  "img/spots/shiqikong-qiao.jpg",
  "img/spots/sidabuzhou-s.jpg",
  "img/spots/sidabuzhou.jpg",
  "img/spots/suzhou-jie-s.jpg",
  "img/spots/suzhou-jie.jpg",
  "img/spots/tong-niu-s.jpg",
  "img/spots/tong-niu.jpg",
  "img/spots/wenchang-ge-s.jpg",
  "img/spots/wenchang-ge.jpg",
  "img/spots/xiequ-yuan-s.jpg",
  "img/spots/xiequ-yuan.jpg",
  "img/spots/xinjian-gong-men-s.jpg",
  "img/spots/xinjian-gong-men.jpg",
  "img/spots/xiuyi-qiao-s.jpg",
  "img/spots/xiuyi-qiao.jpg",
  "img/spots/yiyun-guan-s.jpg",
  "img/spots/yiyun-guan.jpg",
  "img/spots/zhihui-hai-s.jpg",
  "img/spots/zhihui-hai.jpg",
  "index.html",
  "js/app.js",
  "js/data.js",
  "js/geo.js",
  "js/icons-init.js",
  "js/map.js",
  "js/sheet.js",
  "js/speech.js",
  "js/store.js",
  "js/ui.js",
  "manifest.webmanifest",
  "vendor/leaflet/leaflet.css",
  "vendor/leaflet/leaflet.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("spg-pre-") && key !== PRECACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

async function trimTiles() {
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // OpenStreetMap 在线图块：先用缓存，同时后台更新（看过的区域离线也能看）
  if (url.hostname === "tile.openstreetmap.org") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(TILES);
        const hit = await cache.match(req);
        const net = fetch(req)
          .then((res) => {
            if (res.ok) {
              cache.put(req, res.clone()).then(trimTiles);
            }
            return res;
          })
          .catch(() => null);
        return hit || (await net) || Response.error();
      })(),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 页面导航：离线时直接给应用壳
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PRECACHE);
        try {
          const net = await fetch(req);
          return net;
        } catch {
          return (await cache.match("index.html", { ignoreSearch: true })) || Response.error();
        }
      })(),
    );
    return;
  }

  // 其余自家资源：缓存优先（版本变了整套更新）
  event.respondWith(
    (async () => {
      const cache = await caches.open(PRECACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch {
        return Response.error();
      }
    })(),
  );
});
