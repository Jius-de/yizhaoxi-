/* Yi-朝夕刷题 V3.0 - Service Worker（离线缓存） */
const CACHE = 'yizhaoxi-v4';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/data-meta.js',
  './js/data-c.js',
  './js/data-python.js',
  './js/data-xingce.js',
  './js/data-sql.js',
  './js/data-linux.js',
  './js/data-net.js',
  './js/store.js',
  './js/sync.js',
  './js/ai.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 不缓存 API 请求，让登录/同步/AI 走网络
  if (url.pathname.startsWith('/api/')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200 && e.request.url.startsWith(self.location.origin)) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
