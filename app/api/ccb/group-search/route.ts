import { NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';
import { searchWords, escapeIlikePattern, rankGroups } from '../../../../lib/ccb/group-search';

// Search hits Postgres only; make sure Next never serves a cached response.
export const dynamic = 'force-dynamic';

// Best matches returned to the caller; `total` stays uncapped.
const RESULT_CAP = 25;
// Ranking happens in JS over the alphabetized match set, so bound the fetch.
// Far above any plausible match count for a single church's groups.
const MATCH_FETCH_CAP = 1000;

/**
 * POST /api/ccb/group-search — search the nightly CCB group cache by name.
 *
 * Body: { query: string, includeInactive?: boolean }
 *
 * Consumed by the Valley Creek Toolkit, which forwards its signed-in user's
 * Supabase bearer token unchanged — same staff gate as person-search. Unlike
 * the other /api/ccb/* endpoints this NEVER calls CCB: it reads the
 * ccb_group_cache table rebuilt nightly by /api/ccb/sync-group-cache, and
 * `syncedAt` (last COMPLETE sweep, null if never) tells the caller how fresh
 * the answer is.
 */
export async function POST(request: Request) {
  try {
    // Requires a signed-in staff session — this exposes the church's group
    // directory (names/campuses/leaders) to the caller.
    const user = await getUserFromAuthHeader(request);
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const includeInactive = body?.includeInactive === true;

    // noStore: Next caches GET fetches by URL, and a repeated query must see
    // the rows the nightly sweep just rewrote — not a stale cached response.
    const supabase = createServiceSupabaseClient({ noStore: true });

    const { data: state } = await supabase
      .from('ccb_group_cache_state')
      .select('last_full_sync_at')
      .eq('id', 1)
      .maybeSingle();
    const syncedAt = state?.last_full_sync_at ?? null;

    // Under the 2-character floor: an empty result, not an error.
    if (query.length < 2) {
      return NextResponse.json({ success: true, data: [], total: 0, syncedAt });
    }

    // AND of substrings: one chained ILIKE per whitespace-separated word.
    let matchQuery = supabase
      .from('ccb_group_cache')
      .select('id, name, campus, group_type, main_leader, member_count, inactive', {
        count: 'exact',
      });
    if (!includeInactive) {
      matchQuery = matchQuery.eq('inactive', false);
    }
    for (const word of searchWords(query)) {
      matchQuery = matchQuery.ilike('name', `%${escapeIlikePattern(word)}%`);
    }

    const { data: matches, error, count } = await matchQuery
      .order('name', { ascending: true })
      .limit(MATCH_FETCH_CAP);
    if (error) {
      throw new Error(`ccb_group_cache read failed: ${error.message}`);
    }

    const ranked = rankGroups(matches ?? [], query).slice(0, RESULT_CAP);

    return NextResponse.json({
      success: true,
      data: ranked.map((g) => ({
        id: g.id,
        name: g.name,
        campus: g.campus,
        groupType: g.group_type,
        mainLeader: g.main_leader,
        memberCount: g.member_count,
        inactive: g.inactive,
      })),
      total: count ?? (matches?.length ?? 0),
      syncedAt,
    });
  } catch (error) {
    console.error('CCB Group Search Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to search CCB groups',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
