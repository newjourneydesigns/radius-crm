import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { getLeaderAlertCounts } from '../../../../lib/circle-leader-toolkit/push';
import { loadLeaderEvents } from '../../../../lib/circle-leader-toolkit/events-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  let counts = { unreadMessages: 0, pendingEventSummaries: 0, totalAlertCount: 0 };
  try {
    counts = await getLeaderAlertCounts(leader.id);
  } catch (error) {
    console.warn(
      '[circle-summary/alerts] count lookup failed:',
      error instanceof Error ? error.message : error
    );
  }

  let pendingEventSummaries = 0;
  try {
    const eventsResult = await loadLeaderEvents(leader);
    const now = Date.now();
    pendingEventSummaries = (eventsResult.events || []).filter((event: any) => {
      const eventTime = new Date((event.occurrenceDateTime || '').replace(' ', 'T')).getTime();
      return Number.isFinite(eventTime) && eventTime <= now && !event.submittedAt && !event.hasExistingAttendance;
    }).length;
  } catch (error) {
    console.warn(
      '[circle-summary/alerts] event summary count failed:',
      error instanceof Error ? error.message : error
    );
    pendingEventSummaries = counts.pendingEventSummaries;
  }

  return NextResponse.json({
    unreadMessages: counts.unreadMessages,
    pendingEventSummaries,
    totalAlertCount: counts.unreadMessages + pendingEventSummaries,
  });
}
