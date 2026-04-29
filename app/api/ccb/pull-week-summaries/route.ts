import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import type { EventSummaryState } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/ccb/pull-week-summaries
 *
 * Fetches CCB attendance profiles for a given week and marks which leaders
 * have a report in CCB. Upserts into event_summary_snapshots with
 * ccb_report_available = true/false. Does NOT change event_summary_state.
 *
 * Body: {
 *   week_start_date: string;   // YYYY-MM-DD (Sunday)
 *   week_end_date:   string;   // YYYY-MM-DD (Saturday)
 *   leader_ids:      number[]; // IDs of visible/filtered leaders to check
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { week_start_date, week_end_date, leader_ids } = body as {
      week_start_date: string;
      week_end_date: string;
      leader_ids: number[];
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

    // Fetch leader names for the provided IDs
    const { data: leaders, error: leaderError } = await supabase
      .from('circle_leaders')
      .select('id, name, circle_name, ccb_group_name, ccb_group_id')
      .in('id', leader_ids);

    if (leaderError || !leaders || leaders.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch leaders' }, { status: 500 });
    }

    // Ask CCB which leaders have a report for this week (single API call)
    // Match priority: ccb_group_id (exact) → ccb_group_name → circle_name → leader.name
    const ccb = createCCBClient();
    const reportMap = await ccb.checkReportsForLeaders(
      leaders.map(l => ({
        id: l.id,
        name: l.name,
        ccb_group_name: l.ccb_group_name || l.circle_name || null,
        ccb_group_id: l.ccb_group_id || null,
      })),
      week_start_date,
      week_end_date
    );

    // Fetch existing snapshots so we don't overwrite event_summary_state
    const { data: existing } = await supabase
      .from('event_summary_snapshots')
      .select('circle_leader_id, event_summary_state')
      .eq('week_start_date', week_start_date)
      .in('circle_leader_id', leader_ids);

    const existingStateMap = new Map<number, EventSummaryState>();
    for (const row of existing ?? []) {
      existingStateMap.set(row.circle_leader_id, row.event_summary_state as EventSummaryState);
    }

    // Build upsert rows — preserve existing state, update ccb_report_available
    const rows = leaders.map(l => ({
      week_start_date,
      week_end_date,
      circle_leader_id: l.id,
      event_summary_state: existingStateMap.get(l.id) ?? 'not_received' as EventSummaryState,
      ccb_report_available: reportMap.get(l.id)?.hasReport ?? false,
      captured_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from('event_summary_snapshots')
      .upsert(rows, { onConflict: 'week_start_date,circle_leader_id' });

    if (upsertError) throw upsertError;

    // Upsert occurrence data from CCB — attendance_profiles is the authoritative source
    // for headcount, has_notes, and guest_count, so always overwrite.
    const occurrenceRows = leaders
      .map(l => {
        const ccbData = reportMap.get(l.id);
        if (!ccbData?.hasReport || !ccbData.occurrenceDate || !ccbData.headcount) return null;
        return {
          leader_id: l.id,
          meeting_date: ccbData.occurrenceDate,
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

    const reportCount = rows.filter(r => r.ccb_report_available).length;

    return NextResponse.json({
      pulled: rows.length,
      with_report: reportCount,
      results: rows.map(r => ({
        circle_leader_id: r.circle_leader_id,
        ccb_report_available: r.ccb_report_available,
      })),
    });
  } catch (err: any) {
    console.error('[pull-week-summaries POST]', err);
    return NextResponse.json(
      { error: err.message || 'Failed to pull from CCB' },
      { status: 500 }
    );
  }
}
