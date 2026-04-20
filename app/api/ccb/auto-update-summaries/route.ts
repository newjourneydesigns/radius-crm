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

    // Load leader names
    const { data: leaders, error: leaderError } = await supabase
      .from('circle_leaders')
      .select('id, name')
      .in('id', leader_ids);

    if (leaderError || !leaders || leaders.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch leaders' }, { status: 500 });
    }

    // Pull CCB data (single API call)
    const ccb = createCCBClient();
    const ccbMap = await ccb.checkReportsForLeaders(
      leaders.map(l => ({ id: l.id, name: l.name })),
      week_start_date,
      week_end_date
    );

    // Load current states
    let currentStateMap = new Map<number, EventSummaryState>();

    if (is_current_week) {
      const { data: rows } = await supabase
        .from('circle_leaders')
        .select('id, event_summary_state')
        .in('id', leader_ids);
      for (const row of rows ?? []) {
        currentStateMap.set(row.id, (row.event_summary_state ?? 'not_received') as EventSummaryState);
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
        continue; // No CCB report — leave as-is
      }

      const ccbState: EventSummaryState = ccbData.didNotMeet ? 'did_not_meet' : 'received';
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

    // Apply updates
    if (toUpdate.length > 0) {
      if (is_current_week) {
        // Update each leader individually (different states)
        const received = toUpdate.filter(u => u.state === 'received').map(u => u.id);
        const didNotMeet = toUpdate.filter(u => u.state === 'did_not_meet').map(u => u.id);

        if (received.length > 0) {
          await supabase
            .from('circle_leaders')
            .update({ event_summary_state: 'received' })
            .in('id', received);
        }
        if (didNotMeet.length > 0) {
          await supabase
            .from('circle_leaders')
            .update({ event_summary_state: 'did_not_meet' })
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

    return NextResponse.json({
      updated: toUpdate.length,
      skipped,
      conflicts,
    });
  } catch (err: any) {
    console.error('[auto-update-summaries POST]', err);
    return NextResponse.json(
      { error: err.message || 'Failed to auto-update summaries' },
      { status: 500 }
    );
  }
}
