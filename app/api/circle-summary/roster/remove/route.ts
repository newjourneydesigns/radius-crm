/**
 * POST /api/circle-summary/roster/remove
 * Body: { individualId: string }
 * Removes an individual from the leader's CCB group.
 * Only touches group membership — does not modify the person's CCB profile.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../../lib/circle-summary/session';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  if (!leader.ccb_group_id) {
    return NextResponse.json({ error: 'No CCB group linked.' }, { status: 400 });
  }

  let body: { individualId?: string | number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const individualId = body.individualId;
  if (!individualId) {
    return NextResponse.json({ error: 'individualId is required.' }, { status: 400 });
  }

  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'roster_remove' })
  );

  try {
    const result = await ccb.removeIndividualFromGroup(individualId, leader.ccb_group_id);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
