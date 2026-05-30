'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import CircleTabs from './CircleTabs';

export type HeaderLeader = {
  id: number | string;
  name: string;
  campus: string | null;
  ccb_group_id: string | number | null;
};

type ActiveTab = 'events' | 'roster' | 'inbox' | 'resources';

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

  const base = `/circle-summary/${groupId}`;
  const tail = pathname.startsWith(base)
    ? pathname.slice(base.length).replace(/^\/+/, '').split('/')[0]
    : '';
  const active: ActiveTab | null =
    tail === 'events' ? 'events'
    : tail === 'roster' ? 'roster'
    : tail === 'inbox' ? 'inbox'
    : tail === 'resources' ? 'resources'
    : null;
  const isEventSummaryForm = pathname.startsWith(`${base}/events/`);

  // Rare correctness guard: if the signed-in leader's group differs from the
  // URL group (e.g. a stale bookmark after a group change), send them to their
  // own group while preserving the current tab.
  const leaderGroupId = leader.ccb_group_id != null ? String(leader.ccb_group_id) : null;
  const groupMismatch = !!leaderGroupId && leaderGroupId !== groupId && !!active;

  useEffect(() => {
    if (groupMismatch && leaderGroupId) {
      router.replace(`/circle-summary/${leaderGroupId}/${active}`);
    }
  }, [groupMismatch, leaderGroupId, active, router]);

  if (!active || isEventSummaryForm) return <>{children}</>;

  const firstName = leader.name ? leader.name.trim().split(/\s+/)[0] : null;

  return (
    <>
      <header className="cs-hero px-6 pt-10 pb-8 sm:pt-14 sm:pb-10">
        <div className="max-w-2xl mx-auto relative">
          <SignOutButton />
          <div className="flex items-center gap-4 min-w-0">
            <Image
              src="/Circles Logo V2-White.png"
              alt="Circles"
              width={80}
              height={79}
              priority
              className="h-16 sm:h-20 w-auto shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h1 className="cs-display whitespace-nowrap text-[clamp(1.75rem,8.5vw,3rem)] leading-tight">
                {firstName ? `${firstName}'s` : 'Your'} Circle
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
      </div>

      {children}
    </>
  );
}

function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await fetch('/api/circle-summary/auth/logout/', { method: 'POST' });
    router.replace('/circle-summary');
  }
  return (
    <button
      onClick={signOut}
      className="absolute -top-4 right-0 sm:-top-6 text-white/70 hover:text-white text-xs font-semibold uppercase tracking-wide"
    >
      Sign out
    </button>
  );
}
