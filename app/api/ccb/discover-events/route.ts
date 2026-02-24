import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ccb/discover-events
 *
 * One-time (or periodic) endpoint that discovers the CCB event IDs
 * belonging to each circle leader's group, then caches them in
 * circle_leaders.ccb_event_ids so the daily attendance sync never
 * needs to call event_profiles per-leader again.
 *
 * Query params:
 *   ?force=true  — re-discover even if ccb_event_ids is already set
 *   ?leaderId=X  — discover for a single leader only
 *
 * Auth: Bearer CRON_SECRET
 *
 * CCB cost: 1 API call per leader (event_profiles?group_id=X)
 * Throttle: 2 seconds between calls to avoid rate limiting
 */

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const THROTTLE_MS = 2000; // 2 seconds between CCB calls

export async function POST(request: NextRequest) {
  // Auth
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = getServiceClient();
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';
  const singleLeaderId = url.searchParams.get('leaderId');

  // Load leaders with a CCB group ID
  let query = supabase
    .from('circle_leaders')
    .select('id, name, ccb_group_id, ccb_event_ids, status')
    .not('ccb_group_id', 'is', null);

  if (singleLeaderId) {
    query = query.eq('id', parseInt(singleLeaderId, 10));
  }

  // Unless forcing, only get leaders without cached event IDs
  if (!force && !singleLeaderId) {
    query = query.is('ccb_event_ids', null);
  }

  const { data: leaders, error: leadersError } = await query;

  if (leadersError || !leaders) {
    return NextResponse.json(
      { error: 'Failed to load leaders', details: leadersError },
      { status: 500 }
    );
  }

  // Filter out truly inactive leaders
  const activeLeaders = singleLeaderId
    ? leaders
    : leaders.filter(
        (l: any) => !['Inactive', 'Removed', 'off-boarding'].includes(l.status || '')
      );

  let ccbClient: ReturnType<typeof createCCBClient>;
  try {
    ccbClient = createCCBClient();
  } catch (err: any) {
    return NextResponse.json(
      { error: 'CCB client initialization failed', details: err.message },
      { status: 500 }
    );
  }

  const results = {
    processed: 0,
    discovered: 0,
    noEvents: 0,
    errors: 0,
    details: [] as { leader: string; groupId: string; eventIds: string[] }[],
  };

  console.log(`🔍 Discovering event IDs for ${activeLeaders.length} leaders…`);

  for (let i = 0; i < activeLeaders.length; i++) {
    const leader = activeLeaders[i];
    const groupId = leader.ccb_group_id;

    if (!groupId) continue;

    // Throttle between calls
    if (i > 0) {
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }

    results.processed++;

    try {
      const eventIds = await ccbClient.getGroupEventIds(groupId);

      // Save to DB
      const { error: updateError } = await supabase
        .from('circle_leaders')
        .update({ ccb_event_ids: eventIds.length > 0 ? eventIds : [] })
        .eq('id', leader.id);

      if (updateError) {
        console.error(`Failed to update leader ${leader.id}:`, updateError);
        results.errors++;
        continue;
      }

      if (eventIds.length > 0) {
        results.discovered++;
      } else {
        results.noEvents++;
      }

      results.details.push({
        leader: leader.name,
        groupId,
        eventIds,
      });

      console.log(
        `  ${i + 1}/${activeLeaders.length} ${leader.name} (group ${groupId}): ${eventIds.length} events`
      );
    } catch (err: any) {
      console.error(`Error discovering events for ${leader.name}:`, err.message);
      results.errors++;
    }
  }

  console.log(
    `✅ Discovery complete: ${results.discovered} leaders with events, ` +
      `${results.noEvents} without, ${results.errors} errors`
  );

  return NextResponse.json({ success: true, ...results });
}

/**
 * GET /api/ccb/discover-events
 *
 * Check which leaders are missing cached event IDs.
 */
export async function GET() {
  const supabase = getServiceClient();

  const { data: missing } = await supabase
    .from('circle_leaders')
    .select('id, name, ccb_group_id, status')
    .not('ccb_group_id', 'is', null)
    .is('ccb_event_ids', null);

  const { data: discovered } = await supabase
    .from('circle_leaders')
    .select('id, name, ccb_group_id, ccb_event_ids')
    .not('ccb_group_id', 'is', null)
    .not('ccb_event_ids', 'is', null);

  return NextResponse.json({
    missing: missing?.length ?? 0,
    discovered: discovered?.length ?? 0,
    missingLeaders: missing?.map((l: any) => ({
      id: l.id,
      name: l.name,
      groupId: l.ccb_group_id,
    })),
    discoveredLeaders: discovered?.map((l: any) => ({
      id: l.id,
      name: l.name,
      groupId: l.ccb_group_id,
      eventCount: l.ccb_event_ids?.length ?? 0,
    })),
  });
}
