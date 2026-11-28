/* 颐和园导览 · Service Worker（由 tools/build-sw.mjs 生成，请不要直接改 sw.js） */
const VERSION = "__VERSION__";
const PRECACHE = "spg-pre-" + VERSION;
const TILES = "spg-tiles";
const MAX_TILES = 400;
const FILES = __FILES__;

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
