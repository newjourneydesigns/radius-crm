'use client';

import Link from 'next/link';

type Tab = 'events' | 'roster' | 'resources';

export default function CircleTabs({
  urlGroupId,
  active,
}: {
  urlGroupId: string;
  active: Tab;
}) {
  const tabs: Array<{ key: Tab; label: string; href: string }> = [
    { key: 'events', label: 'Events', href: `/circle-summary/${urlGroupId}/events` },
    { key: 'roster', label: 'Roster', href: `/circle-summary/${urlGroupId}/roster` },
    { key: 'resources', label: 'Resources', href: `/circle-summary/${urlGroupId}/resources` },
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
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            role="tab"
            aria-selected={isActive}
            href={t.href}
            className={
              'flex-1 text-center text-sm font-semibold py-2.5 rounded-full transition-all ' +
              (isActive ? 'shadow-sm cs-tab-active' : 'cs-tab-inactive')
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
