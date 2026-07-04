'use client';

// Route-segment error boundary. Any uncaught render/runtime error in a page
// lands here instead of Next's unstyled default screen. Client component by
// requirement (it receives the reset() callback).

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App route error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117] px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-gray-100 mb-2">Something went wrong</h1>
        <p className="text-gray-400 mb-6">
          This page hit an unexpected error. You can try again, or head back to your dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-800"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
