import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const supabase = createServiceSupabaseClient();
  const { data: profile } = await supabase.from('users').select('id, role').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'ACPD') {
    return { user: null, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { user, response: null };
}

// GET /api/campaigns/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceSupabaseClient();
  const { data: campaign, error } = await supabase
    .from('follow_up_campaigns')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  return NextResponse.json({ campaign });
}

// PATCH /api/campaigns/[id] — update fields or archive/restore
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const body = await req.json();
  const { name, ccb_group_id, ccb_form_id, form_link, due_date, message_template, archived } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (ccb_group_id !== undefined) updates.ccb_group_id = String(ccb_group_id).trim();
  if (ccb_form_id !== undefined) updates.ccb_form_id = String(ccb_form_id).trim();
  if (form_link !== undefined) updates.form_link = form_link.trim();
  if (due_date !== undefined) updates.due_date = due_date;
  if (message_template !== undefined) updates.message_template = message_template.trim();
  if (archived === true) updates.archived_at = new Date().toISOString();
  if (archived === false) updates.archived_at = null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('follow_up_campaigns')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaign: data });
}

// DELETE /api/campaigns/[id] — hard delete (irreversible; prefer PATCH archived=true)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from('follow_up_campaigns')
    .delete()
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
