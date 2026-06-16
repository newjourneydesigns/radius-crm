'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import CircleTabs from './CircleTabs';
import CircleOnboardingPrompts from './CircleOnboardingPrompts';
import { useFitText } from '../../../hooks/useFitText';

export type HeaderLeader = {
  id: number | string;
  name: string;
  campus: string | null;
  ccb_group_id: string | number | null;
};

type ActiveTab = 'events' | 'roster' | 'inbox' | 'resources' | 'health' | 'settings';

/**
 * Client chrome for the Circle group pages. The leader comes from the
 * server-rendered layout (no client /me round trip, no header flash); this
 * island only needs the pathname to pick the active tab and to hide the chrome
 * on the full-screen event-summary form route.
 */
export default function CircleChrome({
  leader,
  groupId,
  children,
}: {
  leader: HeaderLeader;
  groupId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = (usePathname() ?? '').replace(/\/+$/, '');

  const base = `/circle-leader-toolkit/${groupId}`;
  const tail = pathname.startsWith(base)
    ? pathname.slice(base.length).replace(/^\/+/, '').split('/')[0]
    : '';
  const active: ActiveTab | null =
    tail === 'events' ? 'events'
    : tail === 'roster' ? 'roster'
    : tail === 'inbox' ? 'inbox'
    : tail === 'resources' ? 'resources'
    : tail === 'health' ? 'health'
    : tail === 'settings' ? 'settings'
    : null;
  const isEventSummaryForm = pathname.startsWith(`${base}/events/`);

  // Rare correctness guard: if the signed-in leader's group differs from the
  // URL group (e.g. a stale bookmark after a group change), send them to their
  // own group while preserving the current tab.
  const leaderGroupId = leader.ccb_group_id != null ? String(leader.ccb_group_id) : null;
  const groupMismatch = !!leaderGroupId && leaderGroupId !== groupId && !!active;

  useEffect(() => {
    if (groupMismatch && leaderGroupId) {
      router.replace(`/circle-leader-toolkit/${leaderGroupId}/${active}`);
    }
  }, [groupMismatch, leaderGroupId, active, router]);

  const firstName = leader.name ? leader.name.trim().split(/\s+/)[0] : null;
  const title = `${firstName ? `${firstName}'s` : 'Your'} Circle`;

  // Shrink the wordmark to fit when a long name would otherwise clip past the
  // hero's right edge; short names keep the full responsive size.
  const { containerRef, textRef } = useFitText<HTMLDivElement, HTMLHeadingElement>({
    minFontSize: 20,
    deps: [title],
  });
  const showChrome = !!active && !isEventSummaryForm;

  return (
    <>
      {showChrome && (
        <>
          <header className="cs-hero px-6 pt-6 pb-8 sm:pt-14 sm:pb-10">
            <div className="max-w-2xl mx-auto relative">
              {/* On mobile the gear sits in its own right-aligned row above the
                  title so it never crowds the wordmark; on sm+ it floats in the
                  top-right corner. */}
              <div className="flex justify-end mb-3 sm:mb-0 sm:static sm:block">
                <SettingsButton groupId={groupId} active={active} />
              </div>
              <div className="flex items-center gap-4 min-w-0">
                <Link
                  href={`/circle-leader-toolkit/${groupId}/events`}
                  aria-label="Back to Events"
                  className="shrink-0"
                >
                  <Image
                    src="/Circles Logo V2-White.png"
                    alt="Circles"
                    width={80}
                    height={79}
                    priority
                    className="h-16 sm:h-20 w-auto"
                  />
                </Link>
                <div ref={containerRef} className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-bold uppercase text-white/75">
                    Circles Toolkit
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
            <CircleTabs urlGroupId={groupId} active={active} />
            <CircleOnboardingPrompts groupId={groupId} />
          </div>
        </>
      )}

      {children}
    </>
  );
}

function SettingsButton({ groupId, active }: { groupId: string; active: ActiveTab | null }) {
  const isActive = active === 'settings';
  return (
    <Link
      href={`/circle-leader-toolkit/${groupId}/settings`}
      aria-label="Settings"
      aria-current={isActive ? 'page' : undefined}
      className={
        'static sm:absolute sm:-top-6 sm:right-0 inline-flex items-center justify-center gap-1.5 rounded-full ' +
        'p-2 sm:px-3 sm:py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors backdrop-blur-sm ' +
        (isActive
          ? 'bg-white text-[#1f7a1f]'
          : 'bg-white/15 text-white hover:bg-white/25')
      }
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
      <span className="hidden sm:inline">Settings</span>
    </Link>
  );
}
