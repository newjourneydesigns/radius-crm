/**
 * POST /api/circle-leader-toolkit/roster/refresh
 * Body: { ids: string[] }
 * Fetches fresh CCB profile data for the given individual IDs in parallel
 * (capped concurrency), upserts the cache, and returns the fresh profiles.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSessionLeader, unauthorized } from '../../../../../lib/circle-leader-toolkit/session';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

const MAX_CONCURRENCY = 5;
const MAX_IDS_PER_REQUEST = 50;

export async function POST(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  let body: { ids?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const ids: string[] = Array.isArray(body?.ids)
    ? Array.from(new Set(body.ids.map((x) => String(x)).filter(Boolean))).slice(0, MAX_IDS_PER_REQUEST) as string[]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ profiles: [] });
  }

  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'roster_profile_batch' })
  );

  type Result = {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string;
    birthday: string;
    status: string;
    statusId: string;
    isActive: boolean;
  };
  const withoutStatusColumns = <T extends Record<string, unknown>>(row: T) => {
    const copy = { ...row };
    delete copy.status;
    delete copy.status_id;
    delete copy.is_active;
    return copy;
  };
  const results: Result[] = [];

  // Run with bounded concurrency to stay friendly to CCB's rate limits.
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const i = cursor++;
      const id = ids[i];
      try {
        const profile = await ccb.getIndividualProfile(id);
        if (profile) {
          results.push({
            id: String(profile.id || id),
            firstName: profile.firstName || '',
            lastName: profile.lastName || '',
            fullName: profile.fullName || '',
            email: profile.email || '',
            phone: profile.mobilePhone || profile.phone || '',
            birthday: profile.birthday || '',
            status: profile.status || '',
            statusId: profile.statusId || '',
            isActive: profile.isActive !== false,
          });
        }
      } catch {
        // Skip; client will keep showing whatever it had.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, ids.length) }, worker));

  // Upsert into the cache.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey && results.length > 0) {
    const admin = createClient(supabaseUrl, serviceKey);
    const nowIso = new Date().toISOString();
    const profileRows = results.map((r) => ({
        ccb_individual_id: r.id,
        first_name: r.firstName,
        last_name: r.lastName,
        full_name: r.fullName,
        email: r.email,
        phone: r.phone,
        birthday: r.birthday,
        status: r.status,
        status_id: r.statusId,
        is_active: r.isActive,
        synced_at: nowIso,
      }));
    const { error: profileUpsertError } = await admin
      .from('ccb_individual_profiles')
      .upsert(profileRows, { onConflict: 'ccb_individual_id' });

    if (profileUpsertError) {
      await admin.from('ccb_individual_profiles').upsert(
        profileRows.map(withoutStatusColumns),
        { onConflict: 'ccb_individual_id' }
      );
    }

    if (leader.ccb_group_id) {
      const inactiveIds = results.filter((r) => !r.isActive).map((r) => r.id);
      if (inactiveIds.length > 0) {
        await admin
          .from('circle_roster_cache')
          .delete()
          .eq('circle_leader_id', leader.id)
          .eq('ccb_group_id', String(leader.ccb_group_id))
          .in('ccb_individual_id', inactiveIds);
      }

      const activeRows = results.filter((r) => r.isActive).map((r) => ({
          circle_leader_id: leader.id,
          ccb_group_id: String(leader.ccb_group_id),
          ccb_individual_id: r.id,
          first_name: r.firstName,
          last_name: r.lastName,
          full_name: r.fullName,
          email: r.email,
          phone: r.phone,
          mobile_phone: r.phone,
          birthday: r.birthday,
          status: r.status,
          status_id: r.statusId,
          is_active: true,
          fetched_at: nowIso,
        }));

      if (activeRows.length > 0) {
        // NOTE: do not add `added_at` to this payload. It defaults to NOW() on
        // first insert and ON CONFLICT DO UPDATE only touches supplied columns,
        // so omitting it preserves each member's original join time — which the
        // coaching automations rely on to detect genuinely new members.
        const { error: rosterUpsertError } = await admin
          .from('circle_roster_cache')
          .upsert(activeRows, { onConflict: 'circle_leader_id,ccb_individual_id' });

        if (rosterUpsertError) {
          await admin.from('circle_roster_cache').upsert(
            activeRows.map(withoutStatusColumns),
            { onConflict: 'circle_leader_id,ccb_individual_id' }
          );
        }
      }
    }
  }

  return NextResponse.json({ profiles: results.filter((r) => r.isActive) });
}
