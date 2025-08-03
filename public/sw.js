const CACHE_NAME = 'radius-v1.0.0';
const urlsToCache = [
  '/',
  '/dashboard',
  '/add-leader',
  '/users',
  '/settings',
  '/login',
  '/api/ccb/event-notes',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/manifest.json'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Force the waiting service worker to become the active service worker
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete ALL old caches, not just different versions
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately and force reload
      console.log('New service worker taking control');
      return self.clients.claim().then(() => {
        // Force reload all clients
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'FORCE_RELOAD' });
          });
        });
      });
    })
  );
});

// Fetch event - improved caching strategy
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // If we have a cached response, return it
        if (cachedResponse) {
          // But also fetch from network to update cache in background
          fetch(event.request, { redirect: 'follow' })
            .then((response) => {
              // Only cache successful, non-redirect responses
              if (response.status === 200 && response.type === 'basic' && !response.redirected) {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => {
                    cache.put(event.request, responseToCache);
                  });
              }
            })
            .catch((error) => {
              console.log('Background fetch failed:', error);
              // Network failed, but we have cache
            });
          
          return cachedResponse;
        }

        // No cached response, fetch from network with explicit redirect handling
        return fetch(event.request, { redirect: 'follow' })
          .then((response) => {
            // Don't cache redirects, errors, or opaque responses
            if (response.status !== 200 || response.type !== 'basic' || response.redirected) {
              console.log('Not caching response:', {
                status: response.status,
                type: response.type,
                redirected: response.redirected,
                url: event.request.url
              });
              return response;
            }

            // Clone the response for caching
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch((error) => {
            console.log('Fetch failed:', error, 'for URL:', event.request.url);
            // Network failed and no cache available
            // Return a generic offline page for document requests
            if (event.request.destination === 'document') {
              return new Response(
                '<!DOCTYPE html><html><head><title>Offline - RADIUS</title></head><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;"><h1>You\'re Offline</h1><p>Please check your internet connection and try again.</p><button onclick="window.location.reload()">Retry</button></body></html>',
                { 
                  headers: { 'Content-Type': 'text/html' },
                  status: 200,
                  statusText: 'OK'
                }
              );
            }
            
            // For other resources, return a network error
            return new Response('Network Error', {
              status: 408,
              statusText: 'Request Timeout'
            });
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
