import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccessDemo } from '../../../../lib/auth-middleware';
import { createCCBv2Client } from '../../../../lib/ccb/ccb-v2-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // Next.js instruments global fetch and caches GET responses by URL. Without
      // this, Supabase reads can return stale rows (e.g. an empty roster cached
      // from before positions were configured). Force every query to bypass it.
      global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) },
    }
  );
}

export interface ServeTeamPositionRoster {
  positionId: string;
  positionName: string;
  volunteers: Array<{
    id: number;
    name: string;
    email: string;
    mobile: string;
    birthday: string;
    status: string;
  }>;
}

export async function GET(request: NextRequest) {
  const { isAdmin, error: adminError } = await verifyAdminAccessDemo(request);
  if (!isAdmin) {
    return NextResponse.json({ error: adminError || 'Unauthorized' }, { status: 401 });
  }

  const leaderId = request.nextUrl.searchParams.get('leader_id');
  if (!leaderId) {
    return NextResponse.json({ error: 'Missing leader_id' }, { status: 400 });
  }

  const db = serviceClient();

  // Load managed positions + category ID for this leader
  const [positionsRes, leaderRes] = await Promise.all([
    db.from('host_team_positions').select('ccb_position_id, ccb_team_id, position_name').eq('leader_id', leaderId),
    db.from('circle_leaders').select('ccb_category_id').eq('id', leaderId).single(),
  ]);

  if (positionsRes.error) {
    return NextResponse.json({ error: positionsRes.error.message }, { status: 500 });
  }
  if (!positionsRes.data || positionsRes.data.length === 0) {
    return NextResponse.json([]);
  }
  if (!leaderRes.data?.ccb_category_id) {
    return NextResponse.json({ error: 'Leader has no CCB category ID configured' }, { status: 400 });
  }

  const managedPositionIds = new Set(positionsRes.data.map(p => String(p.ccb_position_id)));
  const positionNameMap = new Map(positionsRes.data.map(p => [String(p.ccb_position_id), p.position_name]));

  // Fetch all volunteers in the category from CCB v2
  const ctx = await getCCBRequestContext(request, {
    module: 'Serve Team Roster',
    action: 'Fetch Category Volunteers',
    direction: 'pull',
  });
  const v2 = createCCBv2Client(ctx);
  const allVolunteers = await v2.getCategoryVolunteers(leaderRes.data.ccb_category_id);

  // Filter to managed positions and group
  const byPosition = new Map<string, ServeTeamPositionRoster>();

  for (const vol of allVolunteers) {
    const posId = String(vol.positionId);
    if (!managedPositionIds.has(posId)) continue;
    if (!vol.individual) continue;

    if (!byPosition.has(posId)) {
      byPosition.set(posId, {
        positionId: posId,
        positionName: positionNameMap.get(posId) ?? posId,
        volunteers: [],
      });
    }

    byPosition.get(posId)!.volunteers.push({
      id: vol.individual.id,
      name: vol.individual.name,
      email: vol.individual.email,
      mobile: vol.individual.mobile,
      birthday: vol.individual.birthday,
      status: vol.status,
    });
  }

  // Sort volunteers by name within each position; sort positions by name
  const result: ServeTeamPositionRoster[] = Array.from(byPosition.values())
    .sort((a, b) => a.positionName.localeCompare(b.positionName))
    .map(p => ({
      ...p,
      volunteers: p.volunteers.sort((a, b) => a.name.localeCompare(b.name)),
    }));

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
  });
}
