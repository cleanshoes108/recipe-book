// Service worker: keeps the app shell available offline. Recipes themselves live in IndexedDB.
const VERSION = 'recipes-v5';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/model.js',
  'js/images.js',
  'js/settings.js',
  'js/search.js',
  'js/ui.js',
  'js/quantities.js',
  'js/views/library.js',
  'js/views/recipe.js',
  'js/views/add.js',
  'js/views/edit.js',
  'js/views/settings.js',
  'fonts/Fraunces-Variable.woff2',
  'fonts/Fraunces-Italic-Variable.woff2',
  'fonts/InstrumentSans-Variable.woff2',
  'fonts/InstrumentSans-Italic-Variable.woff2',
  'manifest.webmanifest',
  'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Network first so updates arrive; fall back to the cache when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
