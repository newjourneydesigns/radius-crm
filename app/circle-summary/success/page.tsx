'use client';

import { Suspense } from 'react';
import Link from 'next/link';

function SuccessInner() {
  return (
    <>
      <header className="cs-hero py-14 sm:py-20 px-6 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-white/15 flex items-center justify-center mb-5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-10 h-10 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="cs-display text-5xl sm:text-6xl text-white">Thank you</h1>
        <p className="mt-3 text-white/90 font-medium text-base sm:text-lg max-w-md mx-auto">
          Your Circle summary has been submitted.
        </p>
      </header>

      <main className="max-w-md mx-auto px-4 py-10">
        <div className="cs-card text-center">
          <Link href="/circle-summary/events" className="cs-btn cs-btn-primary w-full">
            See my Circle events
          </Link>
        </div>
      </main>
    </>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <SuccessInner />
    </Suspense>
  );
}
