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
  'summary',
  'label.cursor-pointer',
  'input[type="checkbox"]',
  'input[type="radio"]',
  '.btn',
].join(',');

/**
 * Mounts once app-wide. Adds a single delegated click listener that fires a
 * light haptic tick on any interactive control (buttons, nav, tabs, toggles).
 * Renders nothing.
 *
 * Opt a subtree out with `data-no-haptic`. Higher-value moments (e.g. completing
 * a checklist item) call `haptic()` directly with a stronger pattern.
 */
export default function HapticsProvider() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;

      // Ignore synthetic clicks from our own hidden iOS element (prevents a loop).
      if (target.closest('[data-haptic-el]')) return;

      const el = target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
      if (!el) return;
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return;
      if (el.closest('[data-no-haptic]')) return;

      haptic('selection');
    };

    // Capture phase so it still fires when a handler calls stopPropagation().
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
