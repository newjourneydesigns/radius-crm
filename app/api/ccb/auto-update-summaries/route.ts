import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { createCCBClient, CCBCircuitBreakerError } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import type { EventSummaryState } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type ConflictItem = {
  leader_id: number;
  leader_name: string;
  current_state: EventSummaryState;
  ccb_state: EventSummaryState;
};

/**
 * POST /api/ccb/auto-update-summaries
 *
 * Fetches CCB attendance profiles for a week, then auto-applies states:
 *   - CCB report exists + did_not_meet=false → 'received'
 *   - CCB report exists + did_not_meet=true  → 'did_not_meet'
 *   - No CCB report → skip (leave unchanged)
 *
 * Leaders already set to a non-'not_received' state are NOT overwritten.
 * If CCB disagrees with an existing manual state, the leader is returned
 * in the `conflicts` array for review.
 *
 * Body: {
 *   week_start_date:  string;   // YYYY-MM-DD
 *   week_end_date:    string;   // YYYY-MM-DD
 *   leader_ids:       number[];
 *   is_current_week:  boolean;  // true → update circle_leaders; false → update snapshots
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { week_start_date, week_end_date, leader_ids, is_current_week } = body as {
      week_start_date: string;
      week_end_date: string;
      leader_ids: number[];
      is_current_week: boolean;
    };

    if (
      !week_start_date || !/^\d{4}-\d{2}-\d{2}$/.test(week_start_date) ||
      !week_end_date   || !/^\d{4}-\d{2}-\d{2}$/.test(week_end_date)   ||
      !Array.isArray(leader_ids) || leader_ids.length === 0
    ) {
      return NextResponse.json(
        { error: 'week_start_date, week_end_date, and leader_ids[] are required' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    const debugMode = new URL(request.url).searchParams.get('debug') === '1';

    // Load leader names (and optional CCB group name override)
    const { data: leaders, error: leaderError } = await supabase
      .from('circle_leaders')
      .select('id, name, circle_name, ccb_group_name, ccb_group_id, ccb_event_ids')
      .in('id', leader_ids);

    if (leaderError || !leaders || leaders.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch leaders' }, { status: 500 });
    }

    // Match priority: ccb_group_id → ccb_event_ids → ccb_group_name → leader.name
    const ccb = createCCBClient(await getCCBRequestContext(request, {
      module: 'Dashboard',
      action: 'Auto Update Summaries',
      direction: 'pull',
    }));
    const debug: { eventSample?: any[]; perLeader?: any[]; totalEvents?: number } | undefined = debugMode ? {} : undefined;
    const leaderMatchInputs = leaders.map(l => ({
      id: l.id,
      name: l.name,
      ccb_group_name: l.ccb_group_name || l.circle_name || null,
      ccb_group_id: l.ccb_group_id || null,
      ccb_event_ids: (l as any).ccb_event_ids || null,
    }));

    // Cache-first read. Look for any fresh `ccb_group_events_cache` row whose
    // window contains the requested (week_start, week_end). Daily bulk sync
    // populates these rows for every active group; one row carries the bulk
    // attendance XML for the whole 8-week window.
    const SHARED_CACHE_FRESH_MS = 24 * 60 * 60_000;
    let ccbSource: 'cache' | 'live' | 'live_fallback_after_breaker' = 'live';
    let ccbMap: Awaited<ReturnType<typeof ccb.checkReportsForLeaders>> | null = null;
    let cacheAgeMs: number | null = null;

    {
      const { data: cacheRow } = await supabase
        .from('ccb_group_events_cache')
        .select('attendance_xml, synced_at')
        .lte('start_date', week_start_date)
        .gte('end_date', week_end_date)
        .not('attendance_xml', 'is', null)
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cacheRow?.synced_at && cacheRow.attendance_xml) {
        const ageMs = Date.now() - new Date(cacheRow.synced_at).getTime();
        if (ageMs < SHARED_CACHE_FRESH_MS) {
          ccbMap = ccb.matchAttendanceXml(cacheRow.attendance_xml, leaderMatchInputs, debug, { startDate: week_start_date, endDate: week_end_date });
          ccbSource = 'cache';
          cacheAgeMs = ageMs;
        }
      }
    }

    // Cache miss / stale → live CCB pull. Circuit breaker may refuse this; if
    // so, surface a clear 503 rather than partial updates.
    if (!ccbMap) {
      try {
        ccbMap = await ccb.checkReportsForLeaders(
          leaderMatchInputs,
          week_start_date,
          week_end_date,
          debug
        );
      } catch (e: any) {
        if (e instanceof CCBCircuitBreakerError) {
          return NextResponse.json(
            { error: 'Rate-limited by CCB safety net. Please try again in a minute.', breaker: e.stats },
            { status: 503 }
          );
        }
        throw e;
      }
    }

    // Load current states
    let currentStateMap = new Map<number, EventSummaryState>();

    if (is_current_week) {
      const { data: rows } = await supabase
        .from('circle_leaders')
        .select('id, event_summary_state, event_summary_state_week')
        .in('id', leader_ids);
      for (const row of rows ?? []) {
        // Treat state as not_received if it was set in a different week — the UI does the same.
        const stateIsCurrentWeek = row.event_summary_state_week === week_start_date;
        const effectiveState = stateIsCurrentWeek
          ? (row.event_summary_state ?? 'not_received') as EventSummaryState
          : 'not_received';
        currentStateMap.set(row.id, effectiveState);
      }
    } else {
      const { data: rows } = await supabase
        .from('event_summary_snapshots')
        .select('circle_leader_id, event_summary_state')
        .eq('week_start_date', week_start_date)
        .in('circle_leader_id', leader_ids);
      for (const row of rows ?? []) {
        currentStateMap.set(row.circle_leader_id, row.event_summary_state as EventSummaryState);
      }
    }

    // Classify each leader
    const toUpdate: Array<{ id: number; state: EventSummaryState }> = [];
    const conflicts: ConflictItem[] = [];
    let skipped = 0;

    for (const leader of leaders) {
      const ccbData = ccbMap.get(leader.id);
      if (!ccbData?.hasReport) {
        skipped++;
        continue; // No CCB report — leave as-is (may be caught by attendance fallback below)
      }

      const ccbState: EventSummaryState = ccbData.didNotMeet ? 'did_not_meet' : 'received';

      // If CCB says "did not meet", only apply it if the occurrence date is in the past.
      // CCB pre-creates attendance records before meetings happen and defaults them to
      // did_not_meet. If the date is today or later, or unknown (null), skip it —
      // the meeting may not have happened yet.
      if (ccbState === 'did_not_meet') {
        const today = DateTime.now().toISODate()!;
        if (!ccbData.occurrenceDate || ccbData.occurrenceDate >= today) {
          skipped++;
          continue;
        }
      }

      const currentState = currentStateMap.get(leader.id) ?? 'not_received';

      if (currentState === 'not_received') {
        toUpdate.push({ id: leader.id, state: ccbState });
      } else if (currentState !== ccbState) {
        conflicts.push({
          leader_id: leader.id,
          leader_name: leader.name,
          current_state: currentState,
          ccb_state: ccbState,
        });
      }
      // If currentState === ccbState: already correct, nothing to do
    }

    // Fallback: mark received for leaders still not_received who have attendance data
    // in circle_meeting_occurrences for this week — covers cases where CCB report
    // hasn't been submitted yet but the meeting clearly happened.
    const stillNotReceived = leaders.filter(l =>
      !toUpdate.find(u => u.id === l.id) &&
      (currentStateMap.get(l.id) ?? 'not_received') === 'not_received'
    );

    if (stillNotReceived.length > 0) {
      const { data: occurrences } = await supabase
        .from('circle_meeting_occurrences')
        .select('leader_id')
        .in('leader_id', stillNotReceived.map(l => l.id))
        .eq('status', 'met')
        .gte('meeting_date', week_start_date)
        .lte('meeting_date', week_end_date);

      for (const occ of occurrences ?? []) {
        toUpdate.push({ id: occ.leader_id, state: 'received' });
      }
    }

    // Apply updates
    if (toUpdate.length > 0) {
      if (is_current_week) {
        // Update each leader individually (different states)
        const received = toUpdate.filter(u => u.state === 'received').map(u => u.id);
        const didNotMeet = toUpdate.filter(u => u.state === 'did_not_meet').map(u => u.id);

        if (received.length > 0) {
          await supabase
            .from('circle_leaders')
            .update({ event_summary_state: 'received', event_summary_state_week: week_start_date })
            .in('id', received);
        }
        if (didNotMeet.length > 0) {
          await supabase
            .from('circle_leaders')
            .update({ event_summary_state: 'did_not_meet', event_summary_state_week: week_start_date })
            .in('id', didNotMeet);
        }
      } else {
        // Upsert into snapshots — preserve existing state for leaders not in toUpdate
        const upsertRows = toUpdate.map(u => ({
          week_start_date,
          week_end_date,
          circle_leader_id: u.id,
          event_summary_state: u.state,
          ccb_report_available: true,
          captured_at: new Date().toISOString(),
        }));

        await supabase
          .from('event_summary_snapshots')
          .upsert(upsertRows, { onConflict: 'week_start_date,circle_leader_id' });
      }
    }

    // Save occurrence data from CCB — attendance_profiles is the authoritative source
    // for headcount, has_notes, and guest_count, so always overwrite.
    const occurrenceRows = leaders
      .map(l => {
        const ccbData = ccbMap.get(l.id);
        if (!ccbData?.hasReport) return null;
        return {
          leader_id: l.id,
          meeting_date: ccbData.occurrenceDate ?? week_start_date,
          status: (ccbData.didNotMeet ? 'did_not_meet' : 'met') as 'met' | 'did_not_meet',
          headcount: ccbData.headcount,
          has_notes: ccbData.hasNotes,
          guest_count: ccbData.guestCount,
          source: 'ccb' as const,
          synced_at: new Date().toISOString(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (occurrenceRows.length > 0) {
      await supabase
        .from('circle_meeting_occurrences')
        .upsert(occurrenceRows, { onConflict: 'leader_id,meeting_date' });
    }

    return NextResponse.json({
      updated: toUpdate.length,
      skipped,
      conflicts,
      updated_leaders: toUpdate.map(u => ({ id: u.id, state: u.state })),
      ccb_source: ccbSource,
      ccb_cache_age_ms: cacheAgeMs,
      ...(debug ? { debug } : {}),
    });
  } catch (err: any) {
    console.error('[auto-update-summaries POST]', err);
    return NextResponse.json(
      { error: err.message || 'Failed to auto-update summaries' },
      { status: 500 }
    );
  }
}
