/* Production builds inject every built file into this list. Paths are relative to this
   worker, so the app works at a domain root or in a subdirectory such as GitHub Pages. */
const VERSION = "little-day-v2-dev";
const PRECACHE = /* BUILD_PRECACHE */ ["./", "manifest.webmanifest"];
const SHELL = new URL("./", self.location).href;
const SCOPE = new URL("./", self.location).pathname;

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
// Tapping a reminder brings the app to the front, on the page that sent it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", SHELL).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (!client.url.startsWith(SHELL)) continue;
        await client.focus();
        client.postMessage({ type: "OPEN", url: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // senselab（体感实验室）是同一站点下的另一个应用，有自己的资源，不交给这里的应用壳处理
  if (url.pathname.startsWith(`${SCOPE}senselab/`)) return;
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(SCOPE)
  )
    return;
  // Single-page app: every navigation is the same shell. Serve it from cache for an instant
  // start and refresh the cached copy in the background.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        const cached = await cache.match(SHELL);
        const network = fetch(request)
          .then((response) => {
            if (response.ok && url.pathname === SCOPE)
              cache.put(SHELL, response.clone());
            return response;
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        return (
          (await network) ||
          new Response("此页面尚未缓存，请联网访问一次。", {
            status: 503,
            headers: { "Content-Type": "text/plain;charset=utf-8" },
          })
        );
      })(),
    );
    return;
  }
  event.respondWith(
    (async () => {
      // Static hosts can send Vary: Origin. Module requests include Origin, while
      // precache requests do not; our fixed local assets are identical.
      const cached = await caches.match(request, {
        ignoreSearch: true,
        ignoreVary: true,
      });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && !url.pathname.includes("/@")) {
        const cache = await caches.open(VERSION);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
