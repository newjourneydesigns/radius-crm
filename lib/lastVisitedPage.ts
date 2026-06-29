// Remembers the last in-app page the user was on so the installed PWA can
// reopen to it instead of always dropping the user on the default dashboard.
//
// We only ever store/restore "real" app routes — never the redirecting root,
// the auth/login flow, or the public toolkit/intake surfaces. Those exclusion
// rules mirror the public-route checks in app/ClientLayout.tsx.

const STORAGE_KEY = 'radius:last-visited-page';

function normalize(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

// A path is restorable if it's a protected app route worth returning to.
function isRestorablePath(path: string | null | undefined): path is string {
  if (!path || !path.startsWith('/')) return false;
  const p = normalize(path);

  if (p === '/') return false;
  if (p === '/login') return false;
  if (p.startsWith('/auth')) return false;
  if (p.startsWith('/circle-leader-toolkit')) return false;
  if (p.startsWith('/teams-toolkit')) return false;
  if (p === '/f' || p.startsWith('/f/')) return false;
  // Clean toolkit-host routes (numeric id + a known section).
  if (/^\/\d+\/(events|roster|inbox|schedule|people|resources|health|settings|help)(\/|$)/.test(p)) {
    return false;
  }

  return true;
}

export function saveLastVisitedPage(path: string): void {
  if (typeof window === 'undefined') return;
  if (!isRestorablePath(path)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, path);
  } catch {
    // localStorage can throw in private mode / when full — ignore.
  }
}

export function getLastVisitedPage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isRestorablePath(stored) ? stored : null;
  } catch {
    return null;
  }
}

// True when running as an installed PWA (standalone / fullscreen display mode,
// or iOS Safari's legacy navigator.standalone flag).
export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneDisplay =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches);
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return Boolean(standaloneDisplay || iosStandalone);
}
