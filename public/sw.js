const CACHE_NAME = 'radius-v2.1.0';
const STATIC_CACHE = 'radius-static-v2.1.0';

// Essential files to cache - only truly static assets that won't fail
const STATIC_FILES = [
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png'
];

// Install event - cache essential static resources only
// IMPORTANT: Do NOT pre-cache HTML pages — they reference hashed JS bundles
// that change on every deploy, so stale HTML causes blank pages.
self.addEventListener('install', (event) => {
  console.log('Service worker installing v2.1.0');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        // Cache static files only - these are stable across deploys
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('Service worker installed successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('SW install cache error (non-fatal):', error);
        // Still skip waiting even if caching fails - the SW must activate
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up ALL old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete any cache that isn't the current version
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service worker v2.1.0 activated - taking control of all clients');
      return self.clients.claim();
    })
  );
});

// Fetch event
// - Navigation requests (HTML pages): NETWORK-FIRST so fresh HTML always loads
//   the correct JS bundles after a deploy.
// - Static assets (images, manifest): CACHE-FIRST for performance.
// - Everything else (JS chunks, API calls): NETWORK-ONLY (pass through).
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip external requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Navigation requests (HTML pages) — network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the latest HTML for offline fallback
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline — try the cached version
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // Static assets — cache-first
  const isStaticAsset =
    event.request.url.includes('.png') ||
    event.request.url.includes('.jpg') ||
    event.request.url.includes('.jpeg') ||
    event.request.url.includes('.svg') ||
    event.request.url.includes('.ico') ||
    event.request.url.includes('manifest.json');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // All other requests (JS chunks, API calls, etc.) — pass through to network
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Handle background sync (if supported)
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('Background sync triggered');
    // Add background sync logic here if needed
  }
});
