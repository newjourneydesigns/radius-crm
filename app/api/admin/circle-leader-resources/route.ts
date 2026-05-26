/**
 * Admin GET/PUT for the single Circle Leader Resources HTML page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

async function gate(req: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess(req);
  if (!isAdmin) {
    return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
  }
  return null;
}

async function loadOrCreate(supabase: ReturnType<typeof createServiceSupabaseClient>) {
  const { data, error } = await supabase
    .from('circle_leader_resources')
    .select('*')
    .eq('singleton', true)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: inserted, error: insertError } = await supabase
    .from('circle_leader_resources')
    .insert({ singleton: true, body_html: '' })
    .select()
    .single();
  if (insertError) throw insertError;
  return inserted;
}

export async function GET(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;

  try {
    const supabase = createServiceSupabaseClient();
    const resource = await loadOrCreate(supabase);
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

  try {
    const supabase = createServiceSupabaseClient();
    await loadOrCreate(supabase);
    const { data, error: updateError } = await supabase
      .from('circle_leader_resources')
      .update({
        body_html,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      })
      .eq('singleton', true)
      .select()
      .single();
    if (updateError) throw updateError;
    return NextResponse.json({ resource: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Save failed.' }, { status: 500 });
  }
}
