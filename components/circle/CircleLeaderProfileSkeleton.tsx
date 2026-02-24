'use client';

/**
 * Rich loading skeleton for the Circle Leader Profile page.
 * Mirrors the actual layout: sticky nav, header, profile grid (cards + sidebar),
 * and subsequent content sections so users see structural context instantly.
 */
export default function CircleLeaderProfileSkeleton() {
  const pulse = 'animate-pulse bg-gray-200 dark:bg-gray-700 rounded';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* ── Sticky Section Navigation skeleton ── */}
      <div className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Mobile nav */}
          <nav className="flex md:hidden py-3 gap-4">
            <div className={`${pulse} h-4 w-16`} />
            <div className={`${pulse} h-4 w-20`} />
            <div className={`${pulse} h-4 w-14`} />
            <div className={`${pulse} h-4 w-12 ml-auto`} />
          </nav>
          {/* Desktop nav */}
          <nav className="hidden md:flex py-3 gap-6">
            <div className={`${pulse} h-4 w-16`} />
            <div className={`${pulse} h-4 w-12`} />
            <div className={`${pulse} h-4 w-24`} />
            <div className={`${pulse} h-4 w-20`} />
            <div className={`${pulse} h-4 w-14`} />
            <div className={`${pulse} h-4 w-14`} />
          </nav>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-pulse">
        {/* ── Header ── */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            {/* Back arrow placeholder */}
            <div className="mr-4 p-2">
              <div className="w-5 h-5 bg-gray-300 dark:bg-gray-600 rounded" />
            </div>
            <div>
              <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
              <div className="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          </div>
        </div>

        {/* ── Mobile Quick Actions skeleton (lg:hidden) ── */}
        <div className="lg:hidden mb-6 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-9 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>

        {/* ── Profile Section: 3-column grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* Circle Information card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <div className="h-5 w-36 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i}>
                      <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                      <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Additional Leader card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
                <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i}>
                      <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                      <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar (desktop only) */}
          <div className="hidden lg:block space-y-6">
            {/* Event Summary card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              </div>
            </div>

            {/* Follow-Up card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>

            {/* Quick Actions card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-9 bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
          </div>
        </div>

        {/* ── Below-fold section skeletons ── */}
        {/* Care / ACPD section */}
        <div className="mt-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          </div>
        </div>

        {/* Scorecard section */}
        <div className="mt-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="h-5 w-28 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              ))}
            </div>
          </div>
        </div>

        {/* Trends section */}
        <div className="mt-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>

        {/* Notes section */}
        <div className="mt-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
