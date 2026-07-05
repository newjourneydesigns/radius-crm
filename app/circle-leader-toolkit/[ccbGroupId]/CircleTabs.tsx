'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { setCircleSummaryAppBadge } from '../../../lib/circle-leader-toolkit/badging';
import { isToolkitHostName, toolkitGroupPath } from '../../../lib/circle-leader-toolkit/paths';

type Tab = 'events' | 'roster' | 'inbox' | 'resources' | 'health' | 'settings';

type ResourcePageLink = { id: string; slug: string; title: string };

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
  const [resourcePages, setResourcePages] = useState<ResourcePageLink[]>([]);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const resourcesMenuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname() ?? '';
  const isDedicatedToolkitHost =
    typeof window !== 'undefined' && isToolkitHostName(window.location.hostname);

  const refreshUnread = useCallback(async () => {
    try {
      const [inboxRes, alertsRes, settingsRes] = await Promise.all([
        fetch('/api/circle-leader-toolkit/inbox/', { cache: 'no-store' }),
        fetch('/api/circle-leader-toolkit/alerts/', { cache: 'no-store' }),
        fetch('/api/circle-leader-toolkit/notifications/', { cache: 'no-store' }).catch(() => null),
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

  // Resource page titles power the dropdown under the Resources tab. Bodies
  // aren't needed here, so the list-only endpoint keeps this fetch tiny.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/circle-leader-toolkit/leader-resources/?list=1');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.pages)) setResourcePages(data.pages);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Close the Resources dropdown on outside tap / Escape.
  useEffect(() => {
    if (!resourcesOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!resourcesMenuRef.current?.contains(e.target as Node)) setResourcesOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setResourcesOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [resourcesOpen]);

  // The dropdown also closes whenever navigation lands on a new path.
  useEffect(() => {
    setResourcesOpen(false);
  }, [pathname]);

  const resourcePageHref = (page: ResourcePageLink, index: number) =>
    toolkitGroupPath(
      urlGroupId,
      index === 0 ? 'resources' : `resources/${encodeURIComponent(page.slug)}`,
      { cleanHost: isDedicatedToolkitHost }
    );
  const activeResourceSlug = (() => {
    const match = pathname.match(/\/resources\/([^/]+)\/?$/);
    if (match) return decodeURIComponent(match[1]);
    return /\/resources\/?$/.test(pathname) ? resourcePages[0]?.slug ?? null : null;
  })();

  const tabs: Array<{ key: Tab; label: string; href: string }> = [
    { key: 'events', label: 'Events', href: toolkitGroupPath(urlGroupId, 'events', { cleanHost: isDedicatedToolkitHost }) },
    { key: 'roster', label: 'Roster', href: toolkitGroupPath(urlGroupId, 'roster', { cleanHost: isDedicatedToolkitHost }) },
    { key: 'resources', label: 'Resources', href: toolkitGroupPath(urlGroupId, 'resources', { cleanHost: isDedicatedToolkitHost }) },
    // Health section hidden — not ready to roll out. Re-enable by uncommenting this tab
    // and removing the redirect in [ccbGroupId]/health/page.tsx.
    // { key: 'health', label: 'Health', href: `/circle-leader-toolkit/${urlGroupId}/health` },
    { key: 'inbox', label: 'Inbox', href: toolkitGroupPath(urlGroupId, 'inbox', { cleanHost: isDedicatedToolkitHost }) },
  ];
  const hasUnreadMessages = unreadCount !== null && unreadCount > 0;
  const hasPendingSummaries = pendingSummaryCount !== null && pendingSummaryCount > 0;
  const hasAlerts = totalAlertCount !== null && totalAlertCount > 0;
  const unreadLabel = unreadCount === 1 ? '1 unread message' : `${unreadCount} unread messages`;
  const summaryLabel = pendingSummaryCount === 1 ? '1 summary needed' : `${pendingSummaryCount || 0} summaries needed`;

  return (
    <div className="space-y-3">
      <div ref={resourcesMenuRef} className="relative">
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
            const tabClassName =
              'flex-1 text-center text-xs sm:text-sm font-semibold py-2.5 rounded-full transition-all ' +
              (isActive ? 'shadow-sm cs-tab-active' : 'cs-tab-inactive');

            // With more than one resource page, the Resources tab opens a
            // dropdown of pages instead of navigating directly.
            if (t.key === 'resources' && resourcePages.length > 1) {
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-haspopup="menu"
                  aria-expanded={resourcesOpen}
                  onClick={() => setResourcesOpen((open) => !open)}
                  className={tabClassName}
                >
                  <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap">
                    {t.label}
                    <svg
                      className={'w-3 h-3 shrink-0 transition-transform ' + (resourcesOpen ? 'rotate-180' : '')}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </span>
                </button>
              );
            }

            return (
              <Link
                key={t.key}
                role="tab"
                aria-selected={isActive}
                href={t.href}
                className={tabClassName}
              >
                <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                  {t.label}
                  {t.key === 'events' && hasPendingSummaries && (
                    <span
                      role="img"
                      aria-label={summaryLabel}
                      className="cs-tab-badge-red w-[7px] h-[7px] rounded-full shrink-0"
                    />
                  )}
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

        {resourcesOpen && resourcePages.length > 1 && (
          <div
            role="menu"
            aria-label="Resource pages"
            className="absolute inset-x-0 top-full mt-2 z-30 rounded-2xl bg-white shadow-xl overflow-hidden"
            style={{ border: '1px solid var(--cs-border)' }}
          >
            {resourcePages.map((page, i) => {
              const isCurrentPage = page.slug === activeResourceSlug;
              return (
                <Link
                  key={page.id}
                  role="menuitem"
                  href={resourcePageHref(page, i)}
                  onClick={() => setResourcesOpen(false)}
                  aria-current={isCurrentPage ? 'page' : undefined}
                  className={
                    'flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold transition-colors ' +
                    (isCurrentPage
                      ? 'cs-resources-menu-item-active'
                      : 'cs-resources-menu-item')
                  }
                >
                  <span className="truncate">{page.title}</span>
                  {isCurrentPage && (
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {hasAlerts && (hasUnreadMessages ? active !== 'inbox' : active !== 'events') && (
        <Link
          href={toolkitGroupPath(urlGroupId, hasUnreadMessages ? 'inbox' : 'events', { cleanHost: isDedicatedToolkitHost })}
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
