/**
 * Lightweight haptic feedback for the RADIUS PWA.
 *
 * Platform support is uneven, so this degrades gracefully:
 *  - Android (Chrome/Firefox): standard Vibration API — full pattern support.
 *  - iOS Safari / installed PWA: the Vibration API is unsupported, so we fall
 *    back to the hidden "switch input" trick. Toggling an off-screen
 *    <input switch> plays the system selection haptic on iOS 17.4+. It's a
 *    single tick only, so every pattern collapses to one tap there.
 *  - Desktop / anything else: no-op.
 *
 * Respects a user preference in localStorage under `radius:haptics`
 * ('off' disables; anything else, including unset, is enabled).
 *
 * Used app-wide by `components/HapticsProvider.tsx` (global tap feedback) and
 * called directly for terminal moments that deserve a stronger pulse
 * (e.g. completing a checklist item). See [[feedback_changelog]].
 */

export type HapticPattern =
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error';

// Durations/patterns in ms. iOS ignores these (single tick only).
const VIBRATION_PATTERNS: Record<HapticPattern, number | number[]> = {
  selection: 6,
  light: 10,
  medium: 18,
  heavy: 32,
  success: [12, 40, 14],
  warning: [16, 70, 16],
  error: [22, 50, 22, 50, 22],
};

const STORAGE_KEY = 'radius:haptics';

export function isHapticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* storage unavailable — preference just won't persist */
  }
}

let cachedIsIOS: boolean | null = null;
function isIOS(): boolean {
  if (cachedIsIOS !== null) return cachedIsIOS;
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ masquerades as Mac, so check for a touch-capable "Mac" too.
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  cachedIsIOS = /iP(hone|ad|od)/.test(ua) || iPadOS;
  return cachedIsIOS;
}

// Hidden <label><input switch></label> reused for every iOS tick.
let switchLabel: HTMLLabelElement | null = null;
function ensureSwitchLabel(): HTMLLabelElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (switchLabel && document.body.contains(switchLabel)) return switchLabel;

  const label = document.createElement('label');
  label.setAttribute('data-haptic-el', '');
  label.setAttribute('aria-hidden', 'true');
  // Keep it rendered (not display:none) but fully out of view & inert.
  Object.assign(label.style, {
    position: 'fixed',
    top: '0px',
    left: '0px',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '-1',
  });

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', ''); // the magic attribute that arms the haptic
  input.setAttribute('data-haptic-el', '');
  input.tabIndex = -1;
  label.appendChild(input);

  document.body.appendChild(label);
  switchLabel = label;
  return label;
}

/**
 * Fire a haptic. Safe to call anywhere — no-ops when unsupported or disabled.
 * On iOS every pattern collapses to a single selection tick.
 */
export function haptic(pattern: HapticPattern = 'selection'): void {
  if (typeof window === 'undefined') return;
  if (!isHapticsEnabled()) return;

  const nav = typeof navigator !== 'undefined' ? navigator : undefined;

  // Standard path (Android; desktop is a harmless no-op with no vibration motor).
  if (nav && typeof nav.vibrate === 'function' && !isIOS()) {
    try {
      // A fresh call cancels any in-flight vibration, so back-to-back calls
      // (e.g. a global 'selection' tick immediately upgraded to 'success')
      // resolve to just the latest pattern.
      nav.vibrate(VIBRATION_PATTERNS[pattern]);
      return;
    } catch {
      /* fall through to the iOS path */
    }
  }

  // iOS fallback — clicking the label toggles the hidden switch, which the OS
  // answers with a selection haptic. Must run inside a user gesture; after an
  // awaited async gap iOS may suppress it (a known limitation).
  if (isIOS()) {
    ensureSwitchLabel()?.click();
  }
}
