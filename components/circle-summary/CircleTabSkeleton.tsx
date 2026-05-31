/**
 * In-place content skeleton for the Circle group tabs.
 *
 * Unlike the full-screen splash, this is in-flow markup that only fills the
 * content area — the persistent header + tab bar (CircleChrome) stay on screen
 * behind it. Shown for every tab navigation *after* the user has already
 * entered the app, so switching tabs feels immediate instead of re-flashing the
 * splash.
 */
export default function CircleTabSkeleton() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Status-chip row placeholder */}
      <div className="mb-4 flex items-center gap-2">
        <div className="cs-skeleton h-6 w-24 rounded-full" />
        <div className="cs-skeleton h-6 w-28 rounded-full" />
      </div>

      <div className="space-y-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="cs-card flex items-center gap-4 p-0 overflow-hidden">
            <div className="w-14 h-16 cs-skeleton rounded-none" />
            <div className="flex-1 py-4 pr-4 space-y-2">
              <div className="cs-skeleton h-4 w-1/3" />
              <div className="cs-skeleton h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
