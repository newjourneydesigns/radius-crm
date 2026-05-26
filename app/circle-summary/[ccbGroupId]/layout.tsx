'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useParams, usePathname, useRouter } from 'next/navigation';
import CircleTabs from './CircleTabs';

type HeaderLeader = {
  id: number | string;
  name: string;
  campus: string | null;
  ccb_group_id: string | number | null;
};

type ActiveTab = 'events' | 'roster' | 'inbox' | 'resources';

function readLeaderCache(groupId: string): HeaderLeader | null {
  try {
    const raw = sessionStorage.getItem(`cs:leader:${groupId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HeaderLeader;
    // Only trust the cache if it has the fields the header relies on; otherwise
    // force a fresh fetch so the name doesn't render as "Your Circle".
    if (!parsed || typeof parsed.name !== 'string' || parsed.name.trim() === '') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLeaderCache(groupId: string, leader: HeaderLeader): void {
  try {
    sessionStorage.setItem(`cs:leader:${groupId}`, JSON.stringify(leader));
  } catch {}
}

export default function CircleGroupLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = (usePathname() ?? '').replace(/\/+$/, '');
  const params = useParams<{ ccbGroupId: string }>();
  const urlGroupId = params?.ccbGroupId ?? '';
  const [leader, setLeader] = useState<HeaderLeader | null>(null);
  const fetchedGroupRef = useRef<string | null>(null);

  const base = `/circle-summary/${urlGroupId}`;
  const tail = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\/+/, '').split('/')[0] : '';
  const active: ActiveTab | null =
    tail === 'events' ? 'events'
    : tail === 'roster' ? 'roster'
    : tail === 'inbox' ? 'inbox'
    : tail === 'resources' ? 'resources'
    : null;

  useEffect(() => {
    if (!urlGroupId || !active) return;

    const cached = readLeaderCache(urlGroupId);
    if (cached) setLeader(cached);
    if (fetchedGroupRef.current === urlGroupId) return;
    fetchedGroupRef.current = urlGroupId;

    let cancelled = false;
    fetch('/api/circle-summary/me/')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const nextLeader = data?.leader as HeaderLeader | null | undefined;
        if (!nextLeader) {
          router.replace('/circle-summary');
          return;
        }

        const leaderGroupId =
          nextLeader.ccb_group_id != null ? String(nextLeader.ccb_group_id) : null;
        if (leaderGroupId && leaderGroupId !== urlGroupId) {
          router.replace(`/circle-summary/${leaderGroupId}/${active}`);
          return;
        }

        setLeader(nextLeader);
        writeLeaderCache(urlGroupId, nextLeader);
      })
      .catch(() => {
        fetchedGroupRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [active, router, urlGroupId]);

  async function signOut() {
    await fetch('/api/circle-summary/auth/logout/', { method: 'POST' });
    router.replace('/circle-summary');
  }

  if (!active) return <>{children}</>;

  const firstName = leader?.name ? leader.name.trim().split(/\s+/)[0] : null;
  return (
    <>
      <header className="cs-hero px-6 pt-10 pb-8 sm:pt-14 sm:pb-10">
        <div className="max-w-2xl mx-auto relative">
          <button
            onClick={signOut}
            className="absolute -top-4 right-0 sm:-top-6 text-white/70 hover:text-white text-xs font-semibold uppercase tracking-wide"
          >
            Sign out
          </button>
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
              {leader && (
                <p className="mt-1.5 text-white/90 font-semibold text-base">
                  {leader.name}
                  {leader.campus ? (
                    <span className="font-normal text-white/70"> · {leader.campus}</span>
                  ) : null}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <CircleTabs urlGroupId={urlGroupId} active={active} />
      </div>

      {children}
    </>
  );
}
