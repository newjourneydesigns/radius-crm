'use client';

/**
 * Legacy redirector for the event-detail URL. The canonical path is
 * `/circle-leader-toolkit/[ccbGroupId]/events/[eventId]/[occurrence]`. Old links
 * land here, look up the leader's circle, and bounce to the new URL with
 * the same eventId/occurrence.
 */

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function CircleSummaryEventDetailRedirect() {
  const router = useRouter();
  const params = useParams<{ eventId: string; occurrence: string }>();
  const eventId = params.eventId;
  const occurrence = params.occurrence;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/circle-leader-toolkit/me');
        if (cancelled) return;
        if (res.status !== 200) {
          router.replace('/circle-leader-toolkit');
          return;
        }
        const data = await res.json();
        if (!data.leader || data.leader.ccb_group_id == null) {
          router.replace('/circle-leader-toolkit');
          return;
        }
        const groupId = data.leader.ccb_group_id;
        router.replace(`/circle-leader-toolkit/${groupId}/events/${eventId}/${occurrence}`);
      } catch {
        if (!cancelled) router.replace('/circle-leader-toolkit');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, eventId, occurrence]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="cs-skeleton h-24 w-full" />
    </main>
  );
}
