/**
 * GET /api/circle-summary/roster/attendance
 * Returns the most recent attendance date per individual for the current
 * leader's CCB group (last ~12 weeks). Powers the roster page's "last attended"
 * badges and the 15-day absence alerts.
 *
 * Data logic (shared cache → derived map → live CCB) lives in
 * lib/circle-summary/roster-data.ts.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../../lib/circle-summary/session';
import { loadLeaderAttendance } from '../../../../../lib/circle-summary/roster-data';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  if (!leader.ccb_group_id) return NextResponse.json({ lastAttended: {} });

  const groupId = String(leader.ccb_group_id);
  const requestedGroupId = new URL(req.url).searchParams.get('group_id')?.trim();
  if (requestedGroupId && requestedGroupId !== groupId) {
    return NextResponse.json({ lastAttended: {}, error: 'Group mismatch.' }, { status: 403 });
  }

  const result = await loadLeaderAttendance(leader);
  if (result.error) {
    return NextResponse.json({ lastAttended: {}, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ lastAttended: result.lastAttended, source: result.source });
}
