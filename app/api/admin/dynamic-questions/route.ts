/**
 * Admin CRUD for dynamic questions shown on the Circle Summary submission form.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { normalizeQuestionResponseKey } from '../../../../lib/circle-leader-toolkit/dynamic-question-response-keys';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

const FIELD_TYPES = ['text', 'textarea', 'dropdown', 'multiselect', 'checkbox', 'radio'] as const;
type FieldType = (typeof FIELD_TYPES)[number];

function isFieldType(value: unknown): value is FieldType {
  return typeof value === 'string' && FIELD_TYPES.includes(value as FieldType);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function sortOrder(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

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

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.label !== 'string' || !body.label.trim() || !isFieldType(body.field_type)) {
    return NextResponse.json(
      { error: 'label and a valid field_type are required.' },
      { status: 400 }
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('dynamic_questions')
    .insert({
      label: body.label.trim(),
      help_text: nullableString(body.help_text),
      field_type: body.field_type,
      options: Array.isArray(body.options) ? body.options : [],
      required: !!body.required,
      active_from: nullableString(body.active_from),
      active_to: nullableString(body.active_to),
      sort_order: sortOrder(body.sort_order),
      response_key: normalizeQuestionResponseKey(body.response_key),
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

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { id, ...patch } = body;
  if ('response_key' in patch) {
    patch.response_key = normalizeQuestionResponseKey(patch.response_key);
  }
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
