const CACHE_NAME = 'kafer-app-v3-cache';
const urlsToCache = [
  '/',
  '/index.html',
  '/menu.html',
  '/admin.html',
  '/admin-members.html',
  '/admin-money.html',
  '/admin-settings.html',
  '/style.css',
  '/global.js',
  '/icon.png',
  '/icon-512.png',
  '/manifest.webmanifest',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://unpkg.com/qrious@4.0.2/dist/qrious.js',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=Roboto:wght@400;700&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (!requestUrl.protocol.startsWith('http')) {
    return;
  }

  if (requestUrl.origin.includes('opensheet.elk.sh') || requestUrl.origin.includes('docs.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            return response;
          })
          .catch(() => {
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
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        return self.clients.claim();
    })
  );
});