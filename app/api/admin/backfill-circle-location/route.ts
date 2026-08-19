import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient, CCBDailyBudgetError, CCBCircuitBreakerError } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import {
  getGroupClassificationsFromProfile,
  type CCBGroupProfileResponse,
} from '../../../../lib/ccb/circle-type';
import { verifyAdminAccessDemo } from '../../../../lib/auth-middleware';
import { isSameLeaderFieldValue } from '../../../../lib/leaderFieldValues';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

/** Default circles per call — small enough to finish inside the function timeout. */
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type Outcome = 'changed' | 'unchanged' | 'no-value' | 'error';

interface Row {
  id: number;
  name: string | null;
  ccbGroupId: string;
  outcome: Outcome;
  from: string | null;
  to?: string | null;
  error?: string;
}

/**
 * POST /api/admin/backfill-circle-location
 *
 * One-shot backfill of `circle_location` (the CCB "Circle Location"
 * classification — Campus Circle / City Circle / Online Circle) for every
 * circle that has a CCB Group ID. Existing circles predate the column; imports
 * and re-syncs fill it going forward, and this catches everything already in
 * RADIUS without waiting for each circle's next sync.
 *
 * Not to be confused with backfill-circle-locations (plural), the older one-off
 * that repairs the street-address `location` field.
 *
 * One v1 group_profile_from_id call per circle — the same call a re-sync makes
 * for the classification fields. A circle whose group has no Circle Location
 * set in CCB is reported as `no-value` and left untouched; this never blanks a
 * stored value.
 *
 * Runs a batch at a time so it can't outlive the serverless timeout. Feed
 * `nextCursor` back in as `cursor` until it comes back null.
 *
 * Body (JSON, all optional):
 *   { apply?: boolean, limit?: number, cursor?: number }
 *
 * apply   – false (default) previews the changes; true writes them
 * limit   – circles per call (default 25, max 100)
 * cursor  – resume point; pass the previous response's nextCursor
 *
 * Running it: paste the snippet below into the browser console while signed
 * into RADIUS as an ACPD (same recipe as the location-address backfill).
 *
 *   async function backfillCircleLocation(apply = false) {
 *     const token = [localStorage, sessionStorage].flatMap(s => Object.keys(s).map(k => [s, k]))
 *       .filter(([, k]) => /^sb-.+-auth-token$/.test(k))
 *       .map(([s, k]) => { try { return JSON.parse(s.getItem(k)).access_token } catch { return null } })
 *       .find(Boolean);
 *     if (!token) return console.error('No session found — sign in first.');
 *     let cursor = 0, all = [], done = false;
 *     while (!done) {
 *       const r = await fetch('/api/admin/backfill-circle-location', {
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
 *         body: JSON.stringify({ apply, limit: 25, cursor }),
 *       });
 *       const res = await r.json().catch(() => null);
 *       if (!res) return console.error('HTTP ' + r.status + ' — not JSON. Is this build deployed?');
 *       if (res.error) return console.error(res.error);
 *       all.push(...res.rows);
 *       done = res.done;
 *       cursor = res.nextCursor;
 *       console.log(all.length + ' checked');
 *       if (res.stopped) { console.warn('Stopped early: ' + res.stopped + ' — rerun later to resume.'); break }
 *     }
 *     console.table(all.filter(r => r.outcome === 'changed'), ['id', 'name', 'from', 'to']);
 *     console.log(all.reduce((a, r) => ({ ...a, [r.outcome]: (a[r.outcome] || 0) + 1 }), {}));
 *     return all;
 *   }
 *
 *   await backfillCircleLocation();       // preview
 *   await backfillCircleLocation(true);   // then write
 */
