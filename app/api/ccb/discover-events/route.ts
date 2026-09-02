import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { syncRosterCacheForLeader } from '../../../../lib/ccb/roster-cache';

export const dynamic = 'force-dynamic';
// A forced run walks every active leader at 2s apart (~70 leaders ≈ 2.5 min).
// Nothing else in this repo pins a function timeout, so set the documented
// knob explicitly rather than trust the platform default to be long enough —
// leader order is stable, so a mid-loop kill would re-do the same prefix
// every night and never reach the tail.
export const maxDuration = 300;

/**
 * POST /api/ccb/discover-events
 *
 * Discovers the CCB event IDs belonging to each circle leader's group and
 * caches them in circle_leaders.ccb_event_ids, so the attendance sync never
 * needs to call event_profiles per-leader.
 *
 * Runs NIGHTLY with ?force=true (netlify/functions/discover-events.ts).
 * It used to be one-time: without `force` it only fills leaders whose list
 * is NULL, so a populated-but-stale list — a CCB event renamed or re-created
 * under a new id — was never revisited, the sync stopped seeing that
 * leader's meetings, and an on-time summary read as missing downstream.
 * Forcing nightly is safe because of the guards in the loop below: a failed
 * lookup keeps the existing ids, and NULL is written only when a lookup
 * succeeds and finds no events.
 *
 * Query params:
 *   ?force=true  — re-discover even if ccb_event_ids is already set
 *   ?leaderId=X  — discover for a single leader only (always forces)
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
  // Auth: cron secret first (the nightly path), then a signed-in RADIUS admin
  // so staff can re-discover a leader on demand — right after fixing a CCB
  // event — without handling CRON_SECRET. Same pattern as prewarm and the
  // student sync. Order matters: both arrive in the same Authorization header
  // and the cron secret is not a JWT.
  //
  // Also closes a hole the old check had: with CRON_SECRET unset it skipped
  // auth entirely and the route was open. Now an unset secret only means the
  // cron path can't authenticate — admins still can, and nobody else.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  let authorized = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!authorized) {
    const admin = await verifyAdminAccess(request);
    authorized = admin.isAdmin;
  }
  if (!authorized) {
    if (!cronSecret) {
      console.error('[discover-events] CRON_SECRET is not configured; the scheduled run cannot authenticate.');
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    ccbClient = createCCBClient(await getCCBRequestContext(request, {
      module: 'Admin',
      action: 'Discover Events',
      direction: 'pull',
    }));
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
    rosterRefreshed: 0,
    rosterErrors: 0,
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

      // A failed lookup must not touch the stored value — writing [] here used
      // to permanently blank a leader's event IDs on one transient CCB error,
      // and [] (unlike NULL) is invisible to the re-discovery filter above.
      if (eventIds === null) {
        console.error(`Event lookup failed for ${leader.name} (group ${groupId}); keeping existing event IDs`);
        results.errors++;
        continue;
      }

      // Store NULL (not []) when the group has no events, so the leader stays
      // eligible for future discovery runs.
      const { error: updateError } = await supabase
        .from('circle_leaders')
        .update({ ccb_event_ids: eventIds.length > 0 ? eventIds : null })
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

      // Also refresh roster cache for this leader's group. Members absent
      // from the fresh CCB roster are deactivated (see roster-cache.ts).
      try {
        const participants = await ccbClient.getGroupParticipants(String(groupId));
        const roster = await syncRosterCacheForLeader(supabase, leader.id, String(groupId), participants);

        if (roster.error) {
          console.error(`Roster cache error for ${leader.name}:`, roster.error);
          results.rosterErrors++;
        } else if (roster.upserted > 0) {
          console.log(`  ✅ Roster refreshed for ${leader.name}: ${roster.upserted} members, ${roster.deactivated} departed`);
          results.rosterRefreshed++;
        }
      } catch (rosterErr) {
        console.error(`Roster fetch failed for ${leader.name}:`, rosterErr);
        results.rosterErrors++;
      }
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
