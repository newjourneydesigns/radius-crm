import { NextRequest, NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { getUserFromAuthHeader } from '../../../../lib/server-supabase';

/**
 * Read one CCB form's responses, for Valley Creek Pulse.
 *
 * Pulse holds no CCB credentials — every CCB call it makes proxies through
 * RADIUS so the church's shared 10,000-a-day budget keeps exactly one consumer
 * (RADIUS owns the budget guard, circuit breaker and telemetry; a second
 * independent caller is how the quota was exhausted on 2026-06-08).
 *
 * `/api/ccb/group-roster` already covers "who was expected". This is the other
 * half of a campaign reconcile: "who actually submitted". Pulse pairs the two
 * and matches them locally — the matching itself never needs CCB.
 *
 * Deliberately narrow, like its siblings. It takes a form ID and returns that
 * form's respondents. It is NOT a parameterised `srv` passthrough, and it
 * shouldn't grow into one.
 *
 * Gated on a signed-in Supabase user alone, matching group-roster and
 * person-search: this is a read, and both apps share one auth. The shared-secret
 * second factor is reserved for the write paths (see `lab-attendance`).
 */

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromAuthHeader(request);
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const formId = String(body?.formId ?? '').trim();

    if (!formId) {
      return NextResponse.json(
        { error: 'Missing formId', details: 'A CCB form ID is required' },
        { status: 400 }
      );
    }

    const ccb = createCCBClient(
      await getCCBRequestContext(request, {
        module: 'Follow-Up Campaigns',
        action: 'Fetch Form Responses',
        direction: 'pull',
      })
    );

    const responses = await ccb.getFormResponses(formId);

    return NextResponse.json({
      success: true,
      data: responses,
      count: responses.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('CCB Form Responses Error:', error);

    // A permissions failure is fixable by the church's CCB admin, so it's worth
    // naming rather than folding into a generic 502.
    if (message.toLowerCase().includes('permission')) {
      return NextResponse.json(
        {
          error: 'ccb_permission',
          details:
            'The CCB API user lacks permission to read form responses. Grant "Form" API access in CCB Admin → API → Permissions.',
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to read CCB form responses', details: message },
      { status: 502 }
    );
  }
}
