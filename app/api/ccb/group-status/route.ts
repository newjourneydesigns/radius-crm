import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccessDemo } from '../../../../lib/auth-middleware';
import { extractCcbGroupId } from '../../../../lib/ccbGroupId';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import {
  CCBDailyBudgetError,
  getCCBRequestContext,
  reserveCCBDailyBudget,
} from '../../../../lib/ccb/ccb-api-gateway';

// Matches the other long-running routes in this app. Without it the Netlify
// function inherits the 10s default, and a handful of CCB writes blows straight
// through that into a 504.
export const maxDuration = 60;

// One CCB write per leader, each a round trip to CCB — so a request has to stay
// small enough to finish well inside `maxDuration`. The client chunks a large
// selection into several of these calls rather than sending it all at once.
const MAX_LEADERS_PER_REQUEST = 10;

interface LeaderOutcome {
  id: number;
  name: string;
  groupId: string | null;
  ok: boolean;
  error?: string;
}

/**
 * `ccb_group_id` normally holds a bare numeric id, but older rows only carry the
 * CCB group link — so fall back to parsing the id out of that.
 */
function resolveGroupId(
  ccbGroupId: string | null | undefined,
  ccbProfileLink: string | null | undefined
): string | null {
  const raw = ccbGroupId?.trim();
  if (raw && /^\d+$/.test(raw)) return raw;
  return extractCcbGroupId(raw) || extractCcbGroupId(ccbProfileLink);
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/ccb/group-status
 * Body: { leaderIds: number[], inactive: boolean }
 *
 * Activates or deactivates each leader's CCB group via the v1 `update_group`
 * service. This writes to CCB only — a leader's RADIUS status is a separate
 * field and is deliberately left alone.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAdmin, error: adminAuthError } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json(
        { error: adminAuthError || 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const leaderIds: unknown = body?.leaderIds;
    const inactive: unknown = body?.inactive;

    if (!Array.isArray(leaderIds) || leaderIds.length === 0) {
      return NextResponse.json(
        { error: 'leaderIds must be a non-empty array' },
        { status: 400 }
      );
    }

    if (typeof inactive !== 'boolean') {
      return NextResponse.json(
        { error: 'inactive must be true or false' },
        { status: 400 }
      );
    }

    const ids = leaderIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No valid leader ids provided' }, { status: 400 });
    }

    if (ids.length > MAX_LEADERS_PER_REQUEST) {
      return NextResponse.json(
        {
          error: `Select ${MAX_LEADERS_PER_REQUEST} leaders or fewer at a time — each one is a separate write to CCB.`,
        },
        { status: 400 }
      );
    }

    const db = getServiceClient();
    if (!db) {
      return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 });
    }

    const { data: leaders, error: fetchError } = await db
      .from('circle_leaders')
      .select('id, name, ccb_group_id, ccb_profile_link')
      .in('id', ids);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const ccb = createCCBClient(
      await getCCBRequestContext(request, {
        module: 'Mass Update',
        action: inactive ? 'Deactivate CCB Group' : 'Activate CCB Group',
        direction: 'push',
      })
    );

    const results: LeaderOutcome[] = [];
    const skipped: { id: number; name: string }[] = [];
    let budgetStoppedAfter: number | null = null;

    for (const leader of leaders || []) {
      const groupId = resolveGroupId(leader.ccb_group_id, leader.ccb_profile_link);

      if (!groupId) {
        skipped.push({ id: leader.id, name: leader.name });
        continue;
      }

      // Writes go through `postXml`, which does not reserve budget the way the
      // read client does — so reserve one unit per group here.
      try {
        await reserveCCBDailyBudget();
      } catch (e) {
        if (e instanceof CCBDailyBudgetError) {
          budgetStoppedAfter = results.length;
          break;
        }
        throw e;
      }

      try {
        const updated = await ccb.setGroupInactive(groupId, inactive);

        // Trust what CCB echoes back, not what we asked for: a write that lands
        // on the opposite value is a failure, not a success.
        if (updated.inactive !== inactive) {
          results.push({
            id: leader.id,
            name: leader.name,
            groupId,
            ok: false,
            error: `CCB still reports this group as ${updated.inactive ? 'inactive' : 'active'}`,
          });
          continue;
        }

        results.push({ id: leader.id, name: leader.name, groupId, ok: true });
      } catch (e: any) {
        results.push({
          id: leader.id,
          name: leader.name,
          groupId,
          ok: false,
          error: e?.message || 'CCB write failed',
        });
      }
    }

    const updated = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);

    return NextResponse.json(
      {
        updated,
        inactive,
        failed,
        skipped,
        budgetStoppedAfter,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('CCB group status update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
