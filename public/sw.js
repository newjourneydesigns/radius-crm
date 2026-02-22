const CACHE_NAME = 'radius-v2.0.0';
const STATIC_CACHE = 'radius-static-v2.0.0';

// Essential files to cache - only truly static assets that won't fail
const STATIC_FILES = [
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png'
];

// Install event - cache essential resources
// IMPORTANT: We cache static assets first (guaranteed to exist),
// then attempt page caching separately so SW install never fails
self.addEventListener('install', (event) => {
  console.log('Service worker installing v2.0.0');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        // Cache static files - these must succeed
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        // Attempt to cache pages separately - don't block install if they fail
        return caches.open(CACHE_NAME).then((cache) => {
          return Promise.allSettled([
            cache.add('/'),
            cache.add('/dashboard/')
          ]);
        });
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
      console.log('Service worker v2.0.0 activated - taking control of all clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - implement cache-first strategy for static resources
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip external requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version if available
        if (response) {
          return response;
        }

        // Otherwise fetch from network
        return fetch(event.request)
          .then((response) => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            // Cache static resources
            if (event.request.url.includes('.png') || 
                event.request.url.includes('.jpg') || 
                event.request.url.includes('.jpeg') ||
                event.request.url.includes('.svg') ||
                event.request.url.includes('.ico') ||
                event.request.url.includes('manifest.json')) {
              
              caches.open(STATIC_CACHE)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }

            return response;
          })
          .catch(() => {
            // Return offline page or fallback for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/dashboard/');
            }
          });
      })
  );
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
