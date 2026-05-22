import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

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

/**
 * POST /api/event-summary-tracker/bulk-review
 *
 * Stamps reviewed_at / reviewed_by on every "needs review" row in the caller's
 * current week + filter set. Acts on two underlying tables:
 *   1. circle_event_summaries     (rows submitted via the in-app public link)
 *   2. circle_meeting_occurrences (rows pulled from CCB by the week sync)
 *
 * Backfill step: for leaders flagged as "needs review" via event_summary_snapshots
 * but missing a circle_meeting_occurrences row (common when viewing a past week
 * whose sync only wrote the snapshot), this endpoint does a single CCB
 * attendance_profiles call for the week and upserts the missing rows with
 * reviewed_at set in one shot.
 *
 * Body: { week_start_date: "YYYY-MM-DD", leader_ids: number[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { week_start_date, leader_ids } = body as {
      week_start_date: string;
      leader_ids: number[];
    };

    if (
      !week_start_date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(week_start_date) ||
      !Array.isArray(leader_ids) ||
      leader_ids.length === 0
    ) {
      return NextResponse.json(
        { error: 'week_start_date and non-empty leader_ids[] required' },
        { status: 400 }
      );
    }

    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const week_end_date = DateTime.fromISO(week_start_date).plus({ days: 6 }).toISODate()!;
    const reviewed_at = new Date().toISOString();

    // 1. Stamp existing app-submitted summaries
    const submissionsRes = await supabase
      .from('circle_event_summaries')
      .update({ reviewed_at, reviewed_by: userId })
      .in('leader_id', leader_ids)
      .gte('occurrence', `${week_start_date}T00:00:00Z`)
      .lte('occurrence', `${week_end_date}T23:59:59Z`)
      .is('reviewed_at', null)
      .select('id, leader_id, did_not_meet');

    // 2. Stamp existing CCB-sourced occurrences
    const occurrencesRes = await supabase
      .from('circle_meeting_occurrences')
      .update({ reviewed_at, reviewed_by: userId })
      .in('leader_id', leader_ids)
      .gte('meeting_date', week_start_date)
      .lte('meeting_date', week_end_date)
      .is('reviewed_at', null)
      .select('id, leader_id, status');

    if (submissionsRes.error) {
      console.error('[bulk-review] submissions update failed:', submissionsRes.error);
      return NextResponse.json({ error: submissionsRes.error.message }, { status: 500 });
    }
    if (occurrencesRes.error) {
      console.error('[bulk-review] occurrences update failed:', occurrencesRes.error);
      return NextResponse.json({ error: occurrencesRes.error.message }, { status: 500 });
    }

    const stampedLeaders = new Set<number>();
    for (const r of submissionsRes.data ?? []) stampedLeaders.add(r.leader_id);
    for (const r of occurrencesRes.data ?? []) stampedLeaders.add(r.leader_id);

    // 3. Backfill missing rows for leaders we couldn't stamp directly.
    //    These are leaders flagged "needs review" via the snapshot but with no
    //    underlying occurrence/submission row yet. Pull CCB once for the week.
    const missing = leader_ids.filter(id => !stampedLeaders.has(id));
    let backfilled_inserted = 0;
    let backfilled_skipped = 0;

    if (missing.length > 0) {
      const { data: missingLeaders } = await supabase
        .from('circle_leaders')
        .select('id, name, circle_name, ccb_group_id, ccb_group_name')
        .in('id', missing);

      if (missingLeaders && missingLeaders.length > 0) {
        try {
          const ccb = createCCBClient(await getCCBRequestContext(request, {
            module: 'EventSummaryTracker',
            action: 'Bulk Review Backfill',
            direction: 'pull',
          }));
          const reportMap = await ccb.checkReportsForLeaders(
            missingLeaders.map(l => ({
              id: l.id,
              name: l.name,
              ccb_group_name: l.ccb_group_name || l.circle_name || null,
              ccb_group_id: l.ccb_group_id || null,
            })),
            week_start_date,
            week_end_date
          );

          const backfillRows = missingLeaders
            .map(l => {
              const d = reportMap.get(l.id);
              if (!d?.hasReport || !d.occurrenceDate) return null;
              return {
                leader_id: l.id,
                meeting_date: d.occurrenceDate,
                status: (d.didNotMeet ? 'did_not_meet' : 'met') as 'met' | 'did_not_meet',
                headcount: d.headcount,
                has_notes: d.hasNotes,
                guest_count: d.guestCount,
                topic: d.topic ?? null,
                notes: d.notes ?? null,
                prayer_requests: d.prayerRequests ?? null,
                source: 'ccb' as const,
                synced_at: new Date().toISOString(),
                reviewed_at,
                reviewed_by: userId,
              };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

          if (backfillRows.length > 0) {
            const full = await supabase
              .from('circle_meeting_occurrences')
              .upsert(backfillRows, { onConflict: 'leader_id,meeting_date' })
              .select('leader_id, status');
            let inserted = full.data;
            if (full.error) {
              // Retry without optional note columns in case the schema is missing them
              const minimal = backfillRows.map(({ topic, notes, prayer_requests, ...rest }) => rest);
              const retry = await supabase
                .from('circle_meeting_occurrences')
                .upsert(minimal, { onConflict: 'leader_id,meeting_date' })
                .select('leader_id, status');
              inserted = retry.data ?? null;
            }
            for (const row of inserted ?? []) {
              stampedLeaders.add(row.leader_id);
              backfilled_inserted++;
            }
          }
          backfilled_skipped = missingLeaders.length - backfillRows.length;
        } catch (e: any) {
          console.error('[bulk-review] backfill failed:', e?.message ?? e);
        }
      }
    }

    // 4. Best-effort audit log (non-fatal if the source check constraint
    //    hasn't been extended to include 'bulk_review' yet).
    const auditedLeaders = new Map<number, { to_state: string }>();
    for (const row of submissionsRes.data ?? []) {
      auditedLeaders.set(row.leader_id, {
        to_state: row.did_not_meet ? 'did_not_meet' : 'received',
      });
    }
    for (const row of occurrencesRes.data ?? []) {
      if (auditedLeaders.has(row.leader_id)) continue;
      auditedLeaders.set(row.leader_id, {
        to_state: row.status === 'did_not_meet' ? 'did_not_meet' : 'received',
      });
    }

    if (auditedLeaders.size > 0) {
      const auditRows = Array.from(auditedLeaders.entries()).map(([leader_id, v]) => ({
        leader_id,
        week_start_date,
        from_state: 'received',
        to_state: v.to_state,
        source: 'bulk_review' as const,
        changed_by: userId,
        metadata: { reviewed_at },
      }));
      const auditRes = await supabase.from('event_summary_state_audit').insert(auditRows);
      if (auditRes.error) {
        // Try again with 'manual' source as a fallback for envs missing the migration
        const fallback = auditRows.map(r => ({ ...r, source: 'manual' as const }));
        const retry = await supabase.from('event_summary_state_audit').insert(fallback);
        if (retry.error) {
          console.error('[bulk-review] audit insert failed (both attempts):', retry.error);
        }
      }
    }

    return NextResponse.json({
      reviewed_at,
      submissions_marked: submissionsRes.data?.length ?? 0,
      occurrences_marked: occurrencesRes.data?.length ?? 0,
      backfilled_and_marked: backfilled_inserted,
      backfill_skipped_no_ccb_match: backfilled_skipped,
      leaders_total_marked: stampedLeaders.size,
    });
  } catch (err: any) {
    console.error('[bulk-review POST]', err);
    return NextResponse.json(
      { error: err.message || 'Bulk review failed' },
      { status: 500 }
    );
  }
}
