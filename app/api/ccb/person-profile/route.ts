import { NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { getUserFromAuthHeader } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

/**
 * Full CCB profile for one individual, by ID.
 *
 * `individual_search` (behind /api/ccb/person-search) returns names, emails and
 * phones but no birthday — that only comes from `individual_profile_from_id`.
 * This is the second hop the person lookup makes once someone is actually
 * picked, so the extra CCB call is one per selection rather than one per
 * keystroke of search results.
 */
export async function POST(request: Request) {
  try {
    // Same gate as person-search: this proxies the church directory and spends
    // the finite CCB API budget.
    const user = await getUserFromAuthHeader(request);
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const individualId = String(body?.individual_id ?? '').trim();

    if (!/^\d+$/.test(individualId)) {
      return NextResponse.json({ error: 'A numeric individual_id is required' }, { status: 400 });
    }

    const ccbClient = createCCBClient(await getCCBRequestContext(request, {
      module: 'Person Lookup',
      action: 'Fetch Person Profile',
      direction: 'pull',
    }));

    const profile = await ccbClient.getIndividualProfile(individualId);

    if (!profile) {
      return NextResponse.json({ error: 'Individual not found in CCB' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error: any) {
    console.error('CCB Person Profile Error:', error);
    return NextResponse.json(
      { error: 'Failed to load the CCB profile', details: error.message },
      { status: 500 }
    );
  }
}
