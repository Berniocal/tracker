const CACHE = 'tracker-mobile-v14';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './coordinates.js',
  './segment.js',
  './point-review.js',
  './drag-fix.js',
  './navigation-acceleration.js',
  './multi-graph.js',
  './graph-interaction.js',
  './time-controls-fix.js',
  './mobile-ui.js',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});