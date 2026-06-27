import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../../../lib/circle-leader-toolkit/session';
import { loadLeaderEvents, loadLeaderMessages } from '../../../../lib/circle-leader-toolkit/events-data';
import { createTimer } from '../../../../lib/circle-leader-toolkit/timing';
import CircleTabSkeleton from '../../../../components/circle-leader-toolkit/CircleTabSkeleton';
import EventsClient from './EventsClient';

export const dynamic = 'force-dynamic';

// The page returns synchronously and streams: the layout chrome + the events
// skeleton paint immediately while the (cold-cache CCB-bound) events + messages
// resolve inside the Suspense boundary below. This gives the page its own
// streaming boundary instead of relying on route-level loading.tsx, so the
// shell is never blocked on the data fetch.
export default function CircleSummaryEventsPage() {
  return (
    <Suspense fallback={<CircleTabSkeleton />}>
      <EventsContent />
    </Suspense>
  );
}

// Server-rendered content: the events list, the message center, and the leader
// all resolve server-side from the shared cache (no client fetch waterfall, no
// spinner on the common warm path). EventsClient then handles post-submit
// invalidation and focus revalidation.
async function EventsContent() {
  const timer = createTimer('events-page');
  const leader = await getSessionLeader();
  timer.mark('session');
  if (!leader) redirect('/circle-leader-toolkit/');

  const groupId = leader.ccb_group_id != null ? String(leader.ccb_group_id) : '';

  const [eventsResult, messages] = await Promise.all([
    loadLeaderEvents(leader),
    loadLeaderMessages(leader),
  ]);
  timer.mark('data');
  timer.end({
    groupId,
    leaderId: leader.id,
    eventCount: eventsResult.events.length,
    ccbDegraded: eventsResult.ccbAttendanceDegraded ?? null,
  });

  const initialError = eventsResult.error
    ?? (eventsResult.message && eventsResult.events.length === 0 ? eventsResult.message : null);

  return (
    <EventsClient
      groupId={groupId}
      leaderId={leader.id}
      initialEvents={eventsResult.events}
      initialMessages={messages}
      initialError={initialError}
      initialCcbDegraded={eventsResult.ccbAttendanceDegraded ?? null}
    />
  );
}
