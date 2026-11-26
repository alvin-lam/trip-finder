/*
 * Service worker: makes the app installable and usable offline.
 * Bump CACHE when shipping changes so returning visitors get fresh files.
 */
const CACHE = "wtt-v124";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/fonts.css",
  "css/styles.css",
  "privacy.html",
  "css/privacy.css",
  "js/theme-boot.js",
  "fonts/inter-v20-latin.woff2",
  "fonts/fraunces-v38-latin.woff2",
  "fonts/instrument-serif-v5-latin.woff2",
  "js/data.js",
  "js/engine.js",
  "js/app.js",
  "js/install.js",
  "img/favicon-32.png",
  "img/icon-192.png",
  "img/icon-512.png",
  "img/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Pages: try the network first so updates show up. Each page is cached under its own
  // address (/, /explore/, /place/<id>/). Offline, a page never visited opens the app home.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true }).then((hit) => hit || Response.redirect(self.registration.scope, 302))
        )
    );
    return;
  }

  // Our own files (fonts included): serve from cache, refresh in the background.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
