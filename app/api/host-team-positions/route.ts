import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccessDemo } from '../../../lib/auth-middleware';

export const dynamic = 'force-dynamic';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // Bypass Next.js's fetch cache so reads never return stale rows.
      global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) },
    }
  );
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

  const { data, error } = await serviceClient()
    .from('host_team_positions')
    .select('id, ccb_position_id, ccb_team_id, position_name')
    .eq('leader_id', leaderId)
    .order('position_name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const { isAdmin, error: adminError } = await verifyAdminAccessDemo(request);
  if (!isAdmin) {
    return NextResponse.json({ error: adminError || 'Unauthorized' }, { status: 401 });
  }

  let body: { leader_id: number; positions: Array<{ ccb_position_id: string; ccb_team_id: string; position_name: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { leader_id, positions } = body;
  if (!leader_id || !Array.isArray(positions) || positions.length === 0) {
    return NextResponse.json({ error: 'leader_id and at least one position are required' }, { status: 400 });
  }

  const db = serviceClient();

  // Replace all positions for this leader
  await db.from('host_team_positions').delete().eq('leader_id', leader_id);

  const rows = positions.map(p => ({
    leader_id,
    ccb_position_id: String(p.ccb_position_id),
    ccb_team_id: String(p.ccb_team_id),
    position_name: p.position_name,
  }));

  const { error: insertError } = await db.from('host_team_positions').insert(rows);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}

// Remove a managed position from a leader. Pass ccb_position_id to remove a
// single position, or omit it to clear all of the leader's positions.
export async function DELETE(request: NextRequest) {
  const { isAdmin, error: adminError } = await verifyAdminAccessDemo(request);
  if (!isAdmin) {
    return NextResponse.json({ error: adminError || 'Unauthorized' }, { status: 401 });
  }

  const leaderId = request.nextUrl.searchParams.get('leader_id');
  if (!leaderId) {
    return NextResponse.json({ error: 'Missing leader_id' }, { status: 400 });
  }
  const positionId = request.nextUrl.searchParams.get('ccb_position_id');

  let query = serviceClient().from('host_team_positions').delete().eq('leader_id', leaderId);
  if (positionId) {
    query = query.eq('ccb_position_id', positionId);
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
