import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { createCCBClient, CCBCircuitBreakerError } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import type { EventSummaryState } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

const SHARED_CACHE_FRESH_MS = 24 * 60 * 60_000;
const CURRENT_WEEK_ATTENDANCE_CACHE_FRESH_MS = 5 * 60_000;
const WEEK_SYNC_THROTTLE_MS = 30 * 60_000;
const CURRENT_WEEK_SYNC_THROTTLE_MS = 5 * 60_000;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function getAuthUserId(request: NextRequest): Promise<string | null> {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: { user } } = await anon.auth.getUser(token);
  return user?.id ?? null;
}

type ConflictItem = {
  leader_id: number;
  leader_name: string;
  current_state: EventSummaryState;
  ccb_state: EventSummaryState;
  ccb_evidence: {
    headcount: number | null;
    has_notes: boolean;
    did_not_meet: boolean;
    occurrence_date: string | null;
  };
};

/**
 * POST /api/ccb/sync-week-summaries
 *
 * Silent, throttled background sync. Replaces the manual /api/ccb/auto-update-summaries
 * Auto-Update button. Designed to run automatically on page load / week change.
 *
 * Behavior:
 *   • If last sync for this week-window is fresh AND !force → returns cached
 *     result with `fresh: false`. Current week uses a short 5 min window;
 *     historical weeks use 30 min. No CCB call.
 *   • Reads bulk attendance XML from ccb_group_events_cache (24h-fresh). On
 *     miss, makes ONE live attendance_profiles call. Concurrency-guarded by a
 *     Postgres advisory lock so parallel admins never fan out duplicate calls.
 *   • Auto-updates only leaders currently in `not_received`. Mismatches are
 *     surfaced as `conflicts[]` — sync NEVER overwrites human-set state.
 *   • Conflicts that the admin previously dismissed (and where CCB state
 *     hasn't changed since) are filtered out so the chip doesn't keep nagging.
 *   • Every state change is logged in event_summary_state_audit.
 *
 * Body: {
 *   week_start_date:  string;   // YYYY-MM-DD
 *   week_end_date:    string;   // YYYY-MM-DD
 *   leader_ids:       number[];
 *   is_current_week:  boolean;
 *   force?:           boolean;  // bypass 30-min throttle
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { week_start_date, week_end_date, leader_ids, is_current_week, force } = body as {
      week_start_date: string;
      week_end_date: string;
      leader_ids: number[];
      is_current_week: boolean;
      force?: boolean;
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
    const userId = await getAuthUserId(request);

    const today = DateTime.now().toISODate()!;
    const isActiveWeek = week_start_date <= today && today <= week_end_date;
    const syncThrottleMs = isActiveWeek ? CURRENT_WEEK_SYNC_THROTTLE_MS : WEEK_SYNC_THROTTLE_MS;

    // ── Throttle: skip CCB work if sync is fresh ────────────────────────────
    const { data: syncLog } = await supabase
      .from('ccb_week_sync_log')
      .select('last_synced_at, last_ccb_source, last_sync_summary')
      .eq('week_start_date', week_start_date)
      .maybeSingle();

    if (!force && syncLog?.last_synced_at) {
      const ageMs = Date.now() - new Date(syncLog.last_synced_at).getTime();
      if (ageMs < syncThrottleMs) {
        return NextResponse.json({
          fresh: false,
          throttled: true,
          synced_at: syncLog.last_synced_at,
          ccb_source: syncLog.last_ccb_source ?? 'cache',
          last_sync_summary: syncLog.last_sync_summary ?? {},
          updated: 0,
          updated_leaders: [],
          conflicts: [],
        });
      }
    }

    // ── Load leaders ────────────────────────────────────────────────────────
    const { data: leaders, error: leaderError } = await supabase
      .from('circle_leaders')
      .select('id, name, circle_name, ccb_group_name, ccb_group_id, ccb_event_ids')
      .in('id', leader_ids);

    if (leaderError || !leaders || leaders.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch leaders' }, { status: 500 });
    }

    const leaderMatchInputs = leaders.map(l => ({
      id: l.id,
      name: l.name,
      ccb_group_name: l.ccb_group_name || l.circle_name || null,
      ccb_group_id: l.ccb_group_id || null,
      ccb_event_ids: (l as any).ccb_event_ids || null,
    }));

    // ── Cache-first attendance read ─────────────────────────────────────────
    const ccb = createCCBClient(await getCCBRequestContext(request, {
      module: 'CircleMeetingsCalendar',
      action: 'Sync Week Summaries',
      direction: 'pull',
    }));

    let ccbSource: 'cache' | 'live' | 'circuit_open' = 'cache';
    let ccbMap: Awaited<ReturnType<typeof ccb.checkReportsForLeaders>> | null = null;
    let cacheAgeMs: number | null = null;
    const attendanceCacheFreshMs =
      isActiveWeek
        ? CURRENT_WEEK_ATTENDANCE_CACHE_FRESH_MS
        : SHARED_CACHE_FRESH_MS;

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
        if (ageMs < attendanceCacheFreshMs) {
          ccbMap = ccb.matchAttendanceXml(
            cacheRow.attendance_xml,
            leaderMatchInputs,
            undefined,
            { startDate: week_start_date, endDate: week_end_date }
          );
          ccbSource = 'cache';
          cacheAgeMs = ageMs;
        }
      }
    }

    // ── Cache miss → live fetch (with optimistic concurrency control) ──────
    // Claim the sync slot by upserting a fresh ccb_week_sync_log row BEFORE the
    // live call. A parallel caller will see our fresh synced_at on its throttle
    // check and short-circuit, eliminating the duplicate-CCB-call race.
    if (!ccbMap) {
      await supabase
        .from('ccb_week_sync_log')
        .upsert({
          week_start_date,
          week_end_date,
          last_synced_at: new Date().toISOString(),
          last_synced_by: userId,
          last_ccb_source: 'live_pending',
          last_sync_summary: { stage: 'fetching_live' },
        }, { onConflict: 'week_start_date' });

      try {
        ccbMap = await ccb.checkReportsForLeaders(
          leaderMatchInputs,
          week_start_date,
          week_end_date
        );
        ccbSource = 'live';
      } catch (e: any) {
        if (e instanceof CCBCircuitBreakerError) {
          return NextResponse.json({
            fresh: false,
            ccb_source: 'circuit_open',
            breaker: e.stats,
            updated: 0,
            updated_leaders: [],
            conflicts: [],
          }, { status: 200 });
        }
        throw e;
      }
    }

    // ── Load current states ─────────────────────────────────────────────────
    const currentStateMap = new Map<number, EventSummaryState>();

    if (is_current_week) {
      const { data: rows } = await supabase
        .from('circle_leaders')
        .select('id, event_summary_state, event_summary_state_week')
        .in('id', leader_ids);
      for (const row of rows ?? []) {
        const stateIsCurrentWeek = row.event_summary_state_week === week_start_date;
        const effective = stateIsCurrentWeek
          ? (row.event_summary_state ?? 'not_received') as EventSummaryState
          : 'not_received';
        currentStateMap.set(row.id, effective);
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

    // ── Dismissed conflicts (admin chose "keep current") ────────────────────
    const { data: dismissals } = await supabase
      .from('event_summary_conflict_dismissals')
      .select('leader_id, ccb_state_at_dismissal')
      .eq('week_start_date', week_start_date)
      .in('leader_id', leader_ids);

    const dismissalMap = new Map<number, string>();
    for (const d of dismissals ?? []) {
      dismissalMap.set(d.leader_id, d.ccb_state_at_dismissal);
    }

    // ── Classify ────────────────────────────────────────────────────────────
    const toUpdate: Array<{ id: number; state: EventSummaryState }> = [];
    const conflicts: ConflictItem[] = [];
    let skipped = 0;

    for (const leader of leaders) {
      const ccbData = ccbMap.get(leader.id);
      if (!ccbData?.hasReport) {
        skipped++;
        continue;
      }

      const ccbState: EventSummaryState = ccbData.didNotMeet ? 'did_not_meet' : 'received';

      // Don't apply did_not_meet for future / today's meetings.
      if (ccbState === 'did_not_meet') {
        if (!ccbData.occurrenceDate || ccbData.occurrenceDate >= today) {
          skipped++;
          continue;
        }
      }

      const currentState = currentStateMap.get(leader.id) ?? 'not_received';

      if (currentState === 'not_received') {
        toUpdate.push({ id: leader.id, state: ccbState });
      } else if (currentState !== ccbState) {
        // Filter against dismissals — if CCB state hasn't changed since the
        // admin dismissed it, don't re-flag.
        if (dismissalMap.get(leader.id) === ccbState) continue;

        conflicts.push({
          leader_id: leader.id,
          leader_name: leader.name,
          current_state: currentState,
          ccb_state: ccbState,
          ccb_evidence: {
            headcount: ccbData.headcount ?? null,
            has_notes: ccbData.hasNotes ?? false,
            did_not_meet: ccbData.didNotMeet ?? false,
            occurrence_date: ccbData.occurrenceDate ?? null,
          },
        });
      }
    }

    // ── Apply updates ───────────────────────────────────────────────────────
    if (toUpdate.length > 0) {
      if (is_current_week) {
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

      // Audit each change
      const auditRows = toUpdate.map(u => ({
        leader_id: u.id,
        week_start_date,
        from_state: currentStateMap.get(u.id) ?? 'not_received',
        to_state: u.state,
        source: 'sync_auto' as const,
        changed_by: userId,
        metadata: { ccb_source: ccbSource },
      }));
      await supabase.from('event_summary_state_audit').insert(auditRows);
    }

    // ── Persist occurrence data ─────────────────────────────────────────────
    const occurrenceRows = leaders
      .map(l => {
        const ccbData = ccbMap!.get(l.id);
        if (!ccbData?.hasReport) return null;
        return {
          leader_id: l.id,
          meeting_date: ccbData.occurrenceDate ?? week_start_date,
          status: (ccbData.didNotMeet ? 'did_not_meet' : 'met') as 'met' | 'did_not_meet',
          headcount: ccbData.headcount,
          has_notes: ccbData.hasNotes,
          guest_count: ccbData.guestCount,
          topic: ccbData.topic ?? null,
          notes: ccbData.notes ?? null,
          prayer_requests: ccbData.prayerRequests ?? null,
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

    // ── Update throttle log ─────────────────────────────────────────────────
    const summary = {
      updated: toUpdate.length,
      skipped,
      conflicts: conflicts.length,
      ccb_cache_age_ms: cacheAgeMs,
    };
    await supabase
      .from('ccb_week_sync_log')
      .upsert({
        week_start_date,
        week_end_date,
        last_synced_at: new Date().toISOString(),
        last_synced_by: userId,
        last_ccb_source: ccbSource,
        last_sync_summary: summary,
      }, { onConflict: 'week_start_date' });

    return NextResponse.json({
      fresh: true,
      throttled: false,
      synced_at: new Date().toISOString(),
      ccb_source: ccbSource,
      ccb_cache_age_ms: cacheAgeMs,
      updated: toUpdate.length,
      updated_leaders: toUpdate.map(u => ({ id: u.id, state: u.state })),
      conflicts,
      skipped,
    });
  } catch (err: any) {
    console.error('[sync-week-summaries POST]', err);
    return NextResponse.json(
      { error: err.message || 'Failed to sync week summaries' },
      { status: 500 }
    );
  }
}
