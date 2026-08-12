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
    const { groupId, includeGroupName, enrichPhones } = body;

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

    /**
     * The v1 roster pull, with phone enrichment.
     *
     * Phone enrichment is opt-OUT, not opt-in, so every existing caller keeps
     * the behaviour it has today.
     *
     * On v1 this is an N+1: one CCB profile call per person whose phone the
     * group pull didn't include, serialised with a 500ms throttle. At
     * Netlify's 10-second function timeout that caps out around eighteen
     * people — so a caller reconciling a real group times out and gets a bare
     * 502, with no way to tell that from a CCB outage.
     *
     * Callers that would rather have the roster now and the phone numbers
     * shortly afterwards (Pulse's campaigns, which enrich in bounded batches
     * of their own) pass `enrichPhones: false` and return in about a second.
     */
    const fetchViaV1 = async () => {
      const client = createCCBClient(ctx);
      const participants = await client.getGroupParticipants(String(groupId));
      return enrichPhones === false
        ? participants
        : await client.enrichRosterWithPhones(participants);
    };

    let enriched;
    let usedFallback = false;
    if (ccbApiVersion() === 'v2') {
      // v2 group members already include phone AND birthday inline — no N+1
      // enrichment needed, and birthdays arrive for everyone rather than only
      // the people v1 happened to enrich.
      //
      // v2 is OAuth-gated: an unauthorized (or expired) connection throws here.
      // Falling back to v1 keeps roster import working through a v2 outage or a
      // flag flipped before an admin has authorized, instead of 500ing a feature
      // that worked the day before.
      try {
        const members = await createCCBv2Client(ctx).getGroupParticipants(String(groupId));
        // v1 drops inactive members inside enrichRosterWithPhones; v2 returns
        // them. Filter here so flipping the flag doesn't quietly start texting
        // people who left the group.
        enriched = members.filter(m => m.isActive !== false);
      } catch (v2Error) {
        console.warn(
          'CCB v2 group roster failed, falling back to v1:',
          v2Error instanceof Error ? v2Error.message : v2Error,
        );
        enriched = await fetchViaV1();
        usedFallback = true;
      }
    } else {
      enriched = await fetchViaV1();
    }

    /**
     * The group's name, on request only.
     *
     * It costs a second CCB call, and most callers here only want the people —
     * so this stays opt-in rather than becoming a cost every roster pull pays.
     * Pulse's campaigns ask for it because a person's invite group is a
     * dimension they roll up by ("LVT | Circles" → Lewisville), and an admin
     * shouldn't have to re-type a name CCB already knows. A failure to resolve
     * it is not a failure to fetch the roster, so it degrades to null.
     */
    let groupName: string | null = null;
    if (includeGroupName === true) {
      try {
        groupName = await createCCBClient(ctx).getGroupName(String(groupId));
      } catch {
        groupName = null;
      }
    }

    return NextResponse.json({
      success: true,
      data: enriched,
      count: enriched.length,
      groupName,
      // True when CCB_API_VERSION is v2 but the v2 call failed and v1 served
      // this response. Surfaces a silent degradation (missing birthdays, slow
      // N+1 enrichment) that would otherwise look like a normal success.
      ...(usedFallback ? { apiFallback: 'v1' } : {}),
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
