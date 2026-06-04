/**
 * POST /api/circle-leader-toolkit/prewarm
 *
 * Daily bulk sync (cron-triggered, ~4 AM CT). Two halves:
 *
 *   1. ONE global `attendance_profiles` call for the last 12 weeks — covers
 *      every group at once. The dashboard "Auto-Update Summaries" button
 *      reads any fresh cache row's `attendance_xml`, so all leaders' attendance
 *      stays current daily.
 *
 *   2. Per-group calendar refresh ONLY for leaders whose meeting day == today
 *      (in America/Chicago). These are the leaders likely to visit Circle
 *      Summary today/tonight to submit their summary. Other days' groups
 *      keep their existing cache row; the row's bulk attendance still gets
 *      refreshed when their day rolls around. Reads for stale rows fall
 *      through to live CCB, throttled by the circuit breaker.
 *
 *   3. Safety net: rotate in any groups whose cache row is missing or >7
 *      days stale, so groups without a clean `day` value (or with rare
 *      schedules) eventually get warmed too.
 *
 * Requires `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createCCBClient, CCBCircuitBreakerError } from '../../../../lib/ccb/ccb-client';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { computeLastAttended, storeDerivedLastAttended } from '../../../../lib/circle-leader-toolkit/roster-data';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

// Pace per-group calendar fetches so we stay UNDER the 40/min circuit breaker
// in lib/ccb/ccb-client.ts. 1.6s gap → ~37 calls/min, safely below 40.
const PER_GROUP_DELAY_MS = 1600;
// Hard upper bound on per-run groups (safety net cap). Today's-day filtering
// keeps the actual count to ~50-70 in normal operation.
const MAX_GROUPS_PER_RUN = 200;
// Safety net: any group whose cache row hasn't been refreshed in this many
// days gets pulled into the run regardless of its meeting day. Catches groups
// without a `day` value set, or with rare/irregular schedules.
const STALE_FALLBACK_DAYS = 7;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) return unauthorized();

  // Optional override: ?limit=N caps per-run group count (for testing).
  const url = new URL(req.url);
  const limitOverride = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || MAX_GROUPS_PER_RUN, MAX_GROUPS_PER_RUN));

  const supabase = createServiceSupabaseClient();

  const { data: leaders, error: leadersErr } = await supabase
    .from('circle_leaders')
    .select('ccb_group_id, status, circle_summary_access_enabled, day')
    .not('ccb_group_id', 'is', null)
    .neq('status', 'archive')
    .neq('status', 'archived');

  if (leadersErr) {
    console.error('[daily-bulk-sync] failed to load leaders:', leadersErr);
    return NextResponse.json({ error: leadersErr.message }, { status: 500 });
  }

  const activeLeaders = (leaders || []).filter((l: any) => l.circle_summary_access_enabled !== false);

  const allGroupIds = Array.from(
    new Set(activeLeaders.map((l: any) => String(l.ccb_group_id)).filter(Boolean))
  );

  // Determine today's day-of-week in America/Chicago. Optional override:
  // ?day=wednesday for testing.
  const overrideDay = url.searchParams.get('day');
  const todayDayName = (overrideDay
    || DateTime.now().setZone('America/Chicago').toFormat('cccc')
  ).toLowerCase();

  // Groups whose leaders meet today.
  const todayGroupIds = new Set(
    activeLeaders
      .filter((l: any) => typeof l.day === 'string' && l.day.trim().toLowerCase() === todayDayName)
      .map((l: any) => String(l.ccb_group_id))
      .filter(Boolean)
  );

  // Look up cache freshness so we can also pull in stale rows as a safety net.
  const { data: existingCacheRows } = await supabase
    .from('ccb_group_events_cache')
    .select('group_id, synced_at')
    .in('group_id', allGroupIds);

  const lastSyncByGroup = new Map<string, number>();
  for (const row of existingCacheRows ?? []) {
    lastSyncByGroup.set(String(row.group_id), new Date(row.synced_at).getTime());
  }

  const staleThreshold = Date.now() - STALE_FALLBACK_DAYS * 24 * 60 * 60_000;

  // Final set to warm = today's-day groups ∪ stale-cache groups.
  const groupsToWarm = new Set<string>(todayGroupIds);
  for (const id of allGroupIds) {
    const last = lastSyncByGroup.get(id);
    if (last == null || last < staleThreshold) groupsToWarm.add(id);
  }

  // Apply the safety cap. Prefer today's groups; fill remaining slots with
  // the stalest cache rows first.
  const todayList = Array.from(groupsToWarm).filter((id) => todayGroupIds.has(id));
  const staleList = Array.from(groupsToWarm)
    .filter((id) => !todayGroupIds.has(id))
    .sort((a, b) => (lastSyncByGroup.get(a) ?? 0) - (lastSyncByGroup.get(b) ?? 0));

  const groupIds = [...todayList, ...staleList].slice(0, limitOverride);

  const end = DateTime.now().setZone('America/Chicago');
  const start = end.minus({ weeks: 12 });
  const startStr = start.toFormat('yyyy-LL-dd');
  const endStr = end.toFormat('yyyy-LL-dd');

  const ccb = createCCBClient({
    module: 'circle-summary',
    action: 'daily-bulk-sync',
  });

  // ONE bulk attendance call for the entire 12-week window. Same payload is
  // stored on every group's cache row so reads can grab it without joining.
  let bulkAttendanceXml: any = null;
  try {
    bulkAttendanceXml = await (ccb as any).getXml({
      srv: 'attendance_profiles',
      start_date: startStr,
      end_date: endStr,
    });
  } catch (e: any) {
    if (e instanceof CCBCircuitBreakerError) {
      console.error('[daily-bulk-sync] circuit breaker tripped on attendance pull:', e.message);
      return NextResponse.json({ error: 'CCB circuit breaker tripped', details: e.message }, { status: 503 });
    }
    console.error('[daily-bulk-sync] attendance_profiles failed:', e?.message || e);
  }

  // Sequential, explicitly paced. Single worker + 1.6s gap keeps us under the
  // 40/min circuit breaker. Concurrency was the old design's downfall.
  let warmed = 0;
  let breakerTripped = false;
  const errors: Array<{ groupId: string; error: string }> = [];

  for (let i = 0; i < groupIds.length; i++) {
    if (breakerTripped) break;
    const groupId = groupIds[i];
    if (i > 0) await sleep(PER_GROUP_DELAY_MS);

    try {
      const calEvents = await ccb.getGroupCalendarEvents(groupId, startStr, endStr);

      const { error: upsertErr } = await supabase
        .from('ccb_group_events_cache')
        .upsert(
          {
            group_id: groupId,
            start_date: startStr,
            end_date: endStr,
            calendar_events: calEvents ?? [],
            attendance_xml: bulkAttendanceXml ?? null,
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'group_id,start_date,end_date' }
        );

      if (upsertErr) {
        errors.push({ groupId, error: upsertErr.message || 'upsert failed' });
        continue;
      }

      // Tier 3: derive this group's small last-attended map up front so the
      // roster page never has to re-parse the global attendance blob on read.
      // Separate, column-error-tolerant write — never fails the warm.
      if (bulkAttendanceXml) {
        storeDerivedLastAttended(
          supabase,
          groupId,
          startStr,
          endStr,
          computeLastAttended(bulkAttendanceXml, groupId, calEvents ?? [])
        );
      }

      warmed += 1;
    } catch (e: any) {
      if (e instanceof CCBCircuitBreakerError) {
        breakerTripped = true;
        errors.push({ groupId, error: `circuit breaker: ${e.message}` });
        break;
      }
      errors.push({ groupId, error: e?.message || 'unknown' });
    }
  }

  return NextResponse.json({
    ok: true,
    todayDayName,
    totalActiveGroups: allGroupIds.length,
    groupsMeetingToday: todayGroupIds.size,
    staleGroups: staleList.length,
    groupsThisRun: groupIds.length,
    warmed,
    bulkAttendanceFetched: !!bulkAttendanceXml,
    breakerTripped,
    errors,
    window: { startStr, endStr },
  });
}
