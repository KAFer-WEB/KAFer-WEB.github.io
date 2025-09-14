// A new cache name is defined to ensure the service worker updates on the client's browser.
const CACHE_NAME = 'kafer-app-v4-cache';

// The list of files to cache has been updated to reflect the new project structure.
const urlsToCache = [
  // Root and HTML files
  '/',
  '/index.html',
  '/app/menu.html',
  '/app/meet.html',
  '/admin/dashboard.html',
  '/admin/members.html',
  '/admin/money.html',
  '/admin/settings.html',
  
  // CSS files
  '/assets/css/global.css',
  '/assets/css/auth.css',
  '/assets/css/app.css',
  '/assets/css/admin.css',

  // JavaScript files
  '/assets/js/global.js',
  '/assets/js/index.js',
  '/assets/js/app/menu.js',
  '/assets/js/admin/dashboard.js',
  '/assets/js/admin/members.js',
  '/assets/js/admin/money.js',
  '/assets/js/admin/settings.js',
  
  // Icons and Manifest
  '/assets/icons/icon.png',
  '/assets/icons/icon-512.png',
  '/manifest.webmanifest',
  
  // External CDN assets
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://unpkg.com/qrious@4.0.2/dist/qrious.js',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=Roboto:wght@400;700&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache and caching files');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Do not cache non-http requests, e.g., chrome-extension://
  if (!requestUrl.protocol.startsWith('http')) {
    return;
  }

  // For API requests, always go to the network.
  if (requestUrl.origin.includes('opensheet.elk.sh') || requestUrl.origin.includes('docs.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For all other requests, use a cache-first strategy.
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // If the request is in the cache, return it.
        if (response) {
          return response;
        }
        
        // Otherwise, fetch it from the network.
        return fetch(event.request)
          .then((response) => {
            // If the fetch was successful, clone the response and cache it.
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
            // Fallback for offline, could return a specific offline page here if needed.
            console.log('Fetch failed; user is likely offline.');
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
          // Delete old caches that are not in the whitelist.
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        // Take control of the page immediately.
        return self.clients.claim();
    })
  );
});