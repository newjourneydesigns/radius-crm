/**
 * Admin GET/PUT for the single Circle Leader Resources HTML page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

type Audience = 'circle' | 'host_team';

function parseAudience(value: unknown): Audience {
  return value === 'host_team' ? 'host_team' : 'circle';
}

async function gate(req: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess(req);
  if (!isAdmin) {
    return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
  }
  return null;
}

async function loadOrCreate(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  audience: Audience
) {
  const { data, error } = await supabase
    .from('circle_leader_resources')
    .select('*')
    .eq('audience', audience)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  // The circle doc keeps the legacy singleton flag; the team doc must not, so a
  // legacy unique-on-singleton constraint can't reject the second row.
  const { data: inserted, error: insertError } = await supabase
    .from('circle_leader_resources')
    .insert({ singleton: audience === 'circle', audience, body_html: '' })
    .select()
    .single();
  if (insertError) throw insertError;
  return inserted;
}

export async function GET(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;

  try {
    const audience = parseAudience(new URL(req.url).searchParams.get('audience'));
    const supabase = createServiceSupabaseClient();
    const resource = await loadOrCreate(supabase, audience);
    return NextResponse.json(
      { resource },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to load.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { isAdmin, user, error } = await verifyAdminAccess(req);
  if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const body_html = typeof body.body_html === 'string' ? body.body_html : '';
  const audience = parseAudience(body.audience ?? new URL(req.url).searchParams.get('audience'));

  try {
    const supabase = createServiceSupabaseClient();
    await loadOrCreate(supabase, audience);
    const { data, error: updateError } = await supabase
      .from('circle_leader_resources')
      .update({
        body_html,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      })
      .eq('audience', audience)
      .select()
      .single();
    if (updateError) throw updateError;
    return NextResponse.json({ resource: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Save failed.' }, { status: 500 });
  }
}
