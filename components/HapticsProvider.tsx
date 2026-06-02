'use client';

import { useEffect } from 'react';
import { haptic } from '../lib/haptics';

// Elements that should produce a subtle tick when activated. Kept deliberately
// to genuine "controls" — typing in a text field or selecting text shouldn't buzz.
const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="link"]',
  'summary',
  'label.cursor-pointer',
  'input[type="checkbox"]',
  'input[type="radio"]',
  '.btn',
  '[class*="cursor-pointer"]', // catches all Tailwind-styled clickable divs, cards, rows
].join(',');

// Text-entry elements that should never trigger a buzz.
const TEXT_INPUT_SELECTOR = 'input[type="text"], input[type="email"], input[type="password"], input[type="search"], input[type="number"], input[type="tel"], input[type="url"], textarea, select, [contenteditable]';

/**
 * Mounts once app-wide. Fires a light haptic tick on any interactive control.
 * Uses pointerdown for immediate native-feel feedback on touch (fires on
 * finger-down, not finger-up like click).
 *
 * Opt a subtree out with `data-no-haptic`. Higher-value moments (e.g. completing
 * a checklist item) call `haptic()` directly with a stronger pattern.
 */
export default function HapticsProvider() {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      // Only the primary pointer (ignore multi-touch secondary fingers).
      if (!e.isPrimary) return;

      const target = e.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;

      // Ignore synthetic events from our own hidden iOS element.
      if (target.closest('[data-haptic-el]')) return;

      // Never buzz while the user is typing.
      if (target.closest(TEXT_INPUT_SELECTOR)) return;

      const el = target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
      if (!el) return;
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return;
      if (el.closest('[data-no-haptic]')) return;

      haptic('selection');
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  return null;
}
