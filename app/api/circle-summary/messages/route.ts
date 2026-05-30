/**
 * GET /api/circle-summary/messages
 * Returns active Message Center messages for the current leader's campus.
 *
 * The events page now receives messages via its server-rendered first paint;
 * this route is kept for any standalone client refresh and shares the loader in
 * lib/circle-summary/events-data.ts.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-summary/session';
import { loadLeaderMessages } from '../../../../lib/circle-summary/events-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const messages = await loadLeaderMessages(leader);
  return NextResponse.json({ messages });
}
