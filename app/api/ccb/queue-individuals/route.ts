import { NextRequest, NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { getUserFromAuthHeader } from '../../../../lib/server-supabase';

/**
 * The people in one CCB process queue step, for Bulk Message's queue import.
 *
 * One CCB call. It returns names and statuses only — never phone numbers — so
 * the caller picks which statuses it wants and then looks up phones for just
 * those people through /api/ccb/individual-phones. Read-only and gated on a
 * signed-in Supabase user, like its siblings.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromAuthHeader(request);
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const stepId = String(body?.stepId ?? '').trim();
    if (!/^\d+$/.test(stepId)) {
      return NextResponse.json(
        { error: 'Missing stepId', details: 'A numeric CCB process step ID is required' },
        { status: 400 }
      );
    }

    const ccb = createCCBClient(
      await getCCBRequestContext(request, {
        module: 'Bulk Message',
        action: 'Fetch Process Queue',
        direction: 'pull',
      })
    );
    const individuals = await ccb.getQueueIndividuals(stepId);

    return NextResponse.json({
      success: true,
      data: individuals.filter(p => p.id),
      count: individuals.length,
    });
  } catch (error) {
    console.error('CCB queue individuals error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Missing CCB env vars')) {
      return NextResponse.json(
        { error: 'CCB not configured', details: message },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch process queue', details: message },
      { status: 500 }
    );
  }
}
