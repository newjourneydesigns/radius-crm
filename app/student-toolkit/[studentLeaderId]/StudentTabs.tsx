'use client';

import Link from 'next/link';
import { isStudentToolkitHostName, studentToolkitLeaderPath } from '../../../lib/student-toolkit/paths';

export type StudentTab = 'home' | 'roster' | 'resources' | 'inbox';

const TABS: Array<{ key: StudentTab; label: string }> = [
  { key: 'home', label: 'Home' },
  { key: 'roster', label: 'Roster' },
  { key: 'resources', label: 'Resources' },
  { key: 'inbox', label: 'Inbox' },
];

/**
 * The four student tabs. Deliberately thinner than the Circle Leader Toolkit's
 * tab bar: no alert polling, no dropdown — student leaders open this on a phone
 * between classes, and every extra request is one more thing to wait on.
 */
export default function StudentTabs({
  leaderId,
  active,
}: {
  leaderId: string;
  /** Null on routes that hang off a tab (settings) rather than being one. */
  active: StudentTab | null;
}) {
  const cleanHost =
    typeof window !== 'undefined' && isStudentToolkitHostName(window.location.hostname);

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
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
