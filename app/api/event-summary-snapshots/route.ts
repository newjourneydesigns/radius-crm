import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { EventSummaryState } from '../../../lib/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getDB() {
  return createClient(supabaseUrl, serviceKey || anonKey!);
}

// GET /api/event-summary-snapshots?week_start_date=YYYY-MM-DD
// Returns all leader snapshots for a given week
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const weekStartDate = searchParams.get('week_start_date');

  if (!weekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
    return NextResponse.json({ error: 'week_start_date is required (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const db = getDB();
    const { data, error } = await db
      .from('event_summary_snapshots')
      .select('circle_leader_id, event_summary_state, captured_at, ccb_report_available')
      .eq('week_start_date', weekStartDate);

    if (error) throw error;

    return NextResponse.json({ snapshots: data ?? [] });
  } catch (err: any) {
    console.error('[event-summary-snapshots GET]', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch snapshots' }, { status: 500 });
  }
}

// POST /api/event-summary-snapshots
// Body: { week_start_date, week_end_date, snapshots: [{ circle_leader_id, event_summary_state }], captured_by? }
// Upserts all provided leaders for that week (preserves existing rows not included)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { week_start_date, week_end_date, snapshots, captured_by } = body as {
      week_start_date: string;
      week_end_date: string;
      snapshots: Array<{ circle_leader_id: number; event_summary_state: EventSummaryState }>;
      captured_by?: string;
    };

    if (!week_start_date || !week_end_date || !Array.isArray(snapshots) || snapshots.length === 0) {
      return NextResponse.json(
        { error: 'week_start_date, week_end_date, and snapshots[] are required' },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(week_end_date)) {
      return NextResponse.json({ error: 'Dates must be in YYYY-MM-DD format' }, { status: 400 });
    }

    const VALID_STATES: EventSummaryState[] = ['not_received', 'received', 'did_not_meet', 'skipped'];
    for (const s of snapshots) {
      if (!Number.isInteger(s.circle_leader_id) || s.circle_leader_id <= 0) {
        return NextResponse.json({ error: `Invalid circle_leader_id: ${s.circle_leader_id}` }, { status: 400 });
      }
      if (!VALID_STATES.includes(s.event_summary_state)) {
        return NextResponse.json({ error: `Invalid event_summary_state: ${s.event_summary_state}` }, { status: 400 });
      }
    }

    const db = getDB();
    const rows = snapshots.map(s => ({
      week_start_date,
      week_end_date,
      circle_leader_id: s.circle_leader_id,
      event_summary_state: s.event_summary_state,
      captured_at: new Date().toISOString(),
      ...(captured_by ? { captured_by } : {}),
    }));

    const { error } = await db
      .from('event_summary_snapshots')
      .upsert(rows, { onConflict: 'week_start_date,circle_leader_id' });

    if (error) throw error;

    return NextResponse.json({ saved: rows.length });
  } catch (err: any) {
    console.error('[event-summary-snapshots POST]', err);
    return NextResponse.json({ error: err.message || 'Failed to save snapshots' }, { status: 500 });
  }
}

// PATCH /api/event-summary-snapshots
// Body: { week_start_date, circle_leader_id, event_summary_state }
// Updates a single leader's state in an existing snapshot
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { week_start_date, circle_leader_id, event_summary_state } = body as {
      week_start_date: string;
      circle_leader_id: number;
      event_summary_state: EventSummaryState;
    };

    if (!week_start_date || !circle_leader_id || !event_summary_state) {
      return NextResponse.json(
        { error: 'week_start_date, circle_leader_id, and event_summary_state are required' },
        { status: 400 }
      );
    }

    const VALID_STATES: EventSummaryState[] = ['not_received', 'received', 'did_not_meet', 'skipped'];
    if (!VALID_STATES.includes(event_summary_state)) {
      return NextResponse.json({ error: `Invalid event_summary_state: ${event_summary_state}` }, { status: 400 });
    }

    const db = getDB();
    const { error } = await db
      .from('event_summary_snapshots')
      .update({ event_summary_state })
      .eq('week_start_date', week_start_date)
      .eq('circle_leader_id', circle_leader_id);

    if (error) throw error;

    return NextResponse.json({ updated: true });
  } catch (err: any) {
    console.error('[event-summary-snapshots PATCH]', err);
    return NextResponse.json({ error: err.message || 'Failed to update snapshot' }, { status: 500 });
  }
}
