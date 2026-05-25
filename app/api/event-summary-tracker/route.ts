import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * GET /api/event-summary-tracker?week_start_date=YYYY-MM-DD
 *
 * Composite read for the Event Summary Tracker page. Returns everything the
 * page can't get from existing endpoints in one shot:
 *
 *   - orphans:           grouped by category (matched / inactive / unknown_group)
 *   - missed_two_plus:   leader_ids who were not_received or did_not_meet for
 *                        BOTH this week and the prior scheduled week
 *   - reviewers:         { leader_id -> { reviewed_at, reviewed_by_id,
 *                          reviewed_by_name, did_not_meet, source } }
 *                        — merged from circle_event_summaries (app) and
 *                          circle_meeting_occurrences (CCB); app wins on tie
 *   - last_sync:         from ccb_week_sync_log for this week
 *   - snapshots:         current-week event_summary_snapshots rows
 *
 * The page pulls leaders / occurrences / submissions directly from Supabase for filtering.
 */
export async function GET(request: NextRequest) {
  try {
    const weekStart = request.nextUrl.searchParams.get('week_start_date');
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json(
        { error: 'week_start_date (YYYY-MM-DD) required' },
        { status: 400 }
      );
    }

    const weekEnd = DateTime.fromISO(weekStart).plus({ days: 6 }).toISODate()!;
    const priorWeekStart = DateTime.fromISO(weekStart).minus({ days: 7 }).toISODate()!;
    const db = getDB();

    const orphansPromise = db
      .from('ccb_orphan_summaries')
      .select('id, ccb_event_id, occurrence, ccb_event_name, ccb_group_id, did_not_meet, head_count, attendee_count, matched_leader_id, category, detected_at')
      .eq('week_start_date', weekStart)
      .in('category', ['inactive', 'unknown_group']);

    const snapshotsPromise = db
      .from('event_summary_snapshots')
      .select('circle_leader_id, week_start_date, event_summary_state, captured_at, ccb_event_scheduled, ccb_report_available')
      .gte('week_start_date', priorWeekStart)
      .lte('week_start_date', weekStart);

    const submissionsPromise = db
      .from('circle_event_summaries')
      .select('leader_id, did_not_meet, reviewed_at, reviewed_by')
      .gte('occurrence', `${weekStart}T00:00:00Z`)
      .lte('occurrence', `${weekEnd}T23:59:59Z`)
      .not('reviewed_at', 'is', null);

    const occurrencesPromise = db
      .from('circle_meeting_occurrences')
      .select('leader_id, status, reviewed_at, reviewed_by')
      .gte('meeting_date', weekStart)
      .lte('meeting_date', weekEnd)
      .not('reviewed_at', 'is', null);

    const syncPromise = db
      .from('ccb_week_sync_log')
      .select('last_synced_at, last_synced_by, last_sync_summary')
      .eq('week_start_date', weekStart)
      .maybeSingle();

    // Reviewer name lookup runs in parallel with the main queries — the
    // users table is small enough that fetching all rows is cheaper than the
    // extra round-trip we used to make sequentially after the main queries.
    const usersPromise = db
      .from('users')
      .select('id, name, email');

    const [orphansRes, snapshotsRes, submissionsRes, occurrencesRes, syncRes, usersRes] = await Promise.all([
      orphansPromise,
      snapshotsPromise,
      submissionsPromise,
      occurrencesPromise,
      syncPromise,
      usersPromise,
    ]);

    let snapshotRows = snapshotsRes.data ?? [];
    let snapshotsError = snapshotsRes.error;
    if (snapshotsError && /ccb_event_scheduled|ccb_report_available/.test(snapshotsError.message)) {
      const fallbackSnapshotsRes = await db
        .from('event_summary_snapshots')
        .select('circle_leader_id, week_start_date, event_summary_state, captured_at')
        .gte('week_start_date', priorWeekStart)
        .lte('week_start_date', weekStart);

      if (fallbackSnapshotsRes.error) {
        snapshotsError = fallbackSnapshotsRes.error;
      } else {
        snapshotsError = null;
        snapshotRows = (fallbackSnapshotsRes.data ?? []).map((row) => ({
          ...row,
          ccb_event_scheduled: false,
          ccb_report_available: false,
        }));
      }
    }

    const responseErrors = {
      orphansRes: orphansRes.error,
      snapshotsRes: snapshotsError,
      submissionsRes: submissionsRes.error,
      occurrencesRes: occurrencesRes.error,
      syncRes: syncRes.error,
    };
    for (const [label, error] of Object.entries(responseErrors)) {
      if (error) console.warn(`[event-summary-tracker GET] ${label}:`, error.message);
    }

    // Missed-2+ candidates: leaders whose state for this week AND the prior
    // week is either 'not_received' or 'did_not_meet'. (Skipped doesn't count.)
    const stateByLeaderWeek = new Map<string, string>();
    for (const row of snapshotRows) {
      stateByLeaderWeek.set(`${row.circle_leader_id}|${row.week_start_date}`, row.event_summary_state);
    }
    const missedSet = new Set<number>();
    const allLeaderIds = new Set<number>();
    for (const row of snapshotRows) allLeaderIds.add(row.circle_leader_id);
    for (const lid of Array.from(allLeaderIds)) {
      const thisWk = stateByLeaderWeek.get(`${lid}|${weekStart}`);
      const lastWk = stateByLeaderWeek.get(`${lid}|${priorWeekStart}`);
      const missThis = thisWk === 'not_received' || thisWk === 'did_not_meet';
      const missLast = lastWk === 'not_received' || lastWk === 'did_not_meet';
      if (missThis && missLast) missedSet.add(lid);
    }

    // Build the reviewer-id → display-name map from the parallel users fetch.
    const nameById = new Map<string, string>();
    for (const u of usersRes.data ?? []) {
      nameById.set(u.id, u.name || u.email || 'Someone');
    }

    const reviewers: Record<number, {
      reviewed_at: string;
      reviewed_by_id: string | null;
      reviewed_by_name: string;
      did_not_meet: boolean;
      source: 'app' | 'ccb';
    }> = {};

    // App submissions win on tie because they carry richer payload context
    for (const r of occurrencesRes.data ?? []) {
      if (!r.reviewed_at) continue;
      reviewers[r.leader_id] = {
        reviewed_at: r.reviewed_at,
        reviewed_by_id: r.reviewed_by,
        reviewed_by_name: r.reviewed_by ? (nameById.get(r.reviewed_by) || 'Someone') : 'Someone',
        did_not_meet: r.status === 'did_not_meet',
        source: 'ccb',
      };
    }
    for (const r of submissionsRes.data ?? []) {
      if (!r.reviewed_at) continue;
      reviewers[r.leader_id] = {
        reviewed_at: r.reviewed_at,
        reviewed_by_id: r.reviewed_by,
        reviewed_by_name: r.reviewed_by ? (nameById.get(r.reviewed_by) || 'Someone') : 'Someone',
        did_not_meet: r.did_not_meet,
        source: 'app',
      };
    }

    // Group orphans by category
    type OrphanRow = NonNullable<typeof orphansRes.data>[number];
    const orphansByCategory: Record<'inactive' | 'unknown_group', OrphanRow[]> = {
      inactive: [],
      unknown_group: [],
    };
    for (const o of orphansRes.data ?? []) {
      if (o.category === 'inactive' || o.category === 'unknown_group') {
        orphansByCategory[o.category].push(o);
      }
    }

    return NextResponse.json(
      {
        week_start_date: weekStart,
        week_end_date: weekEnd,
        orphans: orphansByCategory,
        missed_two_plus_leader_ids: Array.from(missedSet),
        reviewers,
        last_sync: syncRes.data ?? null,
        snapshots: snapshotRows.filter((row) => row.week_start_date === weekStart),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    console.error('[event-summary-tracker GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load tracker data' },
      { status: 500 }
    );
  }
}
