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
 *
 * The Circles mark sits dead-center while concentric rings pulse outward from
 * it (the mark is itself circular, so the rings read as radiating from the
 * logo). The pulse is the only loading affordance — there is no separate
 * spinner.
 */
export default function CircleSplash({
  subtitle = 'Loading your circle…',
}: {
  subtitle?: string;
}) {
  return (
    <div
      className="cs-splash"
      // Inline the cover + green so the splash paints solid on the very first
      // frame, independent of when circle-summary.css applies. The full styling
      // (texture, layout) still comes from .cs-splash in the stylesheet.
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: '#34B233',
      }}
      role="status"
      aria-live="polite"
      aria-label="Loading Circle Summary"
    >
      <div className="cs-splash-logo-wrap">
        <span className="cs-splash-pulse" aria-hidden="true" />
        <span className="cs-splash-pulse" aria-hidden="true" />
        <span className="cs-splash-pulse" aria-hidden="true" />
        <img src="/Circles Logo V2-White.png" alt="Circles" className="cs-splash-logo" />
      </div>
      <p className="cs-splash-sub">{subtitle}</p>
    </div>
  );
}
