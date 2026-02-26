/**
 * rememberMeStorage.ts
 *
 * A Supabase-compatible storage adapter that routes auth session tokens to
 * either localStorage (persistent, survives browser restart) or sessionStorage
 * (cleared when the browser tab/window closes) based on the user's "Remember
 * me" preference.
 *
 * Preference is stored in localStorage under REMEMBER_ME_KEY so it persists
 * across browser restarts. It defaults to `true` (remember me on).
 */

const REMEMBER_ME_KEY = 'radius_remember_me';

/** Returns `true` when "remember me" is on (default). */
export function getRememberMe(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(REMEMBER_ME_KEY) !== 'false';
}

/** Persists the "remember me" preference. */
export function setRememberMe(value: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REMEMBER_ME_KEY, String(value));
}

/**
 * When "remember me" is on  → localStorage  (survives browser restarts)
 * When "remember me" is off → sessionStorage (cleared on tab/window close)
 */
function getEngine(): Storage | null {
  if (typeof window === 'undefined') return null;
  return getRememberMe() ? window.localStorage : window.sessionStorage;
}

/**
 * Supabase-compatible storage adapter.
 * Pass this as `storage` in createClient's `auth` options.
 */
export const rememberMeStorage = {
  getItem: (key: string): string | null => {
    const engine = getEngine();
    if (!engine) return null;
    // If the user switched from sessionStorage to localStorage, check both
    const val = engine.getItem(key);
    if (val !== null) return val;
    // Fallback: check the other store in case a session exists there
    const other = engine === window.localStorage ? window.sessionStorage : window.localStorage;
    return other.getItem(key);
  },

  setItem: (key: string, value: string): void => {
    const engine = getEngine();
    if (!engine) return;
    engine.setItem(key, value);
    // Remove from the other store to avoid stale/duplicate sessions
    const other = engine === window.localStorage ? window.sessionStorage : window.localStorage;
    other.removeItem(key);
  },

  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};
