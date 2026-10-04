/* آرامِ سپیده — Service Worker */
const VERSION = "v3.3";
const CACHE = `aram-e-sepideh-${VERSION}`;

/* فایل‌های پایه + صوت‌های آفلاین (بسم‌الله، ۲۱ آیه، ۱۳ بخش دعا) */
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./data.json",
  "./audio/bismillah.mp3",
  "./audio/109-1.mp3", "./audio/109-2.mp3", "./audio/109-3.mp3",
  "./audio/109-4.mp3", "./audio/109-5.mp3", "./audio/109-6.mp3",
  "./audio/112-1.mp3", "./audio/112-2.mp3", "./audio/112-3.mp3", "./audio/112-4.mp3",
  "./audio/113-1.mp3", "./audio/113-2.mp3", "./audio/113-3.mp3",
  "./audio/113-4.mp3", "./audio/113-5.mp3",
  "./audio/114-1.mp3", "./audio/114-2.mp3", "./audio/114-3.mp3",
  "./audio/114-4.mp3", "./audio/114-5.mp3", "./audio/114-6.mp3",
  "./audio/dua-1.mp3", "./audio/dua-2.mp3", "./audio/dua-3.mp3",
  "./audio/dua-4.mp3", "./audio/dua-5.mp3", "./audio/dua-6.mp3",
  "./audio/dua-7.mp3", "./audio/dua-8.mp3", "./audio/dua-9.mp3",
  "./audio/dua-10.mp3", "./audio/dua-11.mp3", "./audio/dua-12.mp3",
  "./audio/dua-13.mp3"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* فونت‌ها و منابع بیرونی */
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  /* صوت‌ها: کش-اول، بدون تازه‌سازی */
  if (req.destination === "audio" || url.pathname.endsWith(".mp3")) {
    event.respondWith(
      caches.match(req).then(cached =>
        cached ||
        fetch(req).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
      )
    );
    return;
  }

  /* بقیه: کش-اول برای سرعت، تازه‌سازی در پس‌زمینه */
  event.respondWith(
    caches.match(req).then(cached => {
      const fresh = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});