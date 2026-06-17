'use client';

import { useEffect, useState } from 'react';
import CircleSplash from './CircleSplash';

/**
 * Holds the branded green CircleSplash on screen for a purposeful beat on a
 * fresh launch, then fades to reveal the page — so the splash reads as an
 * intentional welcome instead of flashing past in a single frame.
 *
 * Why a gate on top of loading.tsx: the segment's loading.tsx splash is a
 * Suspense fallback that vanishes the instant the route resolves, which on a
 * warm/cached load is a flicker. This overlay enforces a minimum visible time
 * independent of how fast the page is ready. It paints in the very first frame
 * (SSR + pre-hydration) so it seamlessly takes over from the native iOS launch
 * image with no white gap, and sits above loading.tsx's own .cs-splash so the
 * two identical green screens never seam.
 *
 * It runs once per launch (sessionStorage) — client-side tab navigation keeps
 * the persisted layout, so the splash never replays mid-session, and an
 * in-session reload skips the hold too.
 */
const MIN_VISIBLE_MS = 1600; // ~ two pulse rings — purposeful, not slow
const FADE_MS = 450;
const SESSION_KEY = 'cs-splash-shown';

export default function ToolkitSplashGate() {
  // Start visible so the splash is in the first paint, covering the launch with
  // no flash of page content behind it.
  const [phase, setPhase] = useState<'visible' | 'leaving' | 'gone'>('visible');

  useEffect(() => {
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(SESSION_KEY) === '1';
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // sessionStorage can throw in private-mode edge cases — just show once.
    }

    // Not a fresh launch (e.g. an in-session reload) — don't replay the hold.
    if (alreadyShown) {
      setPhase('gone');
      return;
    }

    const hold = setTimeout(() => setPhase('leaving'), MIN_VISIBLE_MS);
    return () => clearTimeout(hold);
  }, []);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const fade = setTimeout(() => setPhase('gone'), FADE_MS);
    return () => clearTimeout(fade);
  }, [phase]);

  if (phase === 'gone') return null;

  return (
    <div
      className={`cs-splash-gate${phase === 'leaving' ? ' cs-splash-gate--leaving' : ''}`}
      aria-hidden={phase === 'leaving'}
    >
      <CircleSplash />
    </div>
  );
}
