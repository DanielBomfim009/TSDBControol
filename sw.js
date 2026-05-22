const CACHE_NAME = "tsdb-premium-v26";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles.css?v=20260522-offline-v1",
  "./app.js",
  "./app.js?v=20260522-offline-v1",
  "./assets/offline-icons.css",
  "./assets/offline-icons.css?v=20260522-offline-v1",
  "./manifest.webmanifest",
  "./assets/tsdb-mark.svg",
  "./assets/tsdb-logo.svg",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg"
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_ASSETS.map((asset) => new Request(asset, { cache: "reload" })));
}

async function putInCache(request, response) {
  if (!response || response.status !== 200 || response.type === "opaque") {
    return;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function fromCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  await putInCache(request, response);
  return response;
}

async function appShellFallback() {
  return (
    (await caches.match("./index.html")) ||
    (await caches.match("./")) ||
    new Response("<!doctype html><title>TSDB Offline</title><p>TSDB offline indisponivel. Abra o app uma vez com internet para instalar o cache local.</p>", {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    event.respondWith(caches.match(request).then((cached) => cached || Response.error()));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fromCacheFirst("./index.html").catch(appShellFallback));
    return;
  }

  event.respondWith(fromCacheFirst(request).catch(appShellFallback));
});
