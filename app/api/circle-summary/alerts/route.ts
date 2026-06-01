import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-summary/session';
import { getLeaderAlertCounts } from '../../../../lib/circle-summary/push';
import { loadLeaderEvents } from '../../../../lib/circle-summary/events-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const counts = await getLeaderAlertCounts(leader.id);
  let pendingEventSummaries = 0;
  try {
    const eventsResult = await loadLeaderEvents(leader);
    const now = Date.now();
    pendingEventSummaries = (eventsResult.events || []).filter((event: any) => {
      const eventTime = new Date((event.occurrenceDateTime || '').replace(' ', 'T')).getTime();
      return Number.isFinite(eventTime) && eventTime <= now && !event.submittedAt && !event.hasExistingAttendance;
    }).length;
  } catch {
    pendingEventSummaries = counts.pendingEventSummaries;
  }

  return NextResponse.json({
    unreadMessages: counts.unreadMessages,
    pendingEventSummaries,
    totalAlertCount: counts.unreadMessages + pendingEventSummaries,
  });
}
