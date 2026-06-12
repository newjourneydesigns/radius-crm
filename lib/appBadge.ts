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

// The number the badge should show: cards + follow-ups that are still open.
// Completed items linger in the Today lists (struck-through, with Undo) rather
// than vanishing, so a finished card-due-today would keep the badge stuck
// unless we drop it here. Both signals of "done" are excluded — the persisted
// `is_complete` flag and the in-session `completed` marks — matching the
// open-items formula the push cron sends, so the closed-app and open-app
// counts always agree.
export function computeOpenBadgeCount(
  cards: { id: string; is_complete?: boolean }[],
  followUps: { id: number }[],
  completedCardIds: Set<string>,
  completedFollowUpIds: Set<number>,
): number {
  const openCards = cards.filter(c => !c.is_complete && !completedCardIds.has(c.id)).length;
  const openFollowUps = followUps.filter(f => !completedFollowUpIds.has(f.id)).length;
  return openCards + openFollowUps;
}

export function syncAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as BadgeNavigator;
  try {
    if (count > 0) nav.setAppBadge?.(count)?.catch(() => {});
    else nav.clearAppBadge?.()?.catch(() => {});
  } catch {}
}
