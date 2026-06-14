'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Shrinks a single-line text element so it always fits the width of its
 * container. The element keeps whatever responsive font size CSS gives it
 * (e.g. a `clamp()`); this only kicks in to scale *down* when that ideal size
 * would still overflow — so a short name renders at full size and a long one
 * shrinks just enough to fit on one line.
 *
 * Returns a ref for the measuring container and a ref for the text element.
 */
export function useFitText<
  C extends HTMLElement = HTMLElement,
  T extends HTMLElement = HTMLElement,
>({ minFontSize = 14, deps = [] as unknown[] }: { minFontSize?: number; deps?: unknown[] } = {}) {
  const containerRef = useRef<C | null>(null);
  const textRef = useRef<T | null>(null);

  const fit = useCallback(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    // Clear any size we set previously so CSS gives us the ideal (responsive)
    // size to measure against.
    text.style.fontSize = '';
    const available = container.clientWidth;
    if (available <= 0) return;

    const needed = text.scrollWidth;
    if (needed <= available) return; // fits at the ideal size — leave CSS alone

    const ideal = parseFloat(window.getComputedStyle(text).fontSize) || 0;
    if (!ideal) return;

    // Scale down by the overflow ratio, with a hair of slack for sub-pixel
    // rounding, but never below the readable floor.
    const scaled = Math.max(minFontSize, Math.floor((available / needed) * ideal) - 1);
    text.style.fontSize = `${scaled}px`;
  }, [minFontSize]);

  useLayoutEffect(() => {
    fit();

    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => fit());
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, ...deps]);

  return { containerRef, textRef };
}
