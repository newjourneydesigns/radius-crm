/**
 * Admin CRUD for dynamic questions shown on the Circle Summary submission form.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

const FIELD_TYPES = ['text', 'textarea', 'dropdown', 'multiselect', 'checkbox', 'radio'] as const;

async function gate(req: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess(req);
  if (!isAdmin) {
    return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('dynamic_questions')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questions: data || [] });
}

export async function POST(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.label || !FIELD_TYPES.includes(body.field_type)) {
    return NextResponse.json(
      { error: 'label and a valid field_type are required.' },
      { status: 400 }
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('dynamic_questions')
    .insert({
      label: body.label,
      help_text: body.help_text ?? null,
      field_type: body.field_type,
      options: body.options ?? [],
      required: !!body.required,
      active_from: body.active_from ?? null,
      active_to: body.active_to ?? null,
      sort_order: body.sort_order ?? 0,
      show_when_did_not_meet: !!body.show_when_did_not_meet,
      show_when_attended: body.show_when_attended !== false,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ question: data });
}

export async function PUT(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { id, ...patch } = body;
  const { data, error } = await supabase
    .from('dynamic_questions')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ question: data });
}

export async function DELETE(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from('dynamic_questions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
