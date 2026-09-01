// キャッシュのバージョン名
const CACHE_NAME = 'freecell-cache-v1';

// 端末内に保存するファイル一覧
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.png'
];

// 1. 初回起動時：すべてのファイルを端末に保存（キャッシュ）
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 2. 更新時：古いキャッシュを自動削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. 通信発生時：インターネットではなく、端末内のキャッシュから瞬時に読み込む
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // 端末内から返す（通信量ゼロ）
      }
      return fetch(event.request);
    })
  );
});