/**
 * Service worker — basic offline caching + Periodic Background Sync stub.
 * Caches the app shell so the PWA opens offline.
 */
const CACHE = 'tja-v2';
const APP_SHELL = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Don't cache API calls — always hit network for fresh data
  if (event.request.url.includes('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('/'))),
  );
});

// Periodic Background Sync (Chrome Android only — min 12h interval)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'tja-sync') {
    event.waitUntil(
      self.clients.matchAll().then((clients) =>
        clients.forEach((c) => c.postMessage({ type: 'periodic-sync' })),
      ),
    );
  }
});
