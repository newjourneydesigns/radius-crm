import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../lib/server-supabase';
import { normalizePhone } from '../../../lib/phoneUtils';

interface PastedPersonInput {
  ccbId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  group?: string;
}

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
  const { name, ccb_group_ids, ccb_form_id, form_link, due_date, message_template, people } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });

  const cleanGroupIds = Array.isArray(ccb_group_ids)
    ? ccb_group_ids.map((id: unknown) => String(id).trim()).filter(Boolean)
    : [];

  // The invite list can come from CCB groups OR a pasted roster — require at least one.
  const pastedPeople: PastedPersonInput[] = Array.isArray(people) ? people : [];
  const seenCcbIds = new Set<string>();
  const validPasted = pastedPeople
    .map((p) => ({
      ccbId: (p.ccbId || '').trim(),
      firstName: (p.firstName || '').trim(),
      lastName: (p.lastName || '').trim(),
      phone: normalizePhone(p.phone || ''),
      email: (p.email || '').trim(),
      group: (p.group || '').trim(),
    }))
    .filter((p) => p.firstName || p.lastName)
    // Drop duplicate CCB ids — they'd violate the per-campaign unique constraint.
    .filter((p) => {
      if (!p.ccbId) return true;
      if (seenCcbIds.has(p.ccbId)) return false;
      seenCcbIds.add(p.ccbId);
      return true;
    });

  if (cleanGroupIds.length === 0 && validPasted.length === 0) {
    return NextResponse.json(
      { error: 'Add at least one CCB Group ID or paste a list of people' },
      { status: 400 },
    );
  }
  if (!ccb_form_id?.trim()) return NextResponse.json({ error: 'CCB Form ID is required' }, { status: 400 });
  if (!due_date) return NextResponse.json({ error: 'Due date is required' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('follow_up_campaigns')
    .insert({
      name: name.trim(),
      ccb_group_ids: cleanGroupIds,
      ccb_form_id: String(ccb_form_id).trim(),
      form_link: (form_link || '').trim(),
      due_date,
      message_template: (message_template || '').trim(),
      created_by: auth.user!.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Seed the invite list from the pasted roster. These are stored exactly like
  // CCB-search "manually added" people so reconcile() checks them against form
  // responses. When the CCB Individual ID and email are mapped, matching is by
  // exact id/email; otherwise it falls back to phone + name. The mapped "Group by"
  // value is stored in source_group_name so the existing per-group filter, sort,
  // and stats in the campaign view work for pasted people with no changes.
  if (validPasted.length > 0) {
    const rows = validPasted.map((p) => ({
      campaign_id: data.id,
      ccb_individual_id: p.ccbId || null,
      first_name: p.firstName,
      last_name: p.lastName,
      email: p.email || null,
      phone: p.phone || null,
      mobile_phone: null,
      in_group: true,
      in_form: false,
      manually_added: true,
      reconcile_status: 'missing',
      source_group_name: p.group || null,
    }));
    const { error: peopleError } = await supabase.from('follow_up_campaign_people').insert(rows);
    if (peopleError) {
      // Roll back the half-created campaign so the admin can retry cleanly
      await supabase.from('follow_up_campaigns').delete().eq('id', data.id);
      return NextResponse.json({ error: `Failed to add pasted people: ${peopleError.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ campaign: data }, { status: 201 });
}
