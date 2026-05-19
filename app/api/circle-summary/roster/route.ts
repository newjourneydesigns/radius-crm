/**
 * GET /api/circle-summary/roster
 * Returns the leader's CCB group participants, merged with any cached
 * profile data (phone/email/birthday) from the ccb_individual_profiles table.
 * Stale or missing IDs are flagged so the client can revalidate them via
 * /api/circle-summary/roster/refresh.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-summary/session';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

const PROFILE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function GET(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  if (!leader.ccb_group_id) {
    return NextResponse.json({ participants: [], staleIds: [], message: 'No CCB group linked.' });
  }

  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'group_roster' })
  );

  try {
    const participants = await ccb.getGroupParticipants(leader.ccb_group_id);
    const ids = participants.map((p) => String(p.id));

    // Look up cached profile data in one query.
    const cacheByID = new Map<string, { phone: string; email: string; birthday: string; syncedAt: string }>();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey && ids.length > 0) {
      const admin = createClient(supabaseUrl, serviceKey);
      const { data } = await admin
        .from('ccb_individual_profiles')
        .select('ccb_individual_id, phone, email, birthday, synced_at')
        .in('ccb_individual_id', ids);
      for (const row of data || []) {
        cacheByID.set(String(row.ccb_individual_id), {
          phone: row.phone || '',
          email: row.email || '',
          birthday: row.birthday || '',
          syncedAt: row.synced_at,
        });
      }
    }

    const now = Date.now();
    const staleIds: string[] = [];
    const merged = participants.map((p) => {
      const id = String(p.id);
      const cached = cacheByID.get(id);
      const rosterPhone = p.phone || p.mobilePhone || '';
      const rosterEmail = p.email || '';

      let phone = rosterPhone;
      let email = rosterEmail;
      let birthday = '';
      let detailsLoaded = false;

      if (cached) {
        phone = cached.phone || rosterPhone;
        email = cached.email || rosterEmail;
        birthday = cached.birthday || '';
        const ageMs = now - new Date(cached.syncedAt).getTime();
        detailsLoaded = true;
        if (ageMs > PROFILE_TTL_MS) staleIds.push(id);
      } else {
        staleIds.push(id);
      }

      return {
        id,
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: p.fullName,
        email,
        phone,
        birthday,
        detailsLoaded,
      };
    });

    return NextResponse.json({ participants: merged, staleIds });
  } catch (e: any) {
    return NextResponse.json({ participants: [], staleIds: [], error: e.message }, { status: 500 });
  }
}
