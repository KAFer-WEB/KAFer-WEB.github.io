const CACHE_NAME = 'kafer-v3-cache'; // キャッシュ名。更新したら変更してください
const urlsToCache = [
  '/',
  '/index.html',
  '/menu.html',
  '/admin.html',
  '/style.css',
  '/global.js',
  '/crypto.js',
  '/icon.png',
  '/icon-dark.png', // ファビコンが動的に切り替わる場合
  '/manifest.webmanifest',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css', // 外部CSS
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js', // 外部JS
  'https://unpkg.com/qrious@4.0.2/dist/qrious.js', // 外部JS
  // Google Fonts の CSS もキャッシュ対象に含める場合 (style.css 内で @import されているもの)
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=Roboto:wght@400;700&display=swap',
  // Google Fonts のフォントファイル自体もキャッシュする方が望ましいが、複雑になるためここではURLのみ
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュがあればそれを返す
        if (response) {
          return response;
        }
        // キャッシュになければネットワークから取得
        return fetch(event.request)
          .then((response) => {
            // ネットワークエラーの場合
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // レスポンスをキャッシュに保存 (ただし、キャッシュしないURLは除く)
            if (shouldCache(event.request.url)) {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
            }
            return response;
          })
          .catch(() => {
            // ネットワークもキャッシュも失敗した場合のフォールバック
            // 例えば、オフライン用のページを返すなど
            // 現状では、単にエラーを無視する
            return new Response('<h1>Offline</h1><p>You are offline. Please check your internet connection.</p>', {
                headers: { 'Content-Type': 'text/html' }
            });
          });
      })
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName); // 古いキャッシュを削除
          }
        })
      );
    })
  );
});

// キャッシュすべきかどうかの判断ロジック（例：GoogleフォームへのPOSTはキャッシュしない）
function shouldCache(url) {
    // GoogleフォームへのPOSTリクエストはキャッシュしない
    if (url.includes('docs.google.com/forms/') && url.includes('/formResponse')) {
        return false;
    }
    // Opensheet APIへのリクエストはキャッシュしない（常に最新データを取得するため）
    if (url.includes('opensheet.elk.sh/')) {
        return false;
    }
    // その他のキャッシュしたくないURLがあれば追加
    // 例: QRコードスキャンライブラリが内部で利用するカメラのストリームなど
    // if (url.includes('some-api-endpoint')) { return false; }
    return true; // デフォルトはキャッシュする
}