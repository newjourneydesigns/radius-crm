/**
 * GET /api/circle-leader-toolkit/events
 *
 * Returns the current leader's circle events for the last 12 weeks (each tagged
 * with submission status), the active Message Center messages, and the leader
 * profile. Used by the events page for background revalidation; the page's
 * first paint is server-rendered from the same loaders.
 *
 * The data logic lives in lib/circle-leader-toolkit/events-data.ts so the route and
 * the server component stay in lockstep.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { loadLeaderEvents, loadLeaderMessages } from '../../../../lib/circle-leader-toolkit/events-data';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const forceRefresh = new URL(req.url).searchParams.get('refresh') === '1';

  const [eventsResult, messages] = await Promise.all([
    loadLeaderEvents(leader, { forceRefresh }),
    loadLeaderMessages(leader),
  ]);

  return NextResponse.json({
    leader,
    events: eventsResult.events,
    messages,
    ...(eventsResult.error ? { error: eventsResult.error } : {}),
    ...(eventsResult.message ? { message: eventsResult.message } : {}),
  });
}
