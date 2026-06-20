/**
 * GET /api/teams-toolkit/messages
 * Returns active Message Center messages for the current team leader's campus.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/teams-toolkit/session';
import { loadTeamMessages } from '../../../../lib/teams-toolkit/messages-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const messages = await loadTeamMessages(leader);
  return NextResponse.json({ messages });
}
