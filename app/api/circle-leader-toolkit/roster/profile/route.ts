/**
 * GET /api/circle-leader-toolkit/roster/profile?id=XXX
 * Returns a single CCB individual's enriched profile (phone, email, birthday).
 * Used by the roster page to progressively fill in detail data per-member.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../../lib/circle-leader-toolkit/session';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  }

  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'roster_profile' })
  );

  try {
    const profile = await ccb.getIndividualProfile(id);
    if (!profile) {
      return NextResponse.json({ profile: null }, { status: 404 });
    }
    return NextResponse.json({
      profile: {
        id: profile.id,
        email: profile.email || '',
        phone: profile.mobilePhone || profile.phone || '',
        birthday: profile.birthday || '',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
