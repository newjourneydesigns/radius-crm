/**
 * Admin CRUD for Message Center messages shown on the Circle Summary events page.
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

function pickFields(body: any) {
  return {
    header: typeof body.header === 'string' ? body.header.trim() : '',
    body_html: typeof body.body_html === 'string' ? body.body_html : '',
    url: body.url ? String(body.url).trim() : null,
    url_label: body.url_label ? String(body.url_label).trim() : null,
    campus_filter: Array.isArray(body.campus_filter)
      ? body.campus_filter.map((c: any) => String(c)).filter(Boolean)
      : [],
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    priority: Number.isFinite(body.priority) ? Math.trunc(body.priority) : 0,
  };
}

export async function GET(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('circle_summary_messages')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data || [] });
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
  const fields = pickFields(body);
  if (!fields.header) {
    return NextResponse.json({ error: 'header is required.' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('circle_summary_messages')
    .insert(fields)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data });
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

  const fields = pickFields(body);
  if (!fields.header) {
    return NextResponse.json({ error: 'header is required.' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('circle_summary_messages')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data });
}

/**
 * PATCH — bulk re-order messages. Body: { orderedIds: string[] }
 * Assigns priorities so orderedIds[0] shows first.
 */
export async function PATCH(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const ids: string[] = Array.isArray(body.orderedIds) ? body.orderedIds : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'orderedIds is required.' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const n = ids.length;
  // Highest priority first: orderedIds[0] gets n, [1] gets n-1, …
  const updates = ids.map((id, i) =>
    supabase
      .from('circle_summary_messages')
      .update({ priority: n - i, updated_at: new Date().toISOString() })
      .eq('id', id)
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from('circle_summary_messages').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
