'use client';

import { useEffect, useState } from 'react';

/**
 * Non-blocking "a new version is ready" prompt.
 *
 * The service worker registration script in app/layout.tsx used to call
 * window.location.reload() the instant a new worker installed — which threw
 * away whatever the user was typing (a note, a summary, a bulk message) on
 * every deploy. Instead that script now sets window.__radiusUpdateAvailable
 * and dispatches a "radiusUpdateAvailable" event; we surface a dismissible
 * banner and let the user choose when to refresh. The new worker has already
 * activated (the SW calls skipWaiting), so a reload is all that's needed to
 * pick up the new bundles.
 */
export default function UpdateToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // The event may have fired before this component mounted.
    if ((window as unknown as { __radiusUpdateAvailable?: boolean }).__radiusUpdateAvailable) {
      setVisible(true);
    }

    const onUpdate = () => setVisible(true);
    window.addEventListener('radiusUpdateAvailable', onUpdate);
    return () => window.removeEventListener('radiusUpdateAvailable', onUpdate);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[9999] flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 shadow-lg">
        <span className="flex-1 text-sm text-gray-100">A new version of Radius is ready.</span>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:text-gray-200"
        >
          Later
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
