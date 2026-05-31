/**
 * In-context loading skeleton for the Circle group tabs (events, roster, inbox,
 * resources).
 *
 * This sits *inside* the [ccbGroupId] layout, so during a tab-to-tab navigation
 * the persistent header + tab bar (CircleChrome) stay on screen and only the
 * content area swaps to this skeleton. That replaces the full-page green splash
 * (app/circle-summary/loading.tsx) — which previously took over the whole screen
 * on every tab tap — with a lightweight in-place placeholder, so navigation
 * feels immediate instead of "sticky." The splash still covers the true app
 * boot / sign-in entry.
 */
export default function CircleGroupTabLoading() {
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
