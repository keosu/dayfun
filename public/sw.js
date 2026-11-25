/* Production builds inject every local asset into this list. */
const VERSION = "little-day-v1-dev";
const PRECACHE = /* BUILD_PRECACHE */ [
  "/",
  "/index.html",
  "/apps/picker/",
  "/apps/picker/index.html",
  "/apps/kitchen/",
  "/apps/kitchen/index.html",
  "/assets/styles.css",
  "/assets/js/home.js",
  "/assets/js/picker.js",
  "/assets/js/kitchen.js",
  "/assets/js/recipes.js",
  "/assets/js/ui.js",
  "/assets/js/icons.js",
  "/assets/js/storage.js",
  "/assets/js/records.js",
  "/assets/js/pwa.js",
  "/assets/js/sync.js",
  "/assets/js/photos.js",
  "/assets/js/picker-scenes.js",
  "/manifest.webmanifest",
  "/apps/picker/manifest.webmanifest",
  "/apps/kitchen/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/images/credits.json",
  "/images/home-food.jpg",
  "/images/tomato-egg.jpg",
  "/images/kung-pao.jpg",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("little-day-v") && name !== VERSION)
          await caches.delete(name);
      await self.clients.claim();
      for (const client of await self.clients.matchAll())
        client.postMessage({ type: "OFFLINE_READY" });
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/health"
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const path = url.pathname.endsWith("/")
            ? `${url.pathname}index.html`
            : url.pathname;
          return (
            (await caches.match(path)) ||
            new Response("此页面尚未缓存，请联网访问一次。", {
              status: 503,
              headers: { "Content-Type": "text/plain;charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }
  event.respondWith(
    (async () => {
      // Vite / static hosts can send Vary: Origin. Module requests include Origin,
      // while precache requests do not; our fixed local assets are identical.
      const cached = await caches.match(request, {
        ignoreSearch: true,
        ignoreVary: true,
      });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && !url.pathname.startsWith("/@")) {
        const cache = await caches.open(VERSION);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
