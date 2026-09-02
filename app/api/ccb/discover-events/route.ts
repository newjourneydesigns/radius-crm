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
 * Two modes:
 *
 *   ?source=calendar  — FAST, no CCB. Derives each leader's event ids from
 *       the group's cached calendar (ccb_group_events_cache.calendar_events,
 *       kept fresh by prewarm and by every live read of the events page) and
 *       UNIONS them into ccb_event_ids. Never removes an id — monotonic, so a
 *       bad cache row cannot drop a tracked event; a stale extra is harmless
 *       because the sync simply finds no records for it. This is what the
 *       nightly job runs (netlify/functions/discover-events.ts). Seconds.
 *
 *   default           — CCB. Walks leaders calling event_profiles (and a
 *       roster refresh) per group, 2s apart. Correct but SLOW: ~4 min for the
 *       whole church, and Netlify terminates synchronous invocations at 10s
 *       (free) / 26s (paid) — `maxDuration` does not raise that ceiling. A
 *       forced full run from a browser or a scheduled fetch 504s partway
 *       through; use it only with ?leaderId=X (one leader, one call).
 *
 * Why this exists: without `force` the CCB mode only fills leaders whose
 * list is NULL, so a populated-but-stale list — a CCB event renamed or
 * re-created under a new id — was never revisited, the sync stopped seeing
 * that leader's meetings, and an on-time summary read as missing downstream.
 *
 * Query params:
 *   ?source=calendar — derive from cached calendars (all active leaders)
 *   ?force=true      — CCB mode: re-discover even if ccb_event_ids is set
 *   ?leaderId=X      — CCB mode: one leader only (always forces)
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

type CachedCalendarRow = {
  group_id: string | number;
  calendar_events: unknown;
  synced_at: string | null;
};

/**
 * Calendar mode. For every active leader with a CCB group, union the event
 * ids found in that group's freshest cached calendar into ccb_event_ids.
 * No CCB calls, three Supabase round trips, seconds — immune to the
 * synchronous-invocation timeout that kills the CCB walk.
 */
async function deriveEventIdsFromCalendars(supabase: ReturnType<typeof getServiceClient>) {
  const results = {
    source: 'calendar' as const,
    leaders: 0,
    groupsWithCalendar: 0,
    updated: 0,
    unchanged: 0,
    noCalendar: 0,
    errors: 0,
    details: [] as { leader: string; groupId: string; added: string[] }[],
  };

  const { data: leaders, error: leadersError } = await supabase
    .from('circle_leaders')
    .select('id, name, ccb_group_id, ccb_event_ids, status')
    .not('ccb_group_id', 'is', null);
  if (leadersError || !leaders) {
    return { ...results, errors: 1, error: leadersError?.message ?? 'Failed to load leaders' };
  }

  const active = leaders.filter(
    (l: any) => !['Inactive', 'Removed', 'off-boarding'].includes(l.status || '')
  );
  results.leaders = active.length;

  const groupIds = Array.from(new Set(active.map((l: any) => String(l.ccb_group_id)).filter(Boolean)));
  if (groupIds.length === 0) return results;

  // Every cached window for these groups; keep the freshest per group.
  const { data: cacheRows, error: cacheError } = await supabase
    .from('ccb_group_events_cache')
    .select('group_id, calendar_events, synced_at')
    .in('group_id', groupIds);
  if (cacheError) {
    return { ...results, errors: 1, error: cacheError.message };
  }

  const freshest = new Map<string, CachedCalendarRow>();
  for (const row of (cacheRows ?? []) as CachedCalendarRow[]) {
    const gid = String(row.group_id);
    const prior = freshest.get(gid);
    const t = row.synced_at ? new Date(row.synced_at).getTime() : 0;
    const pt = prior?.synced_at ? new Date(prior.synced_at).getTime() : -1;
    if (!prior || t > pt) freshest.set(gid, row);
  }
  results.groupsWithCalendar = freshest.size;

  for (const leader of active as any[]) {
    const gid = String(leader.ccb_group_id);
    const row = freshest.get(gid);
    const events = Array.isArray(row?.calendar_events) ? (row!.calendar_events as any[]) : [];
    if (events.length === 0) {
      results.noCalendar++;
      continue;
    }

    const existing = new Set<string>(
      (Array.isArray(leader.ccb_event_ids) ? leader.ccb_event_ids : [])
        .map((id: unknown) => String(id).trim())
        .filter(Boolean)
    );
    const fromCalendar = new Set<string>(
      events.map((e) => String(e?.eventId ?? '').trim()).filter(Boolean)
    );
    const added = Array.from(fromCalendar).filter((id) => !existing.has(id));
    if (added.length === 0) {
      results.unchanged++;
      continue;
    }

    const merged = Array.from(new Set(Array.from(existing).concat(Array.from(fromCalendar)))).sort();
    const { error: updateError } = await supabase
      .from('circle_leaders')
      .update({ ccb_event_ids: merged })
      .eq('id', leader.id);
    if (updateError) {
      console.error(`[discover-events:calendar] update failed for ${leader.name}:`, updateError.message);
      results.errors++;
      continue;
    }
    results.updated++;
    results.details.push({ leader: leader.name, groupId: gid, added });
    console.log(`[discover-events:calendar] ${leader.name} (group ${gid}): +${added.join(',')}`);
  }

  console.log(
    `[discover-events:calendar] ${results.leaders} leaders, ${results.updated} updated, ` +
      `${results.unchanged} unchanged, ${results.noCalendar} without a cached calendar, ${results.errors} errors`
  );
  return results;
}

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

  if (url.searchParams.get('source') === 'calendar') {
    return NextResponse.json(await deriveEventIdsFromCalendars(supabase));
  }

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
