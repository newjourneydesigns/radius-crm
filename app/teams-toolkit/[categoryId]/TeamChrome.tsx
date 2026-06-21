'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import TeamTabs from './TeamTabs';
import { useFitText } from '../../../hooks/useFitText';
import { isTeamsToolkitHostName, teamsToolkitGroupPath } from '../../../lib/teams-toolkit/paths';

export type HeaderLeader = {
  id: number | string;
  name: string;
  campus: string | null;
  team_name: string | null;
  ccb_category_id: string | number | null;
};

type ActiveTab = 'roster' | 'schedule' | 'inbox';

/**
 * Client chrome for the Teams group pages. The leader comes from the
 * server-rendered layout (no client /me round trip, no header flash); this
 * island only needs the pathname to pick the active tab.
 */
export default function TeamChrome({
  leader,
  categoryId,
  children,
}: {
  leader: HeaderLeader;
  categoryId: string;
  children: ReactNode;
}) {
  const pathname = (usePathname() ?? '').replace(/\/+$/, '');
  const isDedicatedToolkitHost =
    typeof window !== 'undefined' && isTeamsToolkitHostName(window.location.hostname);

  const base = `/teams-toolkit/${categoryId}`;
  const cleanBase = `/${categoryId}`;
  const pathBase = pathname.startsWith(base)
    ? base
    : isDedicatedToolkitHost && pathname.startsWith(cleanBase)
      ? cleanBase
      : '';
  const tail = pathBase ? pathname.slice(pathBase.length).replace(/^\/+/, '').split('/')[0] : '';
  const active: ActiveTab | null =
    tail === 'roster' ? 'roster'
    : tail === 'schedule' ? 'schedule'
    : tail === 'inbox' ? 'inbox'
    : null;

  const firstName = leader.name ? leader.name.trim().split(/\s+/)[0] : null;
  const title = leader.team_name?.trim() || `${firstName ? `${firstName}'s` : 'Your'} Team`;

  const { containerRef, textRef } = useFitText<HTMLDivElement, HTMLHeadingElement>({
    minFontSize: 20,
    deps: [title],
  });

  const showChrome = !!active;

  return (
    <>
      {showChrome && (
        <>
          <header className="cs-hero px-6 pt-6 pb-8 sm:pt-14 sm:pb-10">
            <div className="max-w-2xl mx-auto relative">
              <div className="flex items-center gap-4 min-w-0">
                <Link
                  href={teamsToolkitGroupPath(categoryId, 'roster', { cleanHost: isDedicatedToolkitHost })}
                  aria-label="Back to Roster"
                  className="shrink-0"
                >
                  <img
                    src="/VCC Icon (White).png"
                    alt="Valley Creek"
                    className="h-14 sm:h-16 w-auto"
                  />
                </Link>
                <div ref={containerRef} className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-bold uppercase text-white/75">
                    Teams Toolkit
                  </p>
                  <h1
                    ref={textRef}
                    className="cs-display whitespace-nowrap text-[clamp(1.75rem,8.5vw,3rem)] leading-tight"
                  >
                    {title}
                  </h1>
                  <p className="mt-1.5 text-white/90 font-semibold text-base">
                    {leader.name}
                    {leader.campus ? (
                      <span className="font-normal text-white/70"> · {leader.campus}</span>
                    ) : null}
                  </p>
                </div>
              </div>
            </div>
          </header>

          <div className="max-w-2xl mx-auto px-4 pt-4">
            <TeamTabs categoryId={categoryId} active={active} />
          </div>
        </>
      )}

      {children}
    </>
  );
}
