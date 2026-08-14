import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBv2Client, CCBv2RateLimitError } from '../../../../lib/ccb/ccb-v2-client';
import { CCBDailyBudgetError, getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import {
  CCB_SYNCABLE_FIELDS,
  diffCircleSnapshot,
  fetchCcbCircleSnapshot,
  type CcbSyncChange,
} from '../../../../lib/ccb/circle-sync';
import { verifyAdminAccessDemo } from '../../../../lib/auth-middleware';

export const dynamic = 'force-dynamic';

// Each circle in a preview batch costs several CCB round trips (group detail,
// leader profile, calendar, circle type), so a batch has to stay small enough
// to finish comfortably inside the function's time limit. The client chunks a
// large selection into several of these calls and paces them.
export const maxDuration = 60;
const MAX_PREVIEW_PER_REQUEST = 5;

// Applies are Supabase-only writes — no CCB calls — so they can batch bigger.
const MAX_APPLY_PER_REQUEST = 25;

interface PreviewOutcome {
  id: number;
  name: string;
  ok: boolean;
  error?: string;
  /** No ccb_group_id on the RADIUS row. */
  noGroupId?: boolean;
  /** CCB has no group for this id (deleted, or the id is wrong). */
  notFound?: boolean;
  /** The CCB group exists but is marked inactive. */
  ccbInactive?: boolean;
  changes: CcbSyncChange[];
  values: Record<string, any>;
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

/**
 * POST /api/ccb/bulk-resync
 *
 * Mass Update's "Sync from CCB": refresh many circles from CCB in throttled
 * batches, with the same field whitelist and diff rules as the per-circle
 * "Re-sync from CCB" (lib/ccb/circle-sync.ts).
 *
 * Two modes:
 *   { mode: 'preview', leaderIds: number[] }        — pulls CCB fresh for each
 *     circle (≤5 per request) and returns per-circle diffs WITHOUT writing.
 *   { mode: 'apply', applies: [{ id, values }] }    — writes previously
 *     previewed values (whitelisted) to RADIUS. No CCB calls.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAdmin, error: authErr } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: authErr || 'Admin access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === 'apply' ? 'apply' : body?.mode === 'preview' ? 'preview' : null;
    if (!mode) {
      return NextResponse.json({ error: "mode must be 'preview' or 'apply'" }, { status: 400 });
    }

    const sb = getServiceSupabase();

    // ---- APPLY ----
    if (mode === 'apply') {
      const applies: unknown = body?.applies;
      if (!Array.isArray(applies) || applies.length === 0) {
        return NextResponse.json({ error: 'applies must be a non-empty array' }, { status: 400 });
      }
      if (applies.length > MAX_APPLY_PER_REQUEST) {
        return NextResponse.json(
          { error: `Apply ${MAX_APPLY_PER_REQUEST} circles or fewer per request.` },
          { status: 400 }
        );
      }

      const results: Array<{ id: number; ok: boolean; error?: string; applied: number }> = [];
      for (const entry of applies) {
        const id = Number((entry as any)?.id);
        const values = (entry as any)?.values;
        if (!Number.isInteger(id) || id <= 0 || !values || typeof values !== 'object') {
          results.push({ id: id || 0, ok: false, error: 'Invalid apply entry', applied: 0 });
          continue;
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        for (const key of CCB_SYNCABLE_FIELDS) {
          if (key in values) updates[key] = values[key];
        }
        if (Object.keys(updates).length === 1) {
          results.push({ id, ok: true, applied: 0 });
          continue;
        }

        const { error: applyErr } = await sb
          .from('circle_leaders')
          .update(updates)
          .eq('id', id);
        if (applyErr) {
          results.push({ id, ok: false, error: applyErr.message, applied: 0 });
        } else {
          results.push({ id, ok: true, applied: Object.keys(updates).length - 1 });
        }
      }

      return NextResponse.json({
        success: true,
        mode: 'apply',
        results,
        updated: results.filter((r) => r.ok && r.applied > 0).length,
      });
    }

    // ---- PREVIEW ----
    const leaderIds: unknown = body?.leaderIds;
    if (!Array.isArray(leaderIds) || leaderIds.length === 0) {
      return NextResponse.json({ error: 'leaderIds must be a non-empty array' }, { status: 400 });
    }
    const ids = leaderIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) {
      return NextResponse.json({ error: 'No valid leader ids provided' }, { status: 400 });
    }
    if (ids.length > MAX_PREVIEW_PER_REQUEST) {
      return NextResponse.json(
        { error: `Preview ${MAX_PREVIEW_PER_REQUEST} circles or fewer per request — each one is several CCB calls.` },
        { status: 400 }
      );
    }

    const { data: leaders, error: fetchError } = await sb
      .from('circle_leaders')
      .select('id, name, ccb_group_id, leader_ccb_profile_link, campus, circle_type, day, time, frequency, location, email, phone, birthday, ccb_group_name, ccb_event_ids')
      .in('id', ids);
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const leadersById = new Map((leaders ?? []).map((l) => [l.id, l]));
    const ccbv2 = createCCBv2Client(await getCCBRequestContext(request, {
      module: 'Mass Update',
      action: 'Bulk Sync from CCB',
      direction: 'pull',
    }));

    // One /campuses lookup per request, shared across the batch.
    const campusNameCache = new Map<string, string | null>();

    const results: PreviewOutcome[] = [];
    let budgetStopped = false;
    let rateLimitedRetryAfter: number | null = null;

    for (const id of ids) {
      if (budgetStopped || rateLimitedRetryAfter !== null) break;

      const leader = leadersById.get(id);
      if (!leader) {
        results.push({ id, name: `#${id}`, ok: false, error: 'Circle leader not found', changes: [], values: {} });
        continue;
      }
      if (!leader.ccb_group_id) {
        results.push({ id, name: leader.name, ok: false, noGroupId: true, changes: [], values: {} });
        continue;
      }

      try {
        const snapshot = await fetchCcbCircleSnapshot({
          request,
          ccbv2,
          groupId: String(leader.ccb_group_id),
          telemetry: { module: 'Mass Update', circleTypeAction: 'Bulk Sync Circle Type' },
          campusNameCache,
        });

        if (!snapshot) {
          results.push({ id, name: leader.name, ok: false, notFound: true, changes: [], values: {} });
          continue;
        }

        const { changes, values } = diffCircleSnapshot(leader as any, snapshot.proposed);
        results.push({
          id,
          name: leader.name,
          ok: true,
          ccbInactive: snapshot.ccbInactive || undefined,
          changes,
          values,
        });
      } catch (e: any) {
        if (e instanceof CCBDailyBudgetError) {
          budgetStopped = true;
          break;
        }
        if (e instanceof CCBv2RateLimitError) {
          rateLimitedRetryAfter = e.retryAfterSeconds ?? 60;
          break;
        }
        results.push({ id, name: leader.name, ok: false, error: e?.message || 'CCB pull failed', changes: [], values: {} });
      }
    }

    return NextResponse.json({
      success: true,
      mode: 'preview',
      results,
      budgetStopped,
      rateLimitedRetryAfter,
    });
  } catch (error: any) {
    console.error('❌ bulk-resync error:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}
