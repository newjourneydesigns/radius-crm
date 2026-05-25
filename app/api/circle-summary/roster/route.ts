/**
 * GET /api/circle-summary/roster
 * Returns the leader's CCB group participants, merged with any cached
 * profile data (phone/email/birthday) from the ccb_individual_profiles table.
 * Stale or missing IDs are flagged so the client can revalidate them via
 * /api/circle-summary/roster/refresh.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-summary/session';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

const PROFILE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const ROSTER_TTL_MS = 15 * 60 * 1000; // 15m

type Participant = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  birthday: string;
  detailsLoaded: boolean;
};

type ProfileCacheEntry = {
  phone: string;
  email: string;
  birthday: string;
  syncedAt: string;
};

type RosterCacheRow = {
  ccb_individual_id: string | number;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  birthday?: string | null;
  fetched_at?: string | null;
};

type CcbParticipant = {
  id: string | number;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
};

function rowToParticipant(row: RosterCacheRow): Participant {
  return {
    id: String(row.ccb_individual_id),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    fullName: row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    email: row.email || '',
    phone: row.phone || row.mobile_phone || '',
    birthday: row.birthday || '',
    detailsLoaded: !!(row.email || row.phone || row.mobile_phone || row.birthday),
  };
}

function mergeProfileCache(participants: CcbParticipant[], cacheByID: Map<string, ProfileCacheEntry>) {
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
      firstName: p.firstName || '',
      lastName: p.lastName || '',
      fullName: p.fullName || '',
      email,
      phone,
      birthday,
      detailsLoaded,
    };
  });

  return { merged, staleIds };
}

export async function GET(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  if (!leader.ccb_group_id) {
    return NextResponse.json({ participants: [], staleIds: [], message: 'No CCB group linked.' });
  }

  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get('refresh') === '1';
  const supabase = createServiceSupabaseClient();

  if (!forceRefresh) {
    const { data: cachedRows } = await supabase
      .from('circle_roster_cache')
      .select('ccb_individual_id, first_name, last_name, full_name, email, phone, mobile_phone, birthday, fetched_at')
      .eq('circle_leader_id', leader.id)
      .eq('ccb_group_id', String(leader.ccb_group_id))
      .order('full_name', { ascending: true });

    if (cachedRows && cachedRows.length > 0) {
      const rows = cachedRows as RosterCacheRow[];
      const oldestFetchedAt = rows.reduce((oldest: number, row) => {
        const fetchedAt = row.fetched_at ? new Date(row.fetched_at).getTime() : 0;
        return oldest === 0 ? fetchedAt : Math.min(oldest, fetchedAt);
      }, 0);
      const needsRosterRefresh = !oldestFetchedAt || Date.now() - oldestFetchedAt > ROSTER_TTL_MS;

      return NextResponse.json({
        participants: rows.map(rowToParticipant),
        staleIds: rows
          .filter((row) => !row.email && !row.phone && !row.mobile_phone && !row.birthday)
          .map((row) => String(row.ccb_individual_id)),
        source: 'cache',
        needsRosterRefresh,
      });
    }
  }

  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'group_roster' })
  );

  try {
    const participants = (await ccb.getGroupParticipants(leader.ccb_group_id)) as CcbParticipant[];
    const ids = participants.map((p) => String(p.id));

    // Look up cached profile data in one query.
    const cacheByID = new Map<string, ProfileCacheEntry>();
    if (ids.length > 0) {
      const { data } = await supabase
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

    const { merged, staleIds } = mergeProfileCache(participants, cacheByID);
    const nowIso = new Date().toISOString();

    const staleCacheDelete = supabase
      .from('circle_roster_cache')
      .delete()
      .eq('circle_leader_id', leader.id)
      .eq('ccb_group_id', String(leader.ccb_group_id));

    if (merged.length > 0) {
      await staleCacheDelete.not('ccb_individual_id', 'in', `(${merged.map((p) => `"${p.id}"`).join(',')})`);

      await supabase.from('circle_roster_cache').upsert(
        merged.map((p) => ({
          circle_leader_id: leader.id,
          ccb_group_id: String(leader.ccb_group_id),
          ccb_individual_id: p.id,
          first_name: p.firstName,
          last_name: p.lastName,
          full_name: p.fullName,
          email: p.email,
          phone: p.phone,
          mobile_phone: p.phone,
          birthday: p.birthday,
          fetched_at: nowIso,
        })),
        { onConflict: 'circle_leader_id,ccb_individual_id' }
      );
    } else {
      await staleCacheDelete;
    }

    return NextResponse.json({
      participants: merged,
      staleIds,
      source: 'ccb',
      needsRosterRefresh: false,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { participants: [], staleIds: [], error: e instanceof Error ? e.message : 'Failed to load roster.' },
      { status: 500 }
    );
  }
}
