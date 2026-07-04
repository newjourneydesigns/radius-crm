import { NextRequest, NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { ccbApiVersion } from '../../../../lib/ccb/ccb-v2-config';
import { createCCBv2Client } from '../../../../lib/ccb/ccb-v2-client';
import { getUserFromAuthHeader } from '../../../../lib/server-supabase';

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromAuthHeader(request);
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await request.json();
    const { groupId } = body;

    if (!groupId) {
      return NextResponse.json(
        { error: 'Missing groupId', details: 'A CCB group ID is required' },
        { status: 400 }
      );
    }

    const ctx = await getCCBRequestContext(request, {
      module: 'Profile Page',
      action: 'Fetch Groups',
      direction: 'pull',
    });

    let enriched;
    if (ccbApiVersion() === 'v2') {
      // v2 group members already include phone inline — no N+1 enrichment needed.
      enriched = await createCCBv2Client(ctx).getGroupParticipants(String(groupId));
    } else {
      const client = createCCBClient(ctx);
      const participants = await client.getGroupParticipants(String(groupId));
      enriched = await client.enrichRosterWithPhones(participants);
    }

    return NextResponse.json({
      success: true,
      data: enriched,
      count: enriched.length,
    });
  } catch (error) {
    console.error('CCB group roster error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Missing CCB env vars')) {
      return NextResponse.json(
        { error: 'CCB not configured', details: message },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch group roster', details: message },
      { status: 500 }
    );
  }
}
