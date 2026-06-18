/**
 * Touchpoint cadence settings — one central, all-campus target.
 *   GET — current config (any signed-in RADIUS user).
 *   PUT — set target_per_period / period / reminders_enabled (ACPD admin only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../lib/server-supabase';
import { normalizeTouchpointConfig } from '../../../lib/touchpoints';

export const dynamic = 'force-dynamic';

async function requireUser(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return { user: null, role: null, response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  const supabase = createServiceSupabaseClient();
  const { data: profile, error } = await supabase.from('users').select('id, role').eq('id', user.id).maybeSingle();
  if (error || !profile) return { user: null, role: null, response: NextResponse.json({ error: 'Unable to verify user profile' }, { status: 403 }) };
  return { user, role: profile.role as string | null, response: null };
}

async function readConfig() {
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase.from('touchpoint_settings').select('config').eq('id', 1).maybeSingle();
  return normalizeTouchpointConfig(data?.config);
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  return NextResponse.json({ config: await readConfig() });
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

  // Merge over current so a partial PUT only changes what it sends.
  const current = await readConfig();
  const next = normalizeTouchpointConfig({
    target_per_period: body.target_per_period ?? current.target_per_period,
    terms: body.terms ?? current.terms,
  });

  if (next.target_per_period < 1 || next.target_per_period > 50) {
    return NextResponse.json({ error: 'Target must be between 1 and 50.' }, { status: 400 });
  }
  // normalizeTouchpointConfig already drops ranges with a missing/invalid or
  // inverted start/end, so a bad date range simply won't be saved.

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from('touchpoint_settings')
    .upsert({ id: 1, config: next, updated_at: new Date().toISOString(), updated_by: auth.user!.id }, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ config: next });
}
