import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { getLeaderAlertCounts } from '../../../../lib/circle-leader-toolkit/push';
import { loadLeaderEvents } from '../../../../lib/circle-leader-toolkit/events-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  // The two counts are independent — the inbox tally and the 12-week event load
  // ran back to back, so the request took the sum of both. Overlap them.
  //
  // `allowStaleAttendance` keeps this endpoint off the live CCB attendance
  // call. This is a badge count, not a record: it polls on every app foreground
  // and the leader's own submissions are read live from Supabase, so those
  // clear the dot immediately. Only a summary entered directly in CCB can leave
  // the dot up briefly, and opening the Events tab — which still does the live
  // lookup — corrects it and pushes the exact count back to the nav.
  const [countsResult, eventsResult] = await Promise.allSettled([
    getLeaderAlertCounts(leader.id),
    loadLeaderEvents(leader, { allowStaleAttendance: true }),
  ]);

  let counts = { unreadMessages: 0, pendingEventSummaries: 0, totalAlertCount: 0 };
  if (countsResult.status === 'fulfilled') {
    counts = countsResult.value;
  } else {
    console.warn('[circle-summary/alerts] count lookup failed:', countsResult.reason);
  }

  let pendingEventSummaries = counts.pendingEventSummaries;
  if (eventsResult.status === 'fulfilled') {
    const now = Date.now();
    pendingEventSummaries = (eventsResult.value.events || []).filter((event) => {
      const eventTime = new Date((event.occurrenceDateTime || '').replace(' ', 'T')).getTime();
      return Number.isFinite(eventTime) && eventTime <= now && !event.submittedAt && !event.hasExistingAttendance;
    }).length;
  } else {
    console.warn('[circle-summary/alerts] event summary count failed:', eventsResult.reason);
  }

  return NextResponse.json({
    unreadMessages: counts.unreadMessages,
    pendingEventSummaries,
    totalAlertCount: counts.unreadMessages + pendingEventSummaries,
  });
}
