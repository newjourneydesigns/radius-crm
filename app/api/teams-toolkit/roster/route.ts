/**
 * GET /api/teams-toolkit/roster
 * Returns the signed-in team leader's roster — the volunteers in the positions
 * they manage, grouped by position.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/teams-toolkit/session';
import { loadTeamRoster } from '../../../../lib/teams-toolkit/roster-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const result = await loadTeamRoster(leader);
  if (result.error) {
    return NextResponse.json({ positions: [], error: result.error }, { status: 200 });
  }
  return NextResponse.json({ positions: result.positions });
}
