/**
 * GET /api/circle-summary/roster
 * Returns the leader's CCB group participants.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-summary/session';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  if (!leader.ccb_group_id) {
    return NextResponse.json({ participants: [], message: 'No CCB group linked.' });
  }

  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'group_roster' })
  );

  try {
    const participants = await ccb.getGroupParticipants(leader.ccb_group_id);
    return NextResponse.json({
      participants: participants.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: p.fullName,
        email: p.email,
        phone: p.phone || p.mobilePhone,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ participants: [], error: e.message }, { status: 500 });
  }
}
