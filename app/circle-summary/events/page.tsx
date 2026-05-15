'use client';

/**
 * Legacy redirector. The canonical events URL is now
 * `/circle-summary/[ccbGroupId]/events`. Magic links, bookmarks, and any
 * old links land here, look up the leader's circle, and bounce to the
 * group-scoped URL.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CircleSummaryEventsRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/circle-summary/me/');
        if (cancelled) return;
        if (res.status !== 200) {
          router.replace('/circle-summary');
          return;
        }
        const data = await res.json();
        if (!data.leader) {
          router.replace('/circle-summary');
          return;
        }
        const groupId = data.leader.ccb_group_id;
        if (groupId == null) {
          // Logged in, but no circle linked. The sign-in page surfaces the
          // "contact your ACPD" message in this state.
          router.replace('/circle-summary');
          return;
        }
        router.replace(`/circle-summary/${groupId}/events`);
      } catch {
        if (!cancelled) router.replace('/circle-summary');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="cs-skeleton h-24 w-full" />
    </main>
  );
}
