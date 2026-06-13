/**
 * CRUD for saved Circle Leader message templates.
 *
 * Templates are global (reusable across every leader) and power the "Templates"
 * quick-send menu in the Messaging section of the Circle Leader Profile page. Any
 * signed-in RADIUS user can manage them. {{name}} tokens are substituted with the
 * leader's name in the composer when a template is applied, not here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

async function requireRadiusUser(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return { user: null, response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  }
  return { user, response: null };
}

export async function GET(req: NextRequest) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('circle_leader_message_templates')
    .select('id, title, subject, body_html, category, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data || [] });
}

function pickFields(body: any) {
  return {
    title: typeof body.title === 'string' ? body.title.trim() : '',
    subject: typeof body.subject === 'string' ? body.subject.trim() : null,
    body_html: typeof body.body_html === 'string' ? body.body_html : '',
    category: typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null,
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const fields = pickFields(body);
  if (!fields.title) return NextResponse.json({ error: 'A template name is required.' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('circle_leader_message_templates')
    .insert({ ...fields, created_by: auth.user!.id })
    .select('id, title, subject, body_html, category, sort_order')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

export async function PUT(req: NextRequest) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = body.id ? String(body.id) : '';
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const fields = pickFields(body);
  if (!fields.title) return NextResponse.json({ error: 'A template name is required.' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('circle_leader_message_templates')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, title, subject, body_html, category, sort_order')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from('circle_leader_message_templates').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
