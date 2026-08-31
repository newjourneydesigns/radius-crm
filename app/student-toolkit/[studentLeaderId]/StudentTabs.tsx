'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { setCircleSummaryAppBadge } from '../../../lib/circle-leader-toolkit/badging';
import { isStudentToolkitHostName, studentToolkitLeaderPath } from '../../../lib/student-toolkit/paths';

export type StudentTab = 'home' | 'roster' | 'resources' | 'inbox';

const TABS: Array<{ key: StudentTab; label: string }> = [
  { key: 'home', label: 'Home' },
  { key: 'roster', label: 'Roster' },
  { key: 'resources', label: 'Resources' },
  { key: 'inbox', label: 'Inbox' },
];

// Foregrounding a PWA fires visibilitychange every single time, so the poll
// needs a floor. Explicit update events (a message was read, a setting changed)
// bypass it.
const ALERTS_THROTTLE_MS = 15_000;

/**
 * The four student tabs, plus the unread dot on Inbox.
 *
 * Deliberately thinner than the Circle Leader Toolkit's tab bar: student leaders
 * submit no event summaries, so there's one count to fetch instead of two, and
 * no Resources dropdown.
 */
export default function StudentTabs({
  leaderId,
  active,
}: {
  leaderId: string;
  /** Null on routes that hang off a tab (settings) rather than being one. */
  active: StudentTab | null;
}) {
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const inFlight = useRef(false);
  const lastFetchedAt = useRef(0);
  // The badge preference only changes on the settings page, which fires an
  // explicit update event — so it's read once and reused instead of riding
  // along on every poll.
  const badgeEnabled = useRef<boolean | null>(null);

  const cleanHost =
    typeof window !== 'undefined' && isStudentToolkitHostName(window.location.hostname);

  const refreshAlerts = useCallback(async (opts: { force?: boolean } = {}) => {
    if (inFlight.current) return;
    if (!opts.force && Date.now() - lastFetchedAt.current < ALERTS_THROTTLE_MS) return;
    inFlight.current = true;
    // Stamped on attempt, not on success, so a failing endpoint gets the same
    // backoff instead of being retried on every app switch.
    lastFetchedAt.current = Date.now();
    try {
      const needsPrefs = opts.force || badgeEnabled.current === null;
      const [alertsRes, prefsRes] = await Promise.all([
        fetch('/api/student-toolkit/alerts/', { cache: 'no-store' }),
        needsPrefs
          ? fetch('/api/student-toolkit/notifications/', { cache: 'no-store' }).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!alertsRes.ok) return;

      const alerts = await alertsRes.json();
      const unread = Number(alerts.unreadMessages || 0);
      setUnreadCount(unread);

      if (prefsRes?.ok) {
        const prefs = await prefsRes.json();
        badgeEnabled.current = prefs.preferences?.badge_count_enabled !== false;
      }
      await setCircleSummaryAppBadge(
        Number(alerts.totalAlertCount ?? unread),
        badgeEnabled.current !== false
      );
    } catch {
      // A tab dot isn't worth surfacing an error for.
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refreshAlerts({ force: true });
    const onUpdate = () => refreshAlerts({ force: true });
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshAlerts();
    };
    window.addEventListener('student-toolkit-alerts-updated', onUpdate);
    window.addEventListener('student-toolkit-inbox-updated', onUpdate);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('student-toolkit-alerts-updated', onUpdate);
      window.removeEventListener('student-toolkit-inbox-updated', onUpdate);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshAlerts]);

  const hasUnread = unreadCount !== null && unreadCount > 0;
  const unreadLabel = unreadCount === 1 ? '1 unread message' : `${unreadCount} unread messages`;

  return (
    <div
      role="tablist"
      className="inline-flex w-full rounded-full p-1 gap-1"
      style={{ background: 'var(--cs-bg-soft)', border: '1px solid var(--cs-border)' }}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            href={`${studentToolkitLeaderPath(leaderId, tab.key, { cleanHost })}/`}
            className={
              'flex-1 text-center text-xs sm:text-sm font-semibold py-2.5 rounded-full transition-all ' +
              (isActive ? 'shadow-sm cs-tab-active' : 'cs-tab-inactive')
            }
          >
            <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
              {tab.label}
              {tab.key === 'inbox' && hasUnread && (
                <span
                  role="img"
                  aria-label={unreadLabel}
                  className="cs-tab-badge-red h-[7px] w-[7px] shrink-0 animate-pulse rounded-full"
                />
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
