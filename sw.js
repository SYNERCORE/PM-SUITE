// SHIC PM Suite — Service Worker
// Offline caching of the app shell. The HTML itself is NETWORK-FIRST so
// updates are picked up on the next reload; cache is the offline fallback.
const CACHE = 'shic-v4';
const APP_SHELL = ['./promaster.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Only handle GET requests
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  // NEVER cache auth/API traffic — always go to network
  if (
    url.includes('graph.microsoft.com') ||
    url.includes('login.microsoftonline.com') ||
    url.includes('sharepoint.com') ||
    url.includes('firebase') ||
    url.includes('googleapis')
  ) {
    return; // default network behavior
  }

  const isAppShell = e.request.mode === 'navigate' || url.includes('promaster.html');

  if (isAppShell) {
    // NETWORK-FIRST for the app itself: reload = latest version.
    // no-cache forces revalidation past the browser HTTP cache.
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(e.request)) // offline → cached copy
    );
    return;
  }

  // CDN assets etc.: cache-first with background refresh
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fresh = fetch(e.request)
        .then((res) => {
          if (res && res.ok && (url.startsWith(self.location.origin) || url.includes('cdn'))) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