export async function POST(request: NextRequest) {
  try {
    const { isAdmin, error: authErr } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: authErr || 'Admin access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const apply = body?.apply === true;
    const limit = Math.min(Math.max(Number(body?.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const cursor = Number.isFinite(Number(body?.cursor)) ? Number(body.cursor) : 0;

    const sb = getServiceClient();

    // Ordering by id with a cursor keeps batches stable across calls, which
    // paging by offset would not once a write changes the row order.
    const { data: leaders, error: queryErr } = await sb
      .from('circle_leaders')
      .select('id, name, ccb_group_id, circle_location')
      .not('ccb_group_id', 'is', null)
      .neq('ccb_group_id', '')
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(limit);

    if (queryErr) {
      console.error('❌ backfill-circle-location query error:', queryErr);
      return NextResponse.json({ error: queryErr.message }, { status: 500 });
    }

    if (!leaders || leaders.length === 0) {
      return NextResponse.json({
        success: true,
        apply,
        processed: 0,
        changed: 0,
        unchanged: 0,
        noValue: 0,
        errors: 0,
        updated: 0,
        nextCursor: null,
        done: true,
        rows: [] as Row[],
      });
    }

    const ccb = createCCBClient(await getCCBRequestContext(request, {
      module: 'Admin Backfill',
      action: 'Backfill Circle Location Classification',
      direction: 'pull',
    }));

    const rows: Row[] = [];
    let updated = 0;
    // Daily budget exhausted or circuit breaker open — stop rather than burn
    // the rest of the batch on calls that will fail too. The cursor stays put
    // so a later run resumes from this circle.
    let stopped: string | null = null;
    let lastProcessedId = cursor;

    for (const leader of leaders) {
      const groupId = String(leader.ccb_group_id);
      const current = (leader.circle_location as string | null) ?? null;
      const base = { id: leader.id, name: leader.name, ccbGroupId: groupId, from: current };

      let fresh: string | null;
      try {
        const xml = await ccb.getXml<CCBGroupProfileResponse>({
          srv: 'group_profile_from_id',
          id: groupId,
          include_participants: 'false',
        });
        fresh = getGroupClassificationsFromProfile(xml).circleLocation;
      } catch (err: any) {
        if (err instanceof CCBDailyBudgetError || err instanceof CCBCircuitBreakerError) {
          stopped = err.message || err.name;
          break;
        }
        rows.push({ ...base, outcome: 'error', error: err?.message || 'CCB request failed' });
        lastProcessedId = leader.id;
        continue;
      }

      lastProcessedId = leader.id;

      // Covers a missing/deleted group too — the profile comes back without the
      // field either way, and both mean "nothing to write".
      if (!fresh) {
        rows.push({ ...base, outcome: 'no-value' });
        continue;
      }

      // Same comparison a re-sync uses, so the two agree on what counts as a
      // change (casing and whitespace drift don't).
      if (isSameLeaderFieldValue('circle_location', current, fresh)) {
        rows.push({ ...base, outcome: 'unchanged' });
        continue;
      }

      if (apply) {
        const { error: updateErr } = await sb
          .from('circle_leaders')
          .update({ circle_location: fresh, updated_at: new Date().toISOString() })
          .eq('id', leader.id);
        if (updateErr) {
          console.error(`❌ backfill-circle-location update failed for ${leader.id}:`, updateErr.message);
          rows.push({ ...base, outcome: 'error', to: fresh, error: updateErr.message });
          continue;
        }
        updated++;
      }

      rows.push({ ...base, outcome: 'changed', to: fresh });
    }

    const tally = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
    // A short page means the table is exhausted; an early stop means it isn't.
    const done = !stopped && leaders.length < limit;

    return NextResponse.json({
      success: true,
      apply,
      processed: rows.length,
      changed: tally('changed'),
      unchanged: tally('unchanged'),
      noValue: tally('no-value'),
      errors: tally('error'),
      updated,
      nextCursor: done ? null : lastProcessedId,
      done,
      ...(stopped ? { stopped } : {}),
      rows,
    });
  } catch (err: any) {
    console.error('❌ backfill-circle-location error:', err);
    return NextResponse.json({ error: err?.message || 'Backfill failed' }, { status: 500 });
  }
}
