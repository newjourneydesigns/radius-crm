/**
 * Full-page green splash shown while the /circle-summary segment resolves —
 * covers both the initial sign-in route's server redirect and any nested
 * route transitions inside the segment.
 */
export default function CircleSummaryLoading() {
  return (
    <div
      className="cs-splash"
      role="status"
      aria-live="polite"
      aria-label="Loading Circle Summary"
    >
      <div className="cs-splash-inner">
        <div className="cs-vc-mark cs-splash-mark">VC</div>
        <h1 className="cs-display cs-splash-title">Circle Summary</h1>
        <p className="cs-splash-sub">Loading your circle…</p>
        <div className="cs-splash-spinner" aria-hidden="true" />
      </div>
    </div>
  );
}
