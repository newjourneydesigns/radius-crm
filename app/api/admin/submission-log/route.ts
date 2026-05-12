/**
 * Admin audit log of every Circle Event Summary submission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess(req);
  if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 500);
  const statusFilter = url.searchParams.get('status');
  const leaderId = url.searchParams.get('leader_id');

  const supabase = createServiceSupabaseClient();
  let q = supabase
    .from('circle_event_summaries')
    .select(
      `id, leader_id, ccb_event_id, ccb_group_id, occurrence, did_not_meet,
       did_not_meet_reason, topic, status, ccb_error, ccb_submitted_at,
       submitted_via, created_at,
       circle_leaders!inner(name, campus, acpd)`
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusFilter) q = q.eq('status', statusFilter);
  if (leaderId) q = q.eq('leader_id', leaderId);

  const { data, error: qErr } = await q;
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  return NextResponse.json({ submissions: data || [] });
}
