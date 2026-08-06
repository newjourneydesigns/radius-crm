import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';
import { createCCBv2Client } from '../../../../../lib/ccb/ccb-v2-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';
import { verifyAdminAccessDemo } from '../../../../../lib/auth-middleware';
import { syncCircleCalendar } from '../../../../../lib/ccb/circle-calendar-sync';

export const dynamic = 'force-dynamic';

// POST /api/circle-leaders/[id]/sync-calendar
//
// Resync Calendar: re-snapshots this circle's CCB group calendar (v2) into
// circle_calendar_occurrences and re-derives day/time/frequency from the
// actual occurrence dates. One click, no preview — the CCB calendar is the
// source of truth, so there is nothing sensible to untick. Distinct from
// resync-ccb, which refreshes contact/profile fields.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { isAdmin, error: authErr } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: authErr || 'Admin access required' }, { status: 403 });
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid leader id' }, { status: 400 });
    }

    const sb = createServiceSupabaseClient();
    const { data: leader } = await sb
      .from('circle_leaders')
      .select('id, name, ccb_group_id')
      .eq('id', id)
      .maybeSingle();
    if (!leader) {
      return NextResponse.json({ error: 'Circle leader not found' }, { status: 404 });
    }
    if (!leader.ccb_group_id) {
      return NextResponse.json(
        { error: 'This circle has no CCB Group ID set. Add one before syncing its calendar.' },
        { status: 400 }
      );
    }

    const ccbv2 = createCCBv2Client(await getCCBRequestContext(request, {
      module: 'Circle Page',
      action: 'Sync Calendar',
      direction: 'pull',
    }));

    const result = await syncCircleCalendar(sb, ccbv2, {
      id: leader.id,
      ccb_group_id: String(leader.ccb_group_id),
    });

    const { data: updated } = await sb
      .from('circle_leaders')
      .select('id, day, time, frequency, meeting_start_date, schedule_source, ccb_event_ids')
      .eq('id', id)
      .maybeSingle();

    return NextResponse.json({
      success: result.status !== 'error',
      result,
      leader: updated ?? null,
    });
  } catch (error: any) {
    console.error('❌ sync-calendar error:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}
