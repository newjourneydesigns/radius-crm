// App-icon badge sync (Badging API). Safe to call anywhere: silently no-ops
// in browsers without the API or when the app isn't installed as a PWA.
//
// The badge means "cards + follow-ups due today or overdue" — the same count
// the push-reminder cron sends with notifications, so the number a closed
// app shows and the number the open app computes never disagree.

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function isAppBadgeSupported(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
}

export function syncAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as BadgeNavigator;
  try {
    if (count > 0) nav.setAppBadge?.(count)?.catch(() => {});
    else nav.clearAppBadge?.()?.catch(() => {});
  } catch {}
}
