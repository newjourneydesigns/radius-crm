import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { createCCBv2Client } from '../../../../lib/ccb/ccb-v2-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { verifyAdminAccessDemo } from '../../../../lib/auth-middleware';
import { syncCircleCalendar } from '../../../../lib/ccb/circle-calendar-sync';

export const dynamic = 'force-dynamic';
// One batch stays inside a single function invocation: 15 groups × (~1 CCB
// call + 1.2s pacing) ≈ 35-50s. The client loops batches for full backfills.
export const maxDuration = 60;

const MAX_PER_REQUEST = 15;
const PER_GROUP_DELAY_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function authorize(request: NextRequest): Promise<{ ok: boolean; error?: string }> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`) {
    return { ok: true };
  }
  const { isAdmin, error } = await verifyAdminAccessDemo(request);
  return isAdmin ? { ok: true } : { ok: false, error: error || 'Admin access required' };
}

// GET /api/ccb/sync-circle-calendars
//
// Every CCB-linked circle merged with its calendar sync state — feeds the
// Calendar Sync tab on the import page (the manual backfill surface).
export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const sb = createServiceSupabaseClient();
    const { data: leaders, error: leadersError } = await sb
      .from('circle_leaders')
      .select('id, name, circle_name, campus, status, ccb_group_id, schedule_source, day, time, frequency')
      .not('ccb_group_id', 'is', null)
      .order('name');
    if (leadersError) {
      return NextResponse.json({ error: leadersError.message }, { status: 500 });
    }

    const ids = (leaders ?? []).map((l) => l.id);
    const statesById = new Map<number, any>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: states } = await sb
        .from('circle_calendar_sync_state')
        .select('*')
        .in('leader_id', ids.slice(i, i + 200));
      for (const s of states ?? []) statesById.set(s.leader_id, s);
    }

    return NextResponse.json({
      success: true,
      leaders: (leaders ?? []).map((l) => ({ ...l, sync_state: statesById.get(l.id) ?? null })),
    });
  } catch (error: any) {
    console.error('❌ sync-circle-calendars GET error:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}

// POST /api/ccb/sync-circle-calendars  { leader_ids: number[] }
//
// Sync one batch of circle calendars (max 15 per request; the Calendar Sync
// tab loops batches with progress). Paced ~1.2s/group following the prewarm
// precedent so bulk backfills stay far inside the CCB daily budget.
export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedIds: number[] = Array.isArray(body?.leader_ids)
      ? body.leader_ids.map((v: any) => Number(v)).filter((v: number) => Number.isInteger(v))
      : [];
    if (requestedIds.length === 0) {
      return NextResponse.json({ error: 'leader_ids is required.' }, { status: 400 });
    }
    if (requestedIds.length > MAX_PER_REQUEST) {
      return NextResponse.json(
        { error: `Sync at most ${MAX_PER_REQUEST} circles per request; loop batches for more.` },
        { status: 400 }
      );
    }

    const sb = createServiceSupabaseClient();
    const { data: leaders, error: leadersError } = await sb
      .from('circle_leaders')
      .select('id, name, ccb_group_id')
      .in('id', requestedIds);
    if (leadersError) {
      return NextResponse.json({ error: leadersError.message }, { status: 500 });
    }

    const ccbv2 = createCCBv2Client(await getCCBRequestContext(request, {
      module: 'Import Circles',
      action: 'Bulk Calendar Sync',
      direction: 'pull',
    }));

    const byId = new Map((leaders ?? []).map((l) => [l.id, l]));
    const results: Array<{
      leader_id: number;
      name: string | null;
      status: string;
      error?: string;
      occurrenceCount?: number;
      futureCount?: number;
      frequency?: string | null;
    }> = [];

    for (let i = 0; i < requestedIds.length; i++) {
      const leader = byId.get(requestedIds[i]);
      if (!leader) {
        results.push({ leader_id: requestedIds[i], name: null, status: 'error', error: 'Leader not found' });
        continue;
      }
      if (!leader.ccb_group_id) {
        results.push({ leader_id: leader.id, name: leader.name, status: 'error', error: 'No CCB Group ID' });
        continue;
      }
      const result = await syncCircleCalendar(sb, ccbv2, {
        id: leader.id,
        ccb_group_id: String(leader.ccb_group_id),
      });
      results.push({
        leader_id: leader.id,
        name: leader.name,
        status: result.status,
        error: result.error,
        occurrenceCount: result.occurrenceCount,
        futureCount: result.futureCount,
        frequency: result.derived.frequency,
      });
      if (i < requestedIds.length - 1) await sleep(PER_GROUP_DELAY_MS);
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('❌ sync-circle-calendars POST error:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}
