import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

/**
 * POST /api/admin/backfill-birthdays
 *
 * For each circle leader missing a birthday, searches their roster cache
 * for a member whose name matches, and copies the birthday over.
 *
 * Body (JSON, optional):
 *   { dryRun?: boolean }
 */
export async function POST(request: NextRequest) {
  // Auth guard — accept Supabase session token or CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  const cronSecret = process.env.CRON_SECRET;

  let authenticated = false;

  if (token && token !== cronSecret) {
    try {
      const anonClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      );
      const { data: { user }, error } = await anonClient.auth.getUser(token);
      if (user && !error) authenticated = true;
    } catch {
      // fall through
    }
  }

  if (!authenticated && cronSecret && token === cronSecret) {
    authenticated = true;
  }

  if (!authenticated && !cronSecret) {
    authenticated = true;
  }

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let dryRun = false;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.dryRun === true) dryRun = true;
  } catch {
    // defaults
  }

  const supabase = getServiceClient();

  // 1. Get all circle leaders missing a birthday
  const { data: leaders, error: leadersErr } = await supabase
    .from('circle_leaders')
    .select('id, name')
    .or('birthday.is.null,birthday.eq.');

  if (leadersErr || !leaders) {
    return NextResponse.json(
      { error: 'Failed to query leaders', details: leadersErr },
      { status: 500 }
    );
  }

  // 2. Get ALL roster cache entries that have a non-empty birthday
  const { data: rosterEntries, error: rosterErr } = await supabase
    .from('circle_roster_cache')
    .select('circle_leader_id, full_name, first_name, last_name, birthday')
    .not('birthday', 'is', null)
    .neq('birthday', '');

  if (rosterErr) {
    return NextResponse.json(
      { error: 'Failed to query roster cache', details: rosterErr },
      { status: 500 }
    );
  }

  // Build a lookup: full_name (lowercased) → birthday
  // Prioritize within-circle matches but also allow cross-circle matches
  const byCircleAndName: Record<string, string> = {};
  const byNameGlobal: Record<string, string> = {};

  for (const entry of rosterEntries || []) {
    if (!entry.birthday) continue;
    const nameLower = (entry.full_name || '').trim().toLowerCase();
    if (!nameLower) continue;

    // Key: "leaderId:fullname"
    byCircleAndName[`${entry.circle_leader_id}:${nameLower}`] = entry.birthday;
    // Global fallback
    if (!byNameGlobal[nameLower]) byNameGlobal[nameLower] = entry.birthday;
  }

  // 3. Match each leader
  const results: { id: number; name: string; birthday: string | null; matchType: string }[] = [];
  const updates: { id: number; birthday: string }[] = [];

  for (const leader of leaders) {
    const leaderNameLower = (leader.name || '').trim().toLowerCase();

    // Try within their own circle first
    let birthday: string | undefined = byCircleAndName[`${leader.id}:${leaderNameLower}`];
    let matchType = 'own-roster';

    // Fallback: try global match by name
    if (!birthday) {
      birthday = byNameGlobal[leaderNameLower] || undefined;
      matchType = birthday ? 'cross-roster' : 'no-match';
    }

    if (birthday) {
      updates.push({ id: leader.id, birthday });
    }

    results.push({ id: leader.id, name: leader.name, birthday: birthday || null, matchType: birthday ? matchType : 'no-match' });
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      totalMissing: leaders.length,
      matched: updates.length,
      unmatched: leaders.length - updates.length,
      results,
    });
  }

  // 4. Apply updates
  let succeeded = 0;
  let failed = 0;

  for (const upd of updates) {
    const { error } = await supabase
      .from('circle_leaders')
      .update({ birthday: upd.birthday })
      .eq('id', upd.id);

    if (error) {
      console.error(`Failed to update leader ${upd.id}:`, error.message);
      failed++;
    } else {
      succeeded++;
    }
  }

  return NextResponse.json({
    success: true,
    totalMissing: leaders.length,
    matched: updates.length,
    unmatched: leaders.length - updates.length,
    updated: succeeded,
    failed,
    results,
  });
}
