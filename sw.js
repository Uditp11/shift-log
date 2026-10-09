/* Offline cache. Everything is served cache-first from one versioned cache, so HTML and JS always match.
   A new version installs in the background and waits; the app shows "Reload", which posts SKIP_WAITING. */
const VERSION = '1.0.0';
const CACHE = 'shift-log-' + VERSION;
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'src/version.js',
  'src/calc.js',
  'src/format.js',
  'src/i18n.js',
  'src/backup.js',
  'src/store.js',
  'src/app.js',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'fonts/big-shoulders-display-latin-600-normal.woff2',
  'fonts/big-shoulders-display-latin-800-normal.woff2',
  'fonts/public-sans-latin-400-normal.woff2',
  'fonts/public-sans-latin-500-normal.woff2',
  'fonts/public-sans-latin-600-normal.woff2',
  'fonts/public-sans-latin-700-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2',
  'fonts/ibm-plex-mono-latin-500-normal.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shift-log-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html', { cacheName: CACHE }).then((hit) => hit || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
