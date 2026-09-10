import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccessDemo } from '../../../../lib/auth-middleware';
import { describePostgrestError } from '../../../../lib/postgrestErrors';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * POST /api/event-summary-tracker/week-skip
 *
 * Body: { leader_id, week_start_date, action: 'skip' | 'unskip', note? }
 *
 * Clears (or restores) one circle's alert for one week. ACPD/admin only —
 * deciding a circle owed nothing that week is a judgement call, not something
 * a viewer can make.
 *
 * A skip only ever adds or removes a row in event_summary_week_skips. It never
 * touches event_summary_state, circle_meeting_occurrences, or
 * circle_event_summaries, so it cannot turn into a did-not-meet or invent a
 * summary that was never submitted.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAdmin, user, error: adminError } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: adminError || 'Admin access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { leader_id, week_start_date, action, note } = body as {
      leader_id?: number;
      week_start_date?: string;
      action?: 'skip' | 'unskip';
      note?: string;
    };

    const leaderId = Number(leader_id);
    if (!Number.isInteger(leaderId) || leaderId <= 0) {
      return NextResponse.json({ error: 'leader_id required' }, { status: 400 });
    }
    if (!week_start_date || !/^\d{4}-\d{2}-\d{2}$/.test(week_start_date)) {
      return NextResponse.json({ error: 'week_start_date (YYYY-MM-DD) required' }, { status: 400 });
    }
    if (action !== 'skip' && action !== 'unskip') {
      return NextResponse.json({ error: "action must be 'skip' or 'unskip'" }, { status: 400 });
    }

    const supabase = getServiceClient();

    if (action === 'unskip') {
      const { error } = await supabase
        .from('event_summary_week_skips')
        .delete()
        .eq('leader_id', leaderId)
        .eq('week_start_date', week_start_date);
      if (error) {
        console.error('[week-skip] delete failed:', describePostgrestError(error));
        return NextResponse.json({ error: `Could not restore the week: ${error.message}` }, { status: 500 });
      }
      return NextResponse.json({ leader_id: leaderId, week_start_date, skipped: false });
    }

    const trimmedNote = String(note ?? '').trim().slice(0, 200) || null;
    const { error } = await supabase
      .from('event_summary_week_skips')
      .upsert(
        {
          leader_id: leaderId,
          week_start_date,
          note: trimmedNote,
          skipped_at: new Date().toISOString(),
          skipped_by: user?.id ?? null,
        },
        { onConflict: 'leader_id,week_start_date' }
      );
    if (error) {
      console.error('[week-skip] upsert failed:', describePostgrestError(error));
      return NextResponse.json({ error: `Could not skip the week: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ leader_id: leaderId, week_start_date, skipped: true, note: trimmedNote });
  } catch (err: unknown) {
    console.error('[week-skip POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update the week' },
      { status: 500 }
    );
  }
}
