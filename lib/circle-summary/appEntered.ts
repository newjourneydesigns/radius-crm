/**
 * Tracks whether the user has already "entered" the Circle Summary app shell in
 * this page session — i.e. whether real tab content (events/roster/etc.) has
 * mounted at least once.
 *
 * The group loading boundary uses this to decide which loader to show:
 *   - first entry (cold load / hard refresh) → the full branded green splash
 *   - any navigation after that → an in-place skeleton, so the header + tabs
 *     stay on screen and tab switches feel instant instead of re-flashing the
 *     splash.
 *
 * It's a module-level flag on purpose: it persists across client-side (SPA)
 * navigations but resets on a true full reload, which is exactly when a fresh
 * splash is appropriate. The flag is only ever written from a client effect, so
 * its server value stays `false` and cold SSR always renders the splash.
 */
import { useEffect } from 'react';

let entered = false;

export function hasEnteredCircleApp(): boolean {
  return entered;
}

/** Call from a tab's content component; marks the app shell as entered once it mounts. */
export function useMarkCircleAppEntered(): void {
  useEffect(() => {
    entered = true;
  }, []);
}
