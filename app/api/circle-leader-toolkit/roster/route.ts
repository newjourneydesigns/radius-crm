/**
 * GET /api/circle-leader-toolkit/roster
 * Returns the leader's CCB group participants, merged with any cached profile
 * data (phone/email/birthday). Stale or missing IDs are flagged so the client
 * can revalidate them via /api/circle-leader-toolkit/roster/refresh.
 *
 * Data logic lives in lib/circle-leader-toolkit/roster-data.ts so the route and the
 * server-rendered roster page share one implementation.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { loadLeaderRoster } from '../../../../lib/circle-leader-toolkit/roster-data';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  if (!leader.ccb_group_id) {
    return NextResponse.json({ participants: [], staleIds: [], message: 'No CCB group linked.' });
  }

  const forceRefresh = new URL(req.url).searchParams.get('refresh') === '1';
  const result = await loadLeaderRoster(leader, { forceRefresh });

  if (result.error) {
    return NextResponse.json(
      { participants: [], staleIds: [], error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    participants: result.participants,
    staleIds: result.staleIds,
    source: result.source,
    needsRosterRefresh: result.needsRosterRefresh,
  });
}
