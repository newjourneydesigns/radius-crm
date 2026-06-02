import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../../../lib/circle-summary/session';
import { loadLeaderEvents, loadLeaderMessages } from '../../../../lib/circle-summary/events-data';
import EventsClient from './EventsClient';

export const dynamic = 'force-dynamic';

// Server-rendered first paint: the events list, the message center, and the
// leader all resolve server-side from the shared cache (no client fetch
// waterfall, no spinner on the common warm path). EventsClient then handles
// post-submit invalidation and focus revalidation.
export default async function CircleSummaryEventsPage() {
  const leader = await getSessionLeader();
  if (!leader) redirect('/circle-summary/');

  const groupId = leader.ccb_group_id != null ? String(leader.ccb_group_id) : '';

  const [eventsResult, messages] = await Promise.all([
    loadLeaderEvents(leader),
    loadLeaderMessages(leader),
  ]);

  const initialError = eventsResult.error
    ?? (eventsResult.message && eventsResult.events.length === 0 ? eventsResult.message : null);

  return (
    <EventsClient
      groupId={groupId}
      leaderId={leader.id}
      initialEvents={eventsResult.events}
      initialMessages={messages}
      initialError={initialError}
    />
  );
}
