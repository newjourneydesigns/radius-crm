/**
 * POST /api/circle-leader-toolkit/roster/add
 * Body: { individualId: string }
 * Adds an existing CCB individual to the leader's group.
 * Also writes a row into circle_roster_cache so the next /roster GET reflects
 * the new member immediately (bypasses the 15m roster cache TTL).
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../../lib/circle-leader-toolkit/session';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  if (!leader.ccb_group_id) {
    return NextResponse.json({ error: 'No CCB group linked.' }, { status: 400 });
  }

  let body: { individualId?: string | number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const individualId = body.individualId;
  if (!individualId) {
    return NextResponse.json({ error: 'individualId is required.' }, { status: 400 });
  }

  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'roster_add' })
  );

  try {
    const result = await ccb.addIndividualToGroup(individualId, leader.ccb_group_id, 'add');

    // Fetch the profile so the cache row has names + contact info populated.
    // If this fails we still succeed — the next /refresh call will fill it in.
    let profile: any = null;
    try {
      profile = await ccb.getIndividualProfile(String(individualId));
    } catch {
      // ignore
    }

    if (profile?.isActive === false) {
      try {
        await ccb.removeIndividualFromGroup(individualId, leader.ccb_group_id);
      } catch {
        // Best effort rollback; the cache delete below still prevents display.
      }
      try {
        const supabase = createServiceSupabaseClient();
        await supabase
          .from('circle_roster_cache')
          .delete()
          .eq('circle_leader_id', leader.id)
          .eq('ccb_group_id', String(leader.ccb_group_id))
          .eq('ccb_individual_id', String(individualId));
      } catch {
        // ignore
      }
      return NextResponse.json(
        { ok: false, error: 'Inactive profiles cannot be added to the roster.' },
        { status: 400 }
      );
    }

    try {
      const supabase = createServiceSupabaseClient();
      const row: Record<string, any> = {
        circle_leader_id: leader.id,
        ccb_group_id: String(leader.ccb_group_id),
        ccb_individual_id: String(individualId),
        first_name: profile?.firstName || '',
        last_name: profile?.lastName || '',
        full_name: profile?.fullName || `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
        email: profile?.email || '',
        phone: profile?.mobilePhone || profile?.phone || '',
        mobile_phone: profile?.mobilePhone || '',
        birthday: profile?.birthday || '',
        status: profile?.status || '',
        status_id: profile?.statusId || '',
        is_active: profile?.isActive !== false,
        fetched_at: new Date().toISOString(),
      };
      const { error: upsertErr } = await supabase
        .from('circle_roster_cache')
        .upsert(row, { onConflict: 'circle_leader_id,ccb_individual_id' });
      if (upsertErr) {
        // Retry without newer cache columns in case migrations have not run.
        const rowNoBirthday = { ...row };
        delete rowNoBirthday.birthday;
        delete rowNoBirthday.status;
        delete rowNoBirthday.status_id;
        delete rowNoBirthday.is_active;
        await supabase
          .from('circle_roster_cache')
          .upsert(rowNoBirthday, { onConflict: 'circle_leader_id,ccb_individual_id' });
      }
    } catch {
      // Cache update failures shouldn't fail the add operation.
    }

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
