/**
 * Coaching automation org-wide default settings.
 *  GET — current effective defaults (any signed-in RADIUS user).
 *  PUT — replace the default config (ACPD admin only).
 *
 * Per-leader overrides are stored on circle_leaders.coaching_automation_overrides
 * and saved through the normal circle update path, not here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';
import {
  CoachingConfig,
  resolveGlobalDefaults,
} from '../../../../lib/circle-leader-toolkit/coaching/config';

export const dynamic = 'force-dynamic';

async function requireUser(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return { user: null, role: null, response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  }
  const supabase = createServiceSupabaseClient();
  const { data: profile, error } = await supabase.from('users').select('id, role').eq('id', user.id).maybeSingle();
  if (error || !profile) {
    return { user: null, role: null, response: NextResponse.json({ error: 'Unable to verify user profile' }, { status: 403 }) };
  }
  return { user, role: profile.role as string | null, response: null };
}

async function readDefaults(): Promise<CoachingConfig> {
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from('coaching_automation_settings')
    .select('config')
    .eq('id', 1)
    .maybeSingle();
  return resolveGlobalDefaults((data?.config as Record<string, unknown>) ?? null);
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  return NextResponse.json({ defaults: await readDefaults() });
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

  // Normalize whatever the client sent through resolveGlobalDefaults so the stored
  // config is always a complete, validated CoachingConfig (thresholds clamped).
  const normalized = resolveGlobalDefaults((body.config ?? body) as Record<string, unknown>);

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from('coaching_automation_settings')
    .upsert(
      { id: 1, config: normalized, updated_at: new Date().toISOString(), updated_by: auth.user!.id },
      { onConflict: 'id' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ defaults: normalized });
}
