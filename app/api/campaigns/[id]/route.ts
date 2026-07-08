import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';
import { ccbFormUrl } from '../../../../lib/campaigns/ccbFormUrl';

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
  const { name, ccb_group_ids, ccb_event_ids, ccb_event_labels, ccb_form_id, due_date, message_template, archived, favorite, group_campus_map } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  // Group IDs are optional (paste-built campaigns have none); store whatever's given.
  if (Array.isArray(ccb_group_ids)) {
    updates.ccb_group_ids = ccb_group_ids.map((id: unknown) => String(id).trim()).filter(Boolean);
  }
  // Event IDs are optional; reconcile pulls day-of check-ins from them.
  let cleanEventIds: string[] | null = null;
  if (Array.isArray(ccb_event_ids)) {
    cleanEventIds = ccb_event_ids.map((id: unknown) => String(id).trim()).filter(Boolean);
    updates.ccb_event_ids = cleanEventIds;
  }
  // Human-readable label per event id; keep only labels for events on the campaign.
  if (ccb_event_labels && typeof ccb_event_labels === 'object' && !Array.isArray(ccb_event_labels)) {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(ccb_event_labels)) {
      const key = String(k).trim();
      const val = String(v ?? '').trim();
      if (key && val && (cleanEventIds === null || cleanEventIds.includes(key))) clean[key] = val;
    }
    updates.ccb_event_labels = clean;
  }
  // Per-group campus overrides ({ group_id: campus }); groups without an entry
  // fall back to name-based auto-detection at reconcile.
  if (group_campus_map && typeof group_campus_map === 'object' && !Array.isArray(group_campus_map)) {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(group_campus_map)) {
      const key = String(k).trim();
      const val = String(v ?? '').trim();
      if (key && val) clean[key] = val;
    }
    updates.group_campus_map = clean;
  }
  if (ccb_form_id !== undefined) {
    updates.ccb_form_id = String(ccb_form_id).trim();
    // Re-derive the form link from the form ID whenever it changes.
    updates.form_link = ccbFormUrl(ccb_form_id);
  }
  if (due_date !== undefined) updates.due_date = due_date;
  if (message_template !== undefined) updates.message_template = message_template.trim();
  if (archived === true) updates.archived_at = new Date().toISOString();
  if (archived === false) updates.archived_at = null;
  if (favorite === true) updates.favorited_at = new Date().toISOString();
  if (favorite === false) updates.favorited_at = null;

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
