const CACHE_NAME = 'radius-v1.0.1-fixed';

// Simplified service worker that doesn't interfere with navigation
// Install event - skip caching for now
self.addEventListener('install', (event) => {
  console.log('Service worker installing - skipping cache for navigation fix');
  self.skipWaiting();
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('Service worker activated - all caches cleared');
      return self.clients.claim();
    })
  );
});

// Fetch event - pass through all requests without caching
self.addEventListener('fetch', (event) => {
  // Simply pass through all requests to avoid redirect issues
  return;
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
