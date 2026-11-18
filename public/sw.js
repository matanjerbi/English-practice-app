// Service worker: network-first לקבצי האפליקציה (כדי שעדכונים יגיעו מיד), עם מטמון לאופליין.
const CACHE = 'wordup-v1';
const CORE = ['/', '/index.html', '/styles.css', '/manifest.webmanifest', '/icons/icon.svg',
  '/js/app.js', '/js/store.js', '/js/api.js', '/js/ui.js', '/js/speech.js', '/js/starter.js',
  ...['home', 'words', 'review', 'practice', 'games', 'sentences', 'speak', 'chat', 'share', 'stats', 'settings', 'auth'].map(v => `/js/views/${v}.js`)];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
  );
});
