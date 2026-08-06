import { NextRequest, NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { getUserFromAuthHeader } from '../../../../lib/server-supabase';

/**
 * Look up phone numbers for a batch of CCB individuals, for Valley Creek Pulse.
 *
 * ## Why this exists separately from the roster pull
 *
 * CCB v1's group roster frequently omits phone numbers — they sit behind a
 * different permission — so they have to be fetched one profile at a time.
 * Doing that inside the roster call is an N+1 that blows Netlify's 10-second
 * function timeout at about eighteen people, which is smaller than any real
 * group. The caller then gets a bare 502 that looks identical to CCB being
 * down. So the roster comes back immediately (`enrichPhones: false`) and the
 * numbers are filled in here, afterwards, in batches.
 *
 * ## Bounded by a DEADLINE, not a count
 *
 * A fixed batch size is a guess about how slow CCB is today, and it's wrong on
 * the day CCB is slow — which is exactly the day it matters. This works through
 * the ids until it approaches its time budget, then returns what it got plus
 * whatever is left, so the caller can come straight back for the rest. A batch
 * is therefore always answerable within the timeout no matter how CCB is
 * behaving, and progress is never lost to a request that died.
 *
 * Read-only and gated on a signed-in Supabase user, like its siblings.
 */

export const dynamic = 'force-dynamic';

/**
 * How long to keep fetching before returning.
 *
 * Netlify's default function timeout is 10s. Seven leaves room for the CCB
 * call already in flight when the deadline hits, plus serialising the response.
 */
const WORK_BUDGET_MS = 7_000;

/**
 * Pause between profile calls, so a batch can't become the thing that exhausts
 * the church's shared CCB rate limit.
 */
const THROTTLE_MS = 250;

/** Never accept an unbounded list — the caller pages, so it has no need to. */
const MAX_IDS = 400;

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromAuthHeader(request);
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.individualIds)
      ? body.individualIds
          .map((id: unknown) => String(id ?? '').trim())
          .filter(Boolean)
          .slice(0, MAX_IDS)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ success: true, phones: {}, remaining: [] });
    }

    const ccb = createCCBClient(
      await getCCBRequestContext(request, {
        module: 'Follow-Up Campaigns',
        action: 'Enrich Phones',
        direction: 'pull',
      })
    );

    const deadline = Date.now() + WORK_BUDGET_MS;
    const phones: Record<string, { phone: string; mobilePhone: string }> = {};
    let i = 0;

    for (; i < ids.length; i++) {
      if (Date.now() >= deadline) break;
      if (i > 0) await new Promise((r) => setTimeout(r, THROTTLE_MS));

      try {
        const profile = await ccb.getIndividualProfile(ids[i]);
        if (profile) {
          phones[ids[i]] = {
            phone: profile.phone || '',
            mobilePhone: profile.mobilePhone || '',
          };
        }
      } catch {
        // One unreadable profile is not a failed batch. Skipping it means the
        // person simply keeps no number, which the caller already handles —
        // failing the whole batch would strand everyone after them.
      }
    }

    return NextResponse.json({
      success: true,
      phones,
      // Anything the deadline cut short. Empty means the batch finished.
      remaining: ids.slice(i),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('CCB Individual Phones Error:', error);

    if (message.toLowerCase().includes('permission')) {
      return NextResponse.json(
        {
          error: 'ccb_permission',
          details:
            'The CCB API user lacks permission to read individual profiles. Grant "Individuals" API access in CCB Admin → API → Permissions.',
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to read CCB phone numbers', details: message },
      { status: 502 }
    );
  }
}
