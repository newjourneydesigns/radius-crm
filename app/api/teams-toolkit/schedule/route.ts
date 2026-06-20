/**
 * GET /api/teams-toolkit/schedule
 * Read-only: upcoming scheduled occurrences for the signed-in team leader,
 * limited to the positions they manage, with each person's CCB response status.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/teams-toolkit/session';
import { loadTeamSchedule } from '../../../../lib/teams-toolkit/schedule-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const result = await loadTeamSchedule(leader);
  if (result.error) {
    return NextResponse.json({ occurrences: [], error: result.error }, { status: 200 });
  }
  return NextResponse.json({ occurrences: result.occurrences });
}
