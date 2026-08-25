const CACHE = 'pond-piano-shell-v46';
// Iteration 0047: the shore lap - a returning ring folds back as one quiet
// lapping answer when it reaches the near bank.
// note sinks away along the same stretched tail its sound uses.
const SHELL = [
  './',
  './index.html',
  './pond.css',
  './pond-music.js',
  './pond-gesture.js',
  './pond-score.js',
  './pond-waves.js',
  './pond-repose.js',
  './pond-caustic.js',
  './pond-tide.js',
  './pond-budget.js',
  './pond-master.js',
  './pond-a11y.js',
  './pond-audio-lifecycle.js',
  './pond.js',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
