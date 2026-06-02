'use client';

import { useCallback, useRef, useState } from 'react';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface PrayerAlphaIndexProps {
  /** Letters (A–Z and optionally '#') that have at least one leader. */
  availableLetters: Set<string>;
  /** Called with the letter to scroll to (always an available letter). */
  onJump: (letter: string) => void;
}

/**
 * iOS-Contacts-style A–Z rail fixed to the right edge. The whole column is the
 * hit target — vertical position maps to a letter — so tapping anywhere or
 * dragging down it scrubs through the list. Empty letters jump to the nearest
 * populated one. Supplementary to the search box, so it's hidden from a11y.
 */
export default function PrayerAlphaIndex({ availableLetters, onJump }: PrayerAlphaIndexProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const lastLetterRef = useRef<string | null>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  const letters = availableLetters.has('#') ? [...ALPHABET, '#'] : ALPHABET;

  const letterFromY = useCallback(
    (clientY: number): string | null => {
      const rail = railRef.current;
      if (!rail) return null;
      const rect = rail.getBoundingClientRect();
      const ratio = (clientY - rect.top) / rect.height;
      const idx = Math.max(0, Math.min(letters.length - 1, Math.floor(ratio * letters.length)));
      return letters[idx];
    },
    [letters]
  );

  // Resolve the nearest populated letter (scan outward from the target).
  const nearestAvailable = useCallback(
    (letter: string): string | null => {
      if (availableLetters.has(letter)) return letter;
      const idx = letters.indexOf(letter);
      for (let d = 1; d < letters.length; d++) {
        const down = letters[idx + d];
        const up = letters[idx - d];
        if (down && availableLetters.has(down)) return down;
        if (up && availableLetters.has(up)) return up;
      }
      return null;
    },
    [availableLetters, letters]
  );

  const handleY = useCallback(
    (clientY: number) => {
      const letter = letterFromY(clientY);
      if (!letter || letter === lastLetterRef.current) return;
      lastLetterRef.current = letter;
      setActiveLetter(letter);
      const target = nearestAvailable(letter);
      if (target) {
        onJump(target);
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(3);
      }
    },
    [letterFromY, nearestAvailable, onJump]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    lastLetterRef.current = null;
    handleY(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    handleY(e.clientY);
  };
  const endDrag = () => {
    draggingRef.current = false;
    lastLetterRef.current = null;
    window.setTimeout(() => setActiveLetter(null), 320);
  };

  return (
    <div
      aria-hidden="true"
      className="fixed right-0 top-1/2 z-40 -translate-y-1/2 select-none"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Active-letter bubble while scrubbing */}
      {activeLetter && (
        <div className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1a1c22]/95 text-2xl font-bold text-vc-300 shadow-2xl shadow-black/50 ring-1 ring-white/[0.08] backdrop-blur-sm">
            {activeLetter}
          </div>
        </div>
      )}

      <div
        ref={railRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex w-5 cursor-pointer touch-none flex-col items-center py-2"
      >
        {letters.map((letter) => {
          const has = availableLetters.has(letter);
          const isActive = activeLetter === letter;
          return (
            <span
              key={letter}
              className={`text-[10px] font-semibold leading-[1.18] tracking-tight transition-colors ${
                isActive
                  ? 'text-vc-300'
                  : has
                    ? 'text-slate-400'
                    : 'text-slate-700'
              }`}
            >
              {letter}
            </span>
          );
        })}
      </div>
    </div>
  );
}
