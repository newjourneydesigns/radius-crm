'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import StudentTabs, { type StudentTab } from './StudentTabs';
import { useFitText } from '../../../hooks/useFitText';
import { isStudentToolkitHostName, studentToolkitLeaderPath } from '../../../lib/student-toolkit/paths';

export type HeaderStudentLeader = {
  name: string;
  campus: string | null;
  /** Already formatted ("Fall 2026") — the roster is scoped to one semester. */
  termLabel: string | null;
};

/**
 * Client chrome for the student leader pages. The leader comes from the
 * server-rendered layout (no client /me round trip, no header flash); this
 * island only needs the pathname to pick the active tab.
 */
export default function StudentChrome({
  leaderId,
  leader,
  children,
}: {
  leaderId: string;
  leader: HeaderStudentLeader;
  children: ReactNode;
}) {
  const pathname = (usePathname() ?? '').replace(/\/+$/, '');
  const cleanHost =
    typeof window !== 'undefined' && isStudentToolkitHostName(window.location.hostname);

  // On the dedicated host the visible URL drops the /student-toolkit prefix, so
  // the tab is read from whichever base the current path actually uses.
  const base = `/student-toolkit/${leaderId}`;
  const cleanBase = `/${leaderId}`;
  const pathBase = pathname.startsWith(base)
    ? base
    : cleanHost && pathname.startsWith(cleanBase)
      ? cleanBase
      : '';
  const tail = pathBase ? pathname.slice(pathBase.length).replace(/^\/+/, '').split('/')[0] : '';
  // Settings hangs off Home rather than the tab bar, so it deliberately
  // resolves to no active tab instead of lighting Home up.
  const active: StudentTab | null =
    tail === 'roster' ? 'roster'
    : tail === 'resources' ? 'resources'
    : tail === 'inbox' ? 'inbox'
    : tail === 'settings' ? null
    : 'home';

  const firstName = leader.name ? leader.name.trim().split(/\s+/)[0] : null;
  const title = `${firstName ? `${firstName}'s` : 'Your'} Circle`;
  const subtitle = [leader.campus, leader.termLabel].filter(Boolean).join(' · ');

  // Shrink the wordmark to fit when a long name would otherwise clip past the
  // hero's right edge; short names keep the full responsive size.
  const { containerRef, textRef } = useFitText<HTMLDivElement, HTMLHeadingElement>({
    minFontSize: 20,
    deps: [title],
  });

  return (
    <>
      <header className="cs-hero px-6 pt-6 pb-8 sm:pt-14 sm:pb-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href={`${studentToolkitLeaderPath(leaderId, 'home', { cleanHost })}/`}
              aria-label="Back to Home"
              className="shrink-0"
            >
              <div className="cs-vc-mark">VC</div>
            </Link>
            <div ref={containerRef} className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-bold uppercase text-white/75">Student Toolkit</p>
              <h1
                ref={textRef}
                className="cs-display whitespace-nowrap text-[clamp(1.75rem,8.5vw,3rem)] leading-tight"
              >
                {title}
              </h1>
              <p className="mt-1.5 text-white/90 font-semibold text-base">
                {leader.name}
                {subtitle ? <span className="font-normal text-white/70"> · {subtitle}</span> : null}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <StudentTabs leaderId={leaderId} active={active} />
      </div>

      {children}
    </>
  );
}
