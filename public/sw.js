const CACHE_NAME = 'radius-v1.1.1';
const urlsToCache = [
  '/',
  '/dashboard',
  '/add-leader',
  '/users',
  '/settings',
  '/login',
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
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - improved caching strategy with better error handling
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip requests that might involve authentication, redirects, or dynamic content
  const url = new URL(event.request.url);
  if (url.pathname.includes('/api/') || 
      url.pathname.includes('/auth/') || 
      url.pathname.includes('/login') ||
      url.pathname.includes('/logout') ||
      url.pathname.includes('/_next/') ||
      url.search.includes('vscodeBrowserReqId') ||
      event.request.headers.get('accept')?.includes('text/event-stream')) {
    // Let these requests pass through without service worker intervention
    return fetch(event.request, { redirect: 'follow' });
  }

  event.respondWith(
    // First try to fetch from network, then fall back to cache
    fetch(event.request, { 
      redirect: 'follow',
      credentials: 'same-origin'
    })
      .then((response) => {
        // Check if it's a valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response for caching
        const responseToCache = response.clone();
        
        // Cache the response (don't wait for it)
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          })
          .catch(() => {
            // Ignore cache errors
          });

        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // No cache available, return offline page for documents
            if (event.request.destination === 'document') {
              return new Response(
                '<!DOCTYPE html><html><body><h1>Offline</h1><p>Please check your connection and try again.</p></body></html>',
                { headers: { 'Content-Type': 'text/html' } }
              );
            }
            
            // For other resources, let the error propagate
            throw new Error('No cache available');
          });
      })
  );
});
