/**
 * POST /api/ccb/reset-false-received
 *
 * One-off cleanup for leaders that were incorrectly marked "received" by the
 * old auto-update logic (before commit ea98324, which started requiring
 * evidence of actual submission). Re-checks each currently-received leader
 * against fresh CCB attendance data; any leader whose CCB record lacks
 * evidence (no notes, zero headcount, not explicit did_not_meet) gets reset.
 *
 * Reads from `ccb_group_events_cache` if a fresh row exists; otherwise pulls
 * live CCB (subject to the circuit breaker). NEVER hits CCB for the per-leader
 * matching — uses the bulk attendance XML.
 *
 * Body / query params:
 *   - week_start_date, week_end_date (YYYY-MM-DD): defaults to current week
 *     (Mon–Sun in America/Chicago).
 *   - apply=1: actually perform the reset. Without it, runs as dry-run.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createCCBClient, CCBCircuitBreakerError } from '../../../../lib/ccb/ccb-client';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (auth !== `Bearer ${expected}`) return unauthorized();

  const url = new URL(req.url);
  const apply = url.searchParams.get('apply') === '1';
  const stateWeekFilter = url.searchParams.get('state_week'); // optional: limit to one state_week

  const supabase = createServiceSupabaseClient();

  // Load every leader currently marked received. If state_week filter is
  // provided, only consider that week — otherwise re-check every received
  // leader regardless of which week they were marked for.
  let query = supabase
    .from('circle_leaders')
    .select('id, name, ccb_group_id, ccb_group_name, circle_name, ccb_event_ids, event_summary_state, event_summary_state_week')
    .eq('event_summary_state', 'received');
  if (stateWeekFilter) query = query.eq('event_summary_state_week', stateWeekFilter);

  const { data: receivedLeaders, error: leadersErr } = await query;

  if (leadersErr) {
    return NextResponse.json({ error: leadersErr.message }, { status: 500 });
  }
  if (!receivedLeaders || receivedLeaders.length === 0) {
    return NextResponse.json({ ok: true, candidates: 0, message: 'No leaders currently in received state.' });
  }

  // Group leaders by their state_week so we fetch attendance once per week.
  const byWeek = new Map<string, typeof receivedLeaders>();
  for (const leader of receivedLeaders) {
    const week = leader.event_summary_state_week;
    if (!week) continue;
    const arr = byWeek.get(week) ?? [];
    arr.push(leader);
    byWeek.set(week, arr);
  }

  if (byWeek.size === 0) {
    return NextResponse.json({ ok: true, candidates: receivedLeaders.length, message: 'No received leaders have a state_week set; nothing to verify.' });
  }

  const SHARED_CACHE_FRESH_MS = 24 * 60 * 60_000;
  const ccb = createCCBClient({ module: 'cleanup', action: 'reset-false-received' });

  // One pass per distinct state_week. For each: pull attendance XML for that
  // week (cache-first, live fallback) and re-validate every leader stamped to
  // that week.
  const toReset: Array<{ id: number; name: string; stateWeek: string; reason: string }> = [];
  const kept: Array<{ id: number; name: string; stateWeek: string; reason: string }> = [];
  const perWeekDiagnostics: Array<{ stateWeek: string; weekEnd: string; attendanceSource: 'cache' | 'live'; reviewed: number }> = [];

  for (const [stateWeek, weekLeaders] of Array.from(byWeek.entries())) {
    const weekEnd = DateTime.fromFormat(stateWeek, 'yyyy-LL-dd').plus({ days: 6 }).toFormat('yyyy-LL-dd');

    let attendanceXml: any = null;
    let attendanceSource: 'cache' | 'live' = 'live';

    const { data: cacheRow } = await supabase
      .from('ccb_group_events_cache')
      .select('attendance_xml, synced_at')
      .lte('start_date', stateWeek)
      .gte('end_date', weekEnd)
      .not('attendance_xml', 'is', null)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cacheRow?.synced_at && cacheRow.attendance_xml) {
      const ageMs = Date.now() - new Date(cacheRow.synced_at).getTime();
      if (ageMs < SHARED_CACHE_FRESH_MS) {
        attendanceXml = cacheRow.attendance_xml;
        attendanceSource = 'cache';
      }
    }

    if (!attendanceXml) {
      try {
        attendanceXml = await (ccb as any).getXml({
          srv: 'attendance_profiles',
          start_date: stateWeek,
          end_date: weekEnd,
        });
      } catch (e: any) {
        if (e instanceof CCBCircuitBreakerError) {
          return NextResponse.json({ error: 'CCB circuit breaker tripped', details: e.message }, { status: 503 });
        }
        return NextResponse.json({ error: e?.message || `CCB fetch failed for week ${stateWeek}` }, { status: 500 });
      }
    }

    const ccbMap = ccb.matchAttendanceXml(
      attendanceXml,
      weekLeaders.map((l: any) => ({
        id: l.id,
        name: l.name,
        ccb_group_name: l.ccb_group_name || l.circle_name || null,
        ccb_group_id: l.ccb_group_id || null,
        ccb_event_ids: l.ccb_event_ids || null,
      }))
    );

    for (const leader of weekLeaders) {
      const ccbData = ccbMap.get(leader.id);
      if (!ccbData?.hasReport) {
        toReset.push({
          id: leader.id,
          name: leader.name,
          stateWeek,
          reason: 'no CCB event match with evidence (no notes, no headcount, not explicit did-not-meet)',
        });
      } else {
        kept.push({
          id: leader.id,
          name: leader.name,
          stateWeek,
          reason: `evidence present (headcount=${ccbData.headcount ?? 0}, notes=${ccbData.hasNotes}, didNotMeet=${ccbData.didNotMeet})`,
        });
      }
    }

    perWeekDiagnostics.push({ stateWeek, weekEnd, attendanceSource, reviewed: weekLeaders.length });
  }

  let appliedLeaderReset = 0;
  let appliedOccurrenceDelete = 0;
  if (apply && toReset.length > 0) {
    const ids = toReset.map((r) => r.id);

    const { error: updErr } = await supabase
      .from('circle_leaders')
      .update({ event_summary_state: 'not_received', event_summary_state_week: null })
      .in('id', ids);
    if (updErr) {
      return NextResponse.json({ error: `Leader reset failed: ${updErr.message}` }, { status: 500 });
    }
    appliedLeaderReset = ids.length;

    // Delete bogus circle_meeting_occurrences rows: status='met' with ZERO
    // evidence. These are the companion rows the old auto-update wrote for
    // the same false positives. Scoped per state_week so we don't reach
    // beyond the corrupted data.
    for (const { stateWeek, weekEnd } of perWeekDiagnostics) {
      const weekIds = toReset.filter((r) => r.stateWeek === stateWeek).map((r) => r.id);
      if (weekIds.length === 0) continue;

      const { count: occDelCount, error: delErr } = await supabase
        .from('circle_meeting_occurrences')
        .delete({ count: 'exact' })
        .in('leader_id', weekIds)
        .eq('source', 'ccb')
        .eq('status', 'met')
        .gte('meeting_date', stateWeek)
        .lte('meeting_date', weekEnd)
        .is('headcount', null)
        .eq('has_notes', false)
        .eq('guest_count', 0);

      if (delErr) {
        return NextResponse.json({ error: `Occurrence cleanup failed for week ${stateWeek}: ${delErr.message}` }, { status: 500 });
      }
      appliedOccurrenceDelete += occDelCount ?? 0;
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun: !apply,
    weeksReviewed: perWeekDiagnostics,
    candidatesReviewed: receivedLeaders.length,
    wouldReset: toReset.length,
    kept: kept.length,
    appliedLeaderReset,
    appliedOccurrenceDelete,
    toReset,
    keptSample: kept.slice(0, 10),
  });
}
