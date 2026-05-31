/**
 * The single, branded full-screen loading splash for the public Circle Summary
 * section. Used by every loading boundary in the segment (the sign-in route, the
 * group entry, and the per-tab content load) so the loader never visually
 * changes mid-load — one solid green screen holds until the page is ready
 * instead of a chain of differently-styled spinners flashing in sequence.
 *
 * Intentionally has no entrance animation: the boundaries remount this same
 * markup as a load progresses (layout → page), and a re-triggered fade would
 * read as a flicker. A solid, instant green hold is the goal.
 */
export default function CircleSplash({
  subtitle = 'Loading your circle…',
}: {
  subtitle?: string;
}) {
  return (
    <div
      className="cs-splash"
      role="status"
      aria-live="polite"
      aria-label="Loading Circle Summary"
    >
      <div className="cs-splash-inner">
        <img src="/Circles Logo V2-White.png" alt="Circles" className="cs-splash-logo" />
        <p className="cs-splash-sub">{subtitle}</p>
        <div className="cs-splash-spinner" aria-hidden="true" />
      </div>
    </div>
  );
}
