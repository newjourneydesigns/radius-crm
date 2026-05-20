/**
 * POST /api/circle-summary/prewarm
 *
 * Daily bulk sync (cron-triggered, ~4 AM CT) — pulls CCB attendance + per-group
 * calendar events for the last 8 weeks and writes them to
 * `ccb_group_events_cache`. Reads (Circle Summary, dashboard auto-update) serve
 * from that cache by default.
 *
 * Replaces the old every-10-min prewarm that bled CCB's rate limit. The big
 * efficiency win: `attendance_profiles` returns ALL events for the date window
 * in a single call — the old code was calling it once per group.
 *
 * Requires `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createCCBClient, CCBCircuitBreakerError } from '../../../../lib/ccb/ccb-client';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

// Pace per-group calendar fetches so we stay UNDER the 40/min circuit breaker
// in lib/ccb/ccb-client.ts. 1.6s gap → ~37 calls/min, safely below 40.
const PER_GROUP_DELAY_MS = 1600;
// Max groups to refresh per run. With 1.6s pacing and 300+ active groups, a
// single run would exceed Netlify's serverless function timeout. We rotate
// by oldest-cached-first so every group gets refreshed within a few days,
// and reads fall through to live CCB (throttled by the breaker) for any
// uncached groups in the meantime.
const MAX_GROUPS_PER_RUN = 200;

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
    .select('ccb_group_id, status, circle_summary_access_enabled')
    .not('ccb_group_id', 'is', null)
    .neq('status', 'archive')
    .neq('status', 'archived');

  if (leadersErr) {
    console.error('[daily-bulk-sync] failed to load leaders:', leadersErr);
    return NextResponse.json({ error: leadersErr.message }, { status: 500 });
  }

  const allGroupIds = Array.from(
    new Set(
      (leaders || [])
        .filter((l: any) => l.circle_summary_access_enabled !== false)
        .map((l: any) => String(l.ccb_group_id))
        .filter(Boolean)
    )
  );

  // Rotation: refresh the groups whose cached row is oldest (or missing) first.
  // Anything not refreshed in this run will be picked up by a subsequent run.
  const { data: existingCacheRows } = await supabase
    .from('ccb_group_events_cache')
    .select('group_id, synced_at')
    .in('group_id', allGroupIds);

  const lastSyncByGroup = new Map<string, number>();
  for (const row of existingCacheRows ?? []) {
    lastSyncByGroup.set(String(row.group_id), new Date(row.synced_at).getTime());
  }

  const groupIds = allGroupIds
    .map((id) => ({ id, lastSync: lastSyncByGroup.get(id) ?? 0 }))
    .sort((a, b) => a.lastSync - b.lastSync)
    .slice(0, limitOverride)
    .map((g) => g.id);

  const end = DateTime.now().setZone('America/Chicago');
  const start = end.minus({ weeks: 8 });
  const startStr = start.toFormat('yyyy-LL-dd');
  const endStr = end.toFormat('yyyy-LL-dd');

  const ccb = createCCBClient({
    module: 'circle-summary',
    action: 'daily-bulk-sync',
  });

  // ONE bulk attendance call for the entire 8-week window. Same payload is
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
    totalActiveGroups: allGroupIds.length,
    groupsThisRun: groupIds.length,
    warmed,
    bulkAttendanceFetched: !!bulkAttendanceXml,
    breakerTripped,
    errors,
    window: { startStr, endStr },
  });
}
