/**
 * Admin endpoints for reviewing leader-requested Circle info updates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess(req);
  if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'pending';

  const supabase = createServiceSupabaseClient();
  let q = supabase
    .from('circle_info_update_requests')
    .select(
      `id, leader_id, current_day, current_time, current_location,
       requested_day, requested_time, requested_location,
       review_action, review_notes, reviewed_at, created_at,
       circle_leaders!inner(name, campus, acpd)`
    )
    .order('created_at', { ascending: false });

  if (status === 'pending') q = q.is('reviewed_at', null);
  else if (status === 'reviewed') q = q.not('reviewed_at', 'is', null);

  const { data, error: qErr } = await q;
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  return NextResponse.json({ requests: data || [] });
}

export async function PATCH(req: NextRequest) {
  const { isAdmin, user, error } = await verifyAdminAccess(req);
  if (!isAdmin || !user) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { id, action, notes, applyToLeader } = body as {
    id?: string;
    action?: 'applied' | 'rejected' | 'deferred';
    notes?: string;
    applyToLeader?: boolean;
  };
  if (!id || !action) {
    return NextResponse.json({ error: 'id and action are required.' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: row, error: loadErr } = await supabase
    .from('circle_info_update_requests')
    .select('leader_id, requested_day, requested_time, requested_location')
    .eq('id', id)
    .single();
  if (loadErr || !row) {
    return NextResponse.json({ error: loadErr?.message || 'Not found' }, { status: 404 });
  }

  if (applyToLeader && action === 'applied') {
    const patch: any = {};
    if (row.requested_day) patch.day = row.requested_day;
    if (row.requested_time) patch.time = row.requested_time;
    // (no location column on circle_leaders today; surfaced in notes only)
    if (Object.keys(patch).length) {
      await supabase.from('circle_leaders').update(patch).eq('id', row.leader_id);
    }
  }

  const { error: updErr } = await supabase
    .from('circle_info_update_requests')
    .update({
      review_action: action,
      review_notes: notes ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
