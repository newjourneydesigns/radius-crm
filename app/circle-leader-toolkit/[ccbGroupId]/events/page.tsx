import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../../../lib/circle-leader-toolkit/session';
import { loadLeaderEvents, loadLeaderMessages } from '../../../../lib/circle-leader-toolkit/events-data';
import { createTimer } from '../../../../lib/circle-leader-toolkit/timing';
import { readCircleGuideLink } from '../../../../lib/circle-leader-toolkit/circle-guide';
import EventsClient from './EventsClient';

export const dynamic = 'force-dynamic';

// Server-rendered first paint: the events list, the message center, and the
// leader all resolve server-side from the shared cache (no client fetch
// waterfall, no spinner on the common warm path). The route-level loading.tsx
// holds the green splash solid through the whole entry while this resolves.
// EventsClient then handles post-submit invalidation and focus revalidation.
export default async function CircleSummaryEventsPage() {
  const timer = createTimer('events-page');
  const leader = await getSessionLeader();
  timer.mark('session');
  if (!leader) redirect('/circle-leader-toolkit/');

  const groupId = leader.ccb_group_id != null ? String(leader.ccb_group_id) : '';

  // readCircleGuideLink is a single cached-row read — the guide itself is
  // resolved from valleycreek.plus by the sync-circle-guide cron, never here.
  const [eventsResult, messages, circleGuide] = await Promise.all([
    // Stale-while-revalidate: never block the first paint on CCB's 12-week
    // attendance call. EventsClient revalidates straight after hydration, so
    // CCB is still consulted every visit — the leader just isn't held on the
    // splash screen while it happens.
    loadLeaderEvents(leader, { preferCachedAttendance: true }),
    loadLeaderMessages(leader),
    readCircleGuideLink(),
  ]);
  timer.mark('data');
  timer.end({
    groupId,
    leaderId: leader.id,
    eventCount: eventsResult.events.length,
    ccbDegraded: eventsResult.ccbAttendanceDegraded ?? null,
    attendanceStale: eventsResult.attendanceIsStale ?? false,
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
      initialAttendanceStale={eventsResult.attendanceIsStale ?? false}
      circleGuide={circleGuide}
    />
  );
}
