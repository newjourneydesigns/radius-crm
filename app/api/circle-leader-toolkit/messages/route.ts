/**
 * GET /api/circle-leader-toolkit/messages
 * Returns active Message Center messages for the current leader's campus.
 *
 * The events page now receives messages via its server-rendered first paint;
 * this route is kept for any standalone client refresh and shares the loader in
 * lib/circle-leader-toolkit/events-data.ts.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { loadLeaderMessages } from '../../../../lib/circle-leader-toolkit/events-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const messages = await loadLeaderMessages(leader);
  return NextResponse.json({ messages });
}
