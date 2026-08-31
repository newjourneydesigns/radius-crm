/**
 * Loader for the student tabs. The layout resolves the session before the
 * chrome can render, so this stands in for the whole segment — hero included —
 * and keeps the green header block on screen instead of flashing white.
 */
export default function StudentLeaderLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <header className="cs-hero px-6 pt-6 pb-8 sm:pt-14 sm:pb-10">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <div className="cs-vc-mark">VC</div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-28 rounded-full bg-white/25" />
            <div className="h-7 w-52 rounded-lg bg-white/25" />
            <div className="h-3 w-36 rounded-full bg-white/20" />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="cs-skeleton h-11 w-full rounded-full" />
      </div>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        <div className="cs-skeleton h-20 w-full rounded-2xl" />
        <div className="cs-card space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="cs-skeleton h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="cs-skeleton h-3.5 w-1/3" />
                <div className="cs-skeleton h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
