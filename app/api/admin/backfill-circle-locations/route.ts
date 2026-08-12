import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBv2Client, formatCcbAddress, CCBv2RateLimitError } from '../../../../lib/ccb/ccb-v2-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
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

type Outcome = 'changed' | 'unchanged' | 'no-address' | 'group-not-found' | 'error';

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
 * POST /api/admin/backfill-circle-locations
 *
 * One-off repair for circles whose location was imported from a CCB calendar
 * event instead of the group's own address. An event stores a copy of the
 * address made when the event was created, so any circle that changed venue
 * kept its old meeting spot; re-reading the group address corrects them.
 *
 * Only the group's address is fetched (one CCB call per circle). The event
 * fallback that the importer uses is deliberately skipped: a circle whose group
 * has no address is already showing the event-derived value, so re-deriving it
 * would spend two more CCB calls to write back the value that's already stored.
 * Those circles are reported as `no-address` and left untouched — this never
 * blanks a location, matching how a single-circle re-sync behaves when CCB is
 * sparse.
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
 * into RADIUS as an ACPD. It drives the batches to completion. There is no
 * global Supabase client to borrow, so it reads the session out of storage —
 * which is localStorage or sessionStorage depending on the "remember me"
 * preference (see lib/rememberMeStorage.ts), hence checking both.
 *
 *   async function backfillLocations(apply = false) {
 *     const token = [localStorage, sessionStorage].flatMap(s => Object.keys(s).map(k => [s, k]))
 *       .filter(([, k]) => /^sb-.+-auth-token$/.test(k))
 *       .map(([s, k]) => { try { return JSON.parse(s.getItem(k)).access_token } catch { return null } })
 *       .find(Boolean);
 *     if (!token) return console.error('No session found — sign in first.');
 *     let cursor = 0, all = [], done = false;
 *     while (!done) {
 *       const r = await fetch('/api/admin/backfill-circle-locations', {
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
 *         body: JSON.stringify({ apply, limit: 25, cursor }),
 *       });
 *       // A 404 serves Netlify's HTML page, so parsing it as JSON would fail
 *       // with a confusing "Unexpected token '<'" instead of the real cause.
 *       const res = await r.json().catch(() => null);
 *       if (!res) return console.error('HTTP ' + r.status + ' — not JSON. Is this build deployed?');
 *       if (res.error) return console.error(res.error);
 *       all.push(...res.rows);
 *       done = res.done;
 *       cursor = res.nextCursor;
 *       console.log(all.length + ' checked');
 *       if (res.rateLimited) { console.warn('Rate limited, retry in ' + res.retryAfterSeconds + 's'); break }
 *     }
 *     console.table(all.filter(r => r.outcome === 'changed'), ['id', 'name', 'from', 'to']);
 *     console.log(all.reduce((a, r) => ({ ...a, [r.outcome]: (a[r.outcome] || 0) + 1 }), {}));
 *     return all;
 *   }
 *
 *   await backfillLocations();       // preview
 *   await backfillLocations(true);   // then write
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
      .select('id, name, ccb_group_id, location')
      .not('ccb_group_id', 'is', null)
      .neq('ccb_group_id', '')
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(limit);

    if (queryErr) {
      console.error('❌ backfill-circle-locations query error:', queryErr);
      return NextResponse.json({ error: queryErr.message }, { status: 500 });
    }

    if (!leaders || leaders.length === 0) {
      return NextResponse.json({
        success: true,
        apply,
        processed: 0,
        changed: 0,
        unchanged: 0,
        noAddress: 0,
        errors: 0,
        updated: 0,
        nextCursor: null,
        done: true,
        rows: [] as Row[],
      });
    }

    const ccbv2 = createCCBv2Client(await getCCBRequestContext(request, {
      module: 'Admin Backfill',
      action: 'Backfill Circle Locations',
      direction: 'pull',
    }));

    const rows: Row[] = [];
    let updated = 0;
    let rateLimited: { retryAfterSeconds: number | null } | null = null;
    let lastProcessedId = cursor;

    for (const leader of leaders) {
      const groupId = String(leader.ccb_group_id);
      const current = (leader.location as string | null) ?? null;
      const base = { id: leader.id, name: leader.name, ccbGroupId: groupId, from: current };

      let group;
      try {
        group = await ccbv2.getGroupDetail(groupId);
      } catch (err: any) {
        // A rate limit stops the run rather than burning the rest of the batch
        // on calls that will fail too. The cursor stays put so a retry resumes
        // from this circle.
        if (err instanceof CCBv2RateLimitError) {
          rateLimited = { retryAfterSeconds: err.retryAfterSeconds };
          break;
        }
        rows.push({ ...base, outcome: 'error', error: err?.message || 'CCB request failed' });
        lastProcessedId = leader.id;
        continue;
      }

      lastProcessedId = leader.id;

      if (!group) {
        rows.push({ ...base, outcome: 'group-not-found' });
        continue;
      }

      const location = formatCcbAddress(group.address);
      if (!location) {
        rows.push({ ...base, outcome: 'no-address' });
        continue;
      }

      // Same comparison a single-circle re-sync uses, so the two agree on what
      // counts as a change (casing and whitespace drift don't).
      if (isSameLeaderFieldValue('location', current, location)) {
        rows.push({ ...base, outcome: 'unchanged' });
        continue;
      }

      if (apply) {
        const { error: updateErr } = await sb
          .from('circle_leaders')
          .update({ location, updated_at: new Date().toISOString() })
          .eq('id', leader.id);
        if (updateErr) {
          console.error(`❌ backfill-circle-locations update failed for ${leader.id}:`, updateErr.message);
          rows.push({ ...base, outcome: 'error', to: location, error: updateErr.message });
          continue;
        }
        updated++;
      }

      rows.push({ ...base, outcome: 'changed', to: location });
    }

    const tally = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
    // A short page means the table is exhausted; a rate limit means it isn't.
    const done = !rateLimited && leaders.length < limit;

    return NextResponse.json({
      success: true,
      apply,
      processed: rows.length,
      changed: tally('changed'),
      unchanged: tally('unchanged'),
      noAddress: tally('no-address'),
      groupNotFound: tally('group-not-found'),
      errors: tally('error'),
      updated,
      nextCursor: done ? null : lastProcessedId,
      done,
      ...(rateLimited ? { rateLimited: true, retryAfterSeconds: rateLimited.retryAfterSeconds } : {}),
      rows,
    });
  } catch (err: any) {
    console.error('❌ backfill-circle-locations error:', err);
    return NextResponse.json({ error: err?.message || 'Backfill failed' }, { status: 500 });
  }
}
