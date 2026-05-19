/**
 * POST /api/circle-summary/prewarm
 *
 * Cron-triggered (every 10 min) by the Netlify scheduled function
 * `prewarm-circle-summary.ts`. Iterates all leaders with circle-summary
 * access enabled, pulls each distinct CCB group's calendar + attendance for
 * the last 8 weeks, and persists them to `ccb_group_events_cache` so that
 * /api/circle-summary/events can serve from Supabase instead of CCB.
 *
 * Requires `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // up to 5 minutes — CCB calls add up

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) return unauthorized();

  const supabase = createServiceSupabaseClient();

  // Active leaders with a CCB group + access enabled. Distinct group_ids
  // are what we pre-warm (multiple leaders can share a group).
  const { data: leaders, error: leadersErr } = await supabase
    .from('circle_leaders')
    .select('ccb_group_id, status, circle_summary_access_enabled')
    .not('ccb_group_id', 'is', null)
    .neq('status', 'archive')
    .neq('status', 'archived');

  if (leadersErr) {
    console.error('[prewarm] failed to load leaders:', leadersErr);
    return NextResponse.json({ error: leadersErr.message }, { status: 500 });
  }

  const groupIds = Array.from(
    new Set(
      (leaders || [])
        .filter((l: any) => l.circle_summary_access_enabled !== false)
        .map((l: any) => String(l.ccb_group_id))
        .filter(Boolean)
    )
  );

  const end = DateTime.now().setZone('America/Chicago');
  const start = end.minus({ weeks: 8 });
  const startStr = start.toFormat('yyyy-LL-dd');
  const endStr = end.toFormat('yyyy-LL-dd');

  const ccb = createCCBClient({
    module: 'circle-summary',
    action: 'prewarm',
  });

  // Cap concurrency so CCB rate limits don't bite. CCB allows ~modest
  // parallelism; 3 in-flight groups at a time is conservative.
  const CONCURRENCY = 3;
  let warmed = 0;
  const errors: Array<{ groupId: string; error: string }> = [];

  async function warmOne(groupId: string) {
    try {
      const [calEvents, bulkXml] = await Promise.all([
        ccb.getGroupCalendarEvents(groupId, startStr, endStr),
        (ccb as any)
          .getXml({ srv: 'attendance_profiles', start_date: startStr, end_date: endStr })
          .catch(() => null),
      ]);

      const { error: upsertErr } = await supabase
        .from('ccb_group_events_cache')
        .upsert(
          {
            group_id: groupId,
            start_date: startStr,
            end_date: endStr,
            calendar_events: calEvents ?? [],
            attendance_xml: bulkXml ?? null,
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'group_id,start_date,end_date' }
        );

      if (upsertErr) {
        errors.push({ groupId, error: upsertErr.message });
        return;
      }
      warmed += 1;
    } catch (e: any) {
      errors.push({ groupId, error: e?.message || 'unknown' });
    }
  }

  // Simple worker pool
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, groupIds.length) }, async () => {
      while (cursor < groupIds.length) {
        const idx = cursor++;
        await warmOne(groupIds[idx]);
      }
    })
  );

  return NextResponse.json({
    ok: true,
    groups: groupIds.length,
    warmed,
    errors,
    window: { startStr, endStr },
  });
}
