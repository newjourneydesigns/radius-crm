import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

/**
 * POST /api/admin/bulk-fetch-rosters
 *
 * Finds circle leaders whose name contains a given filter string (default: "LVT | S1")
 * that have a CCB Group ID but no cached roster, then fetches and caches each roster.
 *
 * Body (JSON, all optional):
 *   { nameFilter?: string, includeAll?: boolean, dryRun?: boolean }
 *
 * nameFilter  – substring to match in circle_leaders.name (case-insensitive). Default: "LVT | S1"
 * includeAll  – if true, ignore nameFilter and process ALL leaders missing a roster
 * dryRun      – if true, return the list of leaders that would be fetched without calling CCB
 */
export async function POST(request: NextRequest) {
  // Simple auth guard — require the CRON_SECRET header if set
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let nameFilter = 'LVT | S1';
  let includeAll = false;
  let dryRun = false;

  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.nameFilter === 'string') nameFilter = body.nameFilter;
    if (body.includeAll === true) includeAll = true;
    if (body.dryRun === true) dryRun = true;
  } catch {
    // use defaults
  }

  const supabase = getServiceClient();

  // 1. Find leaders that match the name filter and have a ccb_group_id
  let leadersQuery = supabase
    .from('circle_leaders')
    .select('id, name, ccb_group_id, campus')
    .not('ccb_group_id', 'is', null)
    .not('status', 'in', '("Inactive","Removed")');

  if (!includeAll) {
    leadersQuery = leadersQuery.ilike('name', `%${nameFilter}%`);
  }

  const { data: allMatchingLeaders, error: leadersErr } = await leadersQuery;

  if (leadersErr || !allMatchingLeaders) {
    return NextResponse.json(
      { error: 'Failed to query leaders', details: leadersErr },
      { status: 500 }
    );
  }

  // 2. Find which of those leaders already have a cached roster
  const leaderIds = allMatchingLeaders.map((l) => l.id);

  const { data: cachedLeaderIds } = await supabase
    .from('circle_roster_cache')
    .select('circle_leader_id')
    .in('circle_leader_id', leaderIds);

  const cachedSet = new Set((cachedLeaderIds || []).map((r) => r.circle_leader_id));

  const missing = allMatchingLeaders.filter((l) => !cachedSet.has(l.id));

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      nameFilter: includeAll ? '(all)' : nameFilter,
      totalMatching: allMatchingLeaders.length,
      alreadyCached: allMatchingLeaders.length - missing.length,
      missingRosters: missing.length,
      leaders: missing.map((l) => ({
        id: l.id,
        name: l.name,
        campus: l.campus,
        ccb_group_id: l.ccb_group_id,
      })),
    });
  }

  if (missing.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'All matching leaders already have a cached roster.',
      nameFilter: includeAll ? '(all)' : nameFilter,
      totalMatching: allMatchingLeaders.length,
      fetched: 0,
    });
  }

  // 3. Fetch rosters from CCB for each missing leader
  let ccbClient: ReturnType<typeof createCCBClient>;
  try {
    ccbClient = createCCBClient();
  } catch (err: any) {
    return NextResponse.json(
      { error: 'CCB client init failed', details: err.message },
      { status: 500 }
    );
  }

  const results: {
    id: number;
    name: string;
    ccb_group_id: string;
    status: 'success' | 'error' | 'empty';
    memberCount?: number;
    error?: string;
  }[] = [];

  for (const leader of missing) {
    try {
      console.log(`Fetching roster for "${leader.name}" (group ${leader.ccb_group_id})…`);

      const participants = await ccbClient.getGroupParticipants(String(leader.ccb_group_id));

      // Enrich with phone / birthday from individual profiles
      const enriched = participants.length > 0
        ? await ccbClient.enrichRosterWithPhones(participants)
        : [];

      if (enriched.length === 0) {
        results.push({ id: leader.id, name: leader.name, ccb_group_id: leader.ccb_group_id, status: 'empty', memberCount: 0 });
        continue;
      }

      const now = new Date().toISOString();
      const rows = enriched.map((p) => ({
        circle_leader_id: leader.id,
        ccb_group_id: String(leader.ccb_group_id),
        ccb_individual_id: p.id,
        first_name: p.firstName,
        last_name: p.lastName,
        full_name: p.fullName,
        email: p.email || '',
        phone: p.phone || '',
        mobile_phone: p.mobilePhone || '',
        birthday: (p as any).birthday || '',
        fetched_at: now,
      }));

      // Upsert so re-running is safe
      const { error: upsertErr } = await supabase
        .from('circle_roster_cache')
        .upsert(rows, { onConflict: 'circle_leader_id,ccb_individual_id' });

      if (upsertErr) {
        // Retry without birthday column in case migration hasn't run
        const rowsNoBirthday = rows.map(({ birthday: _b, ...r }) => r);
        const { error: retryErr } = await supabase
          .from('circle_roster_cache')
          .upsert(rowsNoBirthday, { onConflict: 'circle_leader_id,ccb_individual_id' });
        if (retryErr) throw new Error(retryErr.message);
      }

      results.push({ id: leader.id, name: leader.name, ccb_group_id: leader.ccb_group_id, status: 'success', memberCount: enriched.length });
      console.log(`  ✅ ${leader.name}: ${enriched.length} members cached`);

      // Throttle between leaders to avoid hammering CCB
      await new Promise((r) => setTimeout(r, 800));

    } catch (err: any) {
      console.error(`  ❌ Failed for "${leader.name}":`, err.message);
      results.push({ id: leader.id, name: leader.name, ccb_group_id: leader.ccb_group_id, status: 'error', error: err.message });
      // Small delay even on error
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  const succeeded = results.filter((r) => r.status === 'success');
  const failed = results.filter((r) => r.status === 'error');
  const empty = results.filter((r) => r.status === 'empty');

  return NextResponse.json({
    success: true,
    nameFilter: includeAll ? '(all)' : nameFilter,
    totalMatching: allMatchingLeaders.length,
    alreadyCached: allMatchingLeaders.length - missing.length,
    attempted: missing.length,
    succeeded: succeeded.length,
    empty: empty.length,
    failed: failed.length,
    results,
  });
}
