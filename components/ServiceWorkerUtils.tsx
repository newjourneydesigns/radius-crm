'use client';

import { useState } from 'react';

export default function ServiceWorkerUtils() {
  const [isClearing, setIsClearing] = useState(false);
  const [message, setMessage] = useState('');

  const clearCache = async () => {
    setIsClearing(true);
    setMessage('');

    try {
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }

      // Unregister service worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(registration => registration.unregister())
        );
      }

      // Clear localStorage and sessionStorage
      localStorage.clear();
      sessionStorage.clear();

      setMessage('Cache cleared successfully! The app will reload automatically.');
      
      // Auto-reload after 2 seconds
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      setMessage('Error clearing cache: ' + (error as Error).message);
    } finally {
      setIsClearing(false);
    }
  };

  const refreshApp = () => {
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
          PWA Cache Management
        </h3>
        <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
          If you're experiencing issues like "Response served by service worker has redirections" or outdated content, try clearing the cache.
        </p>
        
        <div className="bg-yellow-100 dark:bg-yellow-900/40 rounded p-3 mb-3">
          <p className="text-xs text-yellow-800 dark:text-yellow-200">
            <strong>Common Issues Fixed:</strong><br/>
            • Service worker redirect errors<br/>
            • Cached outdated content<br/>
            • PWA loading problems<br/>
            • Authentication issues after updates
          </p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={clearCache}
            disabled={isClearing}
            className="px-3 py-2 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isClearing ? 'Clearing...' : 'Clear Cache & Reload'}
          </button>
          
          <button
            onClick={refreshApp}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Refresh App
          </button>
        </div>

        {message && (
          <div className="mt-3 text-sm text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/40 rounded p-2">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
