import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../lib/server-supabase';
import { normalizePhone } from '../../../lib/phoneUtils';
import { dedupePeople, type PastedPerson, type AttrValue } from '../../../lib/campaigns/parseRoster';
import { ccbFormUrl } from '../../../lib/campaigns/ccbFormUrl';

interface PastedPersonInput {
  ccbId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  attributes?: Record<string, unknown>;
}

// Keep only non-empty values, so the stored attributes stay clean. Values may be
// a single string or an array (a person listed more than once with different values).
function cleanAttributes(attrs: Record<string, unknown> | undefined): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {};
  if (!attrs || typeof attrs !== 'object') return out;
  for (const [k, v] of Object.entries(attrs)) {
    const key = String(k).trim();
    if (!key) continue;
    if (Array.isArray(v)) {
      const arr = v.map((x) => String(x).trim()).filter(Boolean);
      if (arr.length === 1) out[key] = arr[0];
      else if (arr.length > 1) out[key] = arr;
    } else {
      const val = v == null ? '' : String(v).trim();
      if (val) out[key] = val;
    }
  }
  return out;
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
  const { name, ccb_group_ids, ccb_form_id, due_date, message_template, people } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });

  const cleanGroupIds = Array.isArray(ccb_group_ids)
    ? ccb_group_ids.map((id: unknown) => String(id).trim()).filter(Boolean)
    : [];

  // The invite list can come from CCB groups OR a pasted roster — require at least one.
  const pastedPeople: PastedPersonInput[] = Array.isArray(people) ? people : [];
  const normalized: PastedPerson[] = pastedPeople
    .map((p) => ({
      ccbId: (p.ccbId || '').trim(),
      firstName: (p.firstName || '').trim(),
      lastName: (p.lastName || '').trim(),
      phone: normalizePhone(p.phone || ''),
      email: (p.email || '').trim(),
      attributes: cleanAttributes(p.attributes),
    }))
    .filter((p) => p.firstName || p.lastName);

  // Collapse rows sharing a CCB id into one invite, merging their attribute values
  // (so a person on multiple teams keeps every team). One row per person also keeps
  // the per-campaign unique constraint and the completion math person-accurate.
  const validPasted = dedupePeople(normalized).people;

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
      // Form link is always derived from the form ID (same URL shape every time)
      form_link: ccbFormUrl(ccb_form_id),
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
  // exact id/email; otherwise it falls back to phone + name. Every non-core column
  // is stored in `attributes`, so the campaign view can group by any header.
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
      attributes: Object.keys(p.attributes).length ? p.attributes : null,
    }));

    // Insert in chunks so a large pasted roster doesn't hit request size limits.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: peopleError } = await supabase
        .from('follow_up_campaign_people')
        .insert(rows.slice(i, i + CHUNK));
      if (peopleError) {
        // Roll back the half-created campaign (cascades to any inserted people) so the admin can retry cleanly
        await supabase.from('follow_up_campaigns').delete().eq('id', data.id);
        return NextResponse.json({ error: `Failed to add pasted people: ${peopleError.message}` }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ campaign: data }, { status: 201 });
}
