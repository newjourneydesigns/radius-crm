'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { isTeamsToolkitHostName, teamsToolkitGroupPath } from '../../../lib/teams-toolkit/paths';

type Tab = 'roster' | 'schedule' | 'inbox';

export default function TeamTabs({
  categoryId,
  active,
}: {
  categoryId: string;
  active: Tab;
}) {
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const isDedicatedToolkitHost =
    typeof window !== 'undefined' && isTeamsToolkitHostName(window.location.hostname);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/teams-toolkit/alerts/', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(Number(data.unreadMessages || 0));
      }
    } catch {}
  }, []);

  useEffect(() => {
    refreshUnread();
    const onUpdate = () => refreshUnread();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshUnread();
    };
    window.addEventListener('teams-toolkit-inbox-updated', onUpdate);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('teams-toolkit-inbox-updated', onUpdate);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshUnread]);

  const hasUnreadMessages = unreadCount !== null && unreadCount > 0;
  const unreadLabel = unreadCount === 1 ? '1 unread message' : `${unreadCount} unread messages`;

  const liveTabs: Array<{ key: Tab; label: string; href: string }> = [
    { key: 'roster', label: 'Roster', href: teamsToolkitGroupPath(categoryId, 'roster', { cleanHost: isDedicatedToolkitHost }) },
    { key: 'schedule', label: 'Schedule', href: teamsToolkitGroupPath(categoryId, 'schedule', { cleanHost: isDedicatedToolkitHost }) },
    { key: 'inbox', label: 'Inbox', href: teamsToolkitGroupPath(categoryId, 'inbox', { cleanHost: isDedicatedToolkitHost }) },
  ];

  return (
    <div
      role="tablist"
      className="inline-flex w-full rounded-full p-1 gap-1"
      style={{
        background: 'var(--cs-bg-soft)',
        border: '1px solid var(--cs-border)',
      }}
    >
      {liveTabs.map((t) => {
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
              {t.key === 'inbox' && hasUnreadMessages && (
                <span
                  role="img"
                  aria-label={unreadLabel}
                  className="cs-tab-badge-red w-[7px] h-[7px] rounded-full shrink-0 animate-pulse"
                />
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
