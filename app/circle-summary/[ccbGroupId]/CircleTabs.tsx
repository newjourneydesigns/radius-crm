'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { setCircleSummaryAppBadge } from '../../../lib/circle-summary/badging';

type Tab = 'events' | 'roster' | 'inbox' | 'resources' | 'settings';

export default function CircleTabs({
  urlGroupId,
  active,
}: {
  urlGroupId: string;
  active: Tab;
}) {
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [pendingSummaryCount, setPendingSummaryCount] = useState<number | null>(null);
  const [totalAlertCount, setTotalAlertCount] = useState<number | null>(null);

  const refreshUnread = useCallback(async () => {
    try {
      const [inboxRes, alertsRes, settingsRes] = await Promise.all([
        fetch('/api/circle-summary/inbox/', { cache: 'no-store' }),
        fetch('/api/circle-summary/alerts/', { cache: 'no-store' }),
        fetch('/api/circle-summary/notifications/', { cache: 'no-store' }).catch(() => null),
      ]);
      if (inboxRes.ok) {
        const data = await inboxRes.json();
        setUnreadCount(Number(data.unreadCount || 0));
      }
      if (alertsRes.ok) {
        const alerts = await alertsRes.json();
        setUnreadCount(Number(alerts.unreadMessages || 0));
        setPendingSummaryCount(Number(alerts.pendingEventSummaries || 0));
        setTotalAlertCount(Number(alerts.totalAlertCount || 0));
        let badgeEnabled = true;
        if (settingsRes?.ok) {
          const settings = await settingsRes.json();
          badgeEnabled = settings.preferences?.badge_count_enabled !== false;
        }
        await setCircleSummaryAppBadge(Number(alerts.totalAlertCount || 0), badgeEnabled);
      }
    } catch {}
  }, []);

  useEffect(() => {
    refreshUnread();
    const onUpdate = () => refreshUnread();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshUnread();
    };
    window.addEventListener('circle-summary-inbox-updated', onUpdate);
    window.addEventListener('circle-summary-alerts-updated', onUpdate);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('circle-summary-inbox-updated', onUpdate);
      window.removeEventListener('circle-summary-alerts-updated', onUpdate);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshUnread]);

  const tabs: Array<{ key: Tab; label: string; href: string }> = [
    { key: 'events', label: 'Events', href: `/circle-summary/${urlGroupId}/events` },
    { key: 'roster', label: 'Roster', href: `/circle-summary/${urlGroupId}/roster` },
    { key: 'resources', label: 'Resources', href: `/circle-summary/${urlGroupId}/resources` },
    { key: 'inbox', label: 'Inbox', href: `/circle-summary/${urlGroupId}/inbox` },
  ];
  const hasUnreadMessages = unreadCount !== null && unreadCount > 0;
  const hasPendingSummaries = pendingSummaryCount !== null && pendingSummaryCount > 0;
  const hasAlerts = totalAlertCount !== null && totalAlertCount > 0;
  const unreadLabel = unreadCount === 1 ? '1 unread message' : `${unreadCount} unread messages`;
  const summaryLabel = pendingSummaryCount === 1 ? '1 summary needed' : `${pendingSummaryCount || 0} summaries needed`;

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        className="inline-flex w-full rounded-full p-1 gap-1"
        style={{
          background: 'var(--cs-bg-soft)',
          border: '1px solid var(--cs-border)',
        }}
      >
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              role="tab"
              aria-selected={isActive}
              href={t.href}
              className={
                'flex-1 text-center text-xs sm:text-sm font-semibold py-2.5 rounded-full transition-all ' +
                (isActive ? 'shadow-sm cs-tab-active' : 'cs-tab-inactive')
              }
            >
              <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                {t.label}
                {t.key === 'events' && hasPendingSummaries && (
                  <span
                    aria-label={summaryLabel}
                    className="inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-bold leading-none bg-amber-500 text-white ring-2 ring-white shadow-sm"
                  >
                    {pendingSummaryCount}
                  </span>
                )}
                {t.key === 'inbox' && hasUnreadMessages && (
                  <span
                    aria-label={unreadLabel}
                    className="inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-bold leading-none bg-red-600 text-white ring-2 ring-white shadow-sm animate-pulse"
                  >
                    {unreadCount}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>

      {hasAlerts && (hasUnreadMessages ? active !== 'inbox' : active !== 'events') && (
        <Link
          href={hasUnreadMessages ? `/circle-summary/${urlGroupId}/inbox` : `/circle-summary/${urlGroupId}/events`}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-neutral-900 shadow-lg ring-2 ring-red-400"
        >
          <span className="flex items-start gap-3 min-w-0">
            <span className="relative mt-1 flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-extrabold tracking-tight">
                You have {totalAlertCount} alert{totalAlertCount === 1 ? '' : 's'}
              </span>
              <span className="block text-xs text-neutral-600 mt-0.5">
                {hasUnreadMessages ? unreadLabel : ''}{hasUnreadMessages && hasPendingSummaries ? ' · ' : ''}{hasPendingSummaries ? summaryLabel : ''}
              </span>
            </span>
          </span>
          <span className="cs-inbox-banner-cta shrink-0 rounded-full bg-[#34B233] px-4 py-2 text-xs font-extrabold text-center shadow-sm">
            {hasUnreadMessages ? 'Open Inbox' : 'Open Events'}
          </span>
        </Link>
      )}
    </div>
  );
}
