/**
 * Leadership Snapshot settings — the submission window (open/close dates).
 *  GET — current window + computed open state (any signed-in RADIUS user).
 *  PUT — set opens_on / closes_on (ACPD admin only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';
import { getSnapshotWindow, normalizeSnapshotDate } from '../../../../lib/leadershipSnapshotServer';

export const dynamic = 'force-dynamic';

async function requireUser(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return { user: null, role: null, response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  const supabase = createServiceSupabaseClient();
  const { data: profile, error } = await supabase.from('users').select('id, role').eq('id', user.id).maybeSingle();
  if (error || !profile) return { user: null, role: null, response: NextResponse.json({ error: 'Unable to verify user profile' }, { status: 403 }) };
  return { user, role: profile.role as string | null, response: null };
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  return NextResponse.json({ window: await getSnapshotWindow() });
}

export async function PUT(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  if (auth.role !== 'ACPD') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const opens_on = normalizeSnapshotDate(body.opens_on);
  const closes_on = normalizeSnapshotDate(body.closes_on);
  if (opens_on && closes_on && closes_on < opens_on) {
    return NextResponse.json({ error: 'The close date must be on or after the open date.' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from('leadership_snapshot_settings')
    .upsert({ id: 1, opens_on, closes_on, updated_at: new Date().toISOString(), updated_by: auth.user!.id }, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ window: await getSnapshotWindow() });
}
