import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccessDemo } from '../../../../lib/auth-middleware';
import { extractCcbGroupId, extractCcbIndividualId } from '../../../../lib/ccbGroupId';
import { createCCBv2Client } from '../../../../lib/ccb/ccb-v2-client';
import { CCBDailyBudgetError, getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

/**
 * Fill in missing leader phone numbers from CCB, for a batch of leaders.
 *
 * ## Why this exists
 *
 * A leader with no phone silently drops out of Bulk Message, so a filter that
 * matches 75 leaders can produce 33 recipients. The per-leader fix already
 * exists — Re-sync from CCB on the profile pulls the phone along with
 * everything else — but running it 42 times by hand is the reason nobody does
 * it. This is that same lookup, over a selection.
 *
 * ## Never overwrites
 *
 * A leader who already has a number is skipped without a CCB call. The action
 * only ever fills blanks, so it is safe to re-run and can't clobber a number
 * someone typed in by hand when CCB is wrong.
 *
 * ## Answers "does CCB even have it?"
 *
 * Leaders CCB knows but has no number for come back in `noNumber`, separately
 * from those that couldn't be matched to CCB at all (`skipped`). That
 * distinction is the point: it turns "about 42 are missing" into a per-leader
 * list of who needs a number sourced somewhere other than CCB.
 */

// Matches the other long-running CCB routes. Without it the Netlify function
// inherits the 10s default and a handful of profile reads blows into a 504.
export const maxDuration = 60;

// Up to two CCB reads per leader (group detail to find them, then their
// profile), so a request stays small enough to finish inside `maxDuration`.
// The client chunks a large selection into several of these calls.
const MAX_LEADERS_PER_REQUEST = 10;

// Pause between leaders, so a backfill can't become the thing that exhausts the
// church's shared CCB rate limit. Same budget the roster phone enrichment uses.
const THROTTLE_MS = 250;

interface LeaderRow {
  id: number;
  name: string;
  phone: string | null;
  ccb_group_id: string | null;
  ccb_profile_link: string | null;
  leader_ccb_profile_link: string | null;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** A number RADIUS would actually be able to text. Mirrors Bulk Message's check. */
function hasUsablePhone(phone: string | null | undefined): boolean {
  return (phone || '').replace(/[^+\d]/g, '').length >= 7;
}

/**
 * POST /api/ccb/backfill-phones
 * Body: { leaderIds: number[] }
 *
 * Reads from CCB and writes only `circle_leaders.phone`. Nothing is pushed back
 * to CCB.
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

    const body = await request.json().catch(() => ({}));
    const leaderIds: unknown = body?.leaderIds;

    if (!Array.isArray(leaderIds) || leaderIds.length === 0) {
      return NextResponse.json(
        { error: 'leaderIds must be a non-empty array' },
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
          error: `Send ${MAX_LEADERS_PER_REQUEST} leaders or fewer at a time — each one is a separate read from CCB.`,
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
      .select('id, name, phone, ccb_group_id, ccb_profile_link, leader_ccb_profile_link')
      .in('id', ids);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const ccb = createCCBv2Client(
      await getCCBRequestContext(request, {
        module: 'Mass Update',
        action: 'Backfill Phones',
        direction: 'pull',
      })
    );

    const filled: Array<{ id: number; name: string; phone: string }> = [];
    const noNumber: Array<{ id: number; name: string }> = [];
    const skipped: Array<{ id: number; name: string; reason: string }> = [];
    const failed: Array<{ id: number; name: string; error: string }> = [];
    let budgetStoppedAfter: number | null = null;
    let processed = 0;

    for (const leader of (leaders || []) as LeaderRow[]) {
      // Already has a number — no CCB call, no write.
      if (hasUsablePhone(leader.phone)) {
        skipped.push({ id: leader.id, name: leader.name, reason: 'already has a phone' });
        continue;
      }

      if (processed > 0) await new Promise((r) => setTimeout(r, THROTTLE_MS));
      processed++;

      try {
        // Prefer the individual id already stored on the leader — it costs no
        // CCB call and is exact. Fall back to whoever CCB has as the group's
        // main leader, which is where the per-leader re-sync gets it.
        let individualId = extractCcbIndividualId(leader.leader_ccb_profile_link);

        if (!individualId) {
          const groupId =
            (leader.ccb_group_id || '').trim().match(/^\d+$/)
              ? String(leader.ccb_group_id).trim()
              : extractCcbGroupId(leader.ccb_group_id) || extractCcbGroupId(leader.ccb_profile_link);

          if (!groupId) {
            skipped.push({ id: leader.id, name: leader.name, reason: 'no CCB profile or group linked' });
            continue;
          }

          const group = await ccb.getGroupDetail(groupId);
          individualId = group?.mainLeader?.id ? String(group.mainLeader.id) : null;

          if (!individualId) {
            skipped.push({ id: leader.id, name: leader.name, reason: 'CCB group has no main leader' });
            continue;
          }
        }

        const profile = await ccb.getIndividualProfile(individualId);
        const phone = profile?.mobilePhone || profile?.phone || '';

        if (!hasUsablePhone(phone)) {
          noNumber.push({ id: leader.id, name: leader.name });
          continue;
        }

        const { error: updateError } = await db
          .from('circle_leaders')
          .update({ phone, updated_at: new Date().toISOString() })
          .eq('id', leader.id);

        if (updateError) {
          failed.push({ id: leader.id, name: leader.name, error: updateError.message });
          continue;
        }

        filled.push({ id: leader.id, name: leader.name, phone });
      } catch (e) {
        if (e instanceof CCBDailyBudgetError) {
          budgetStoppedAfter = filled.length;
          break;
        }
        failed.push({
          id: leader.id,
          name: leader.name,
          error: e instanceof Error ? e.message : 'CCB read failed',
        });
      }
    }

    return NextResponse.json(
      {
        updated: filled.length,
        filled,
        noNumber,
        skipped,
        failed,
        budgetStoppedAfter,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('CCB phone backfill error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
