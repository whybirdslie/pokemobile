const CACHE = "emerald-v6"
const FILES = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/data/loader.js",
  "/data/emulator.min.js",
  "/data/emulator.min.css",
  "/data/version.json",
  "/data/compression/extract7z.js",
  "/data/cores/mgba-wasm.data",
  "/data/cores/mgba-legacy-wasm.data",
  "/data/cores/reports/mgba.json",
  "/patch/emeraldpp-de-names.ups",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.all(
        FILES.map(async (url) => {
          const res = await fetch(url)
          if (res.ok) await cache.put(url, res)
        }),
      )
    }),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith("/data/") || url.pathname.startsWith("/patch/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)))
    return
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
})
