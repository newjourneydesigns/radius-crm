'use client';

/**
 * Legacy redirector. The canonical events URL is now
 * `/circle-leader-toolkit/[ccbGroupId]/events`. Magic links, bookmarks, and any
 * old links land here, look up the leader's circle, and bounce to the
 * group-scoped URL.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CircleSplash from '../../../components/circle-leader-toolkit/CircleSplash';

export default function CircleSummaryEventsRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/circle-leader-toolkit/me/');
        if (cancelled) return;
        if (res.status !== 200) {
          router.replace('/circle-leader-toolkit');
          return;
        }
        const data = await res.json();
        if (!data.leader) {
          router.replace('/circle-leader-toolkit');
          return;
        }
        const groupId = data.leader.ccb_group_id;
        if (groupId == null) {
          // Logged in, but no circle linked. The sign-in page surfaces the
          // "contact your ACPD" message in this state.
          router.replace('/circle-leader-toolkit');
          return;
        }
        router.replace(`/circle-leader-toolkit/${groupId}/events`);
      } catch {
        if (!cancelled) router.replace('/circle-leader-toolkit');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return <CircleSplash />;
}
