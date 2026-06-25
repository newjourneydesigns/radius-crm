import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../lib/server-supabase';

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

// GET /api/campaigns — list campaigns
// ?archived=true to include archived campaigns (default: active only)
export async function GET(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const showArchived = req.nextUrl.searchParams.get('archived') === 'true';
  const supabase = createServiceSupabaseClient();

  let query = supabase
    .from('follow_up_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (!showArchived) {
    query = query.is('archived_at', null);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaigns: data ?? [] });
}

// POST /api/campaigns — create campaign
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const body = await req.json();
  const { name, ccb_group_id, ccb_form_id, form_link, due_date, message_template } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
  if (!ccb_group_id?.trim()) return NextResponse.json({ error: 'CCB Group ID is required' }, { status: 400 });
  if (!ccb_form_id?.trim()) return NextResponse.json({ error: 'CCB Form ID is required' }, { status: 400 });
  if (!due_date) return NextResponse.json({ error: 'Due date is required' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('follow_up_campaigns')
    .insert({
      name: name.trim(),
      ccb_group_id: String(ccb_group_id).trim(),
      ccb_form_id: String(ccb_form_id).trim(),
      form_link: (form_link || '').trim(),
      due_date,
      message_template: (message_template || '').trim(),
      created_by: auth.user!.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaign: data }, { status: 201 });
}
