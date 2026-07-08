import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../../../lib/server-supabase';
import { normalizePhone } from '../../../../../../lib/phoneUtils';
import { computeCounts } from '../../../../../../lib/campaigns/reconcile';
import { fetchAllRows } from '../../../../../../lib/campaigns/fetchAllRows';

export const dynamic = 'force-dynamic';

// Turn a date-only string ('yyyy-MM-dd') into a stored timestamp at noon UTC so
// the chosen calendar date renders the same in every US timezone. Full ISO
// timestamps (e.g. from the bulk follow-up flow) are passed through as-is.
function contactedTimestamp(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00.000Z`
    : new Date(value).toISOString();
}

type AttrValue = string | string[];

// Keep only non-empty values; a value may be a single string or an array.
function cleanAttributes(attrs: unknown): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {};
  if (!attrs || typeof attrs !== 'object') return out;
  for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
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

// PATCH /api/campaigns/[id]/people/[personId]
// Body may include: note, first_name, last_name, email, phone, attributes.
// Used by the inline row editor to fill in / correct a person's data.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; personId: string } },
) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.note === 'string') updates.note = body.note.trim() || null;
  if (typeof body.first_name === 'string') updates.first_name = body.first_name.trim();
  if (typeof body.last_name === 'string') updates.last_name = body.last_name.trim();
  if (typeof body.email === 'string') updates.email = body.email.trim() || null;
  if (typeof body.phone === 'string') updates.phone = normalizePhone(body.phone) || null;
  if (body.attributes !== undefined) {
    const cleaned = cleanAttributes(body.attributes);
    updates.attributes = Object.keys(cleaned).length ? cleaned : null;
  }

  // Manually set / change / clear the contact date. Clearing also drops the
  // recorder so a re-contacted person is re-stamped correctly.
  const contactedChanged = 'contacted_at' in body;
  if (contactedChanged) {
    const raw = body.contacted_at;
    if (raw === null || raw === '') {
      updates.contacted_at = null;
      updates.contacted_by = null;
    } else if (typeof raw === 'string') {
      updates.contacted_at = contactedTimestamp(raw);
      updates.contacted_by = user.id;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('follow_up_campaign_people')
    .update(updates)
    .eq('id', params.personId)
    .eq('campaign_id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Changing the contact date shifts the cached "Contacted" count — refresh it.
  if (contactedChanged) {
    const allPeople = await fetchAllRows<{ reconcile_status: string; contacted_at: string | null }>((from, to) =>
      supabase
        .from('follow_up_campaign_people')
        .select('reconcile_status, contacted_at')
        .eq('campaign_id', params.id)
        .range(from, to),
    );
    const counts = computeCounts(allPeople);
    await supabase
      .from('follow_up_campaigns')
      .update({ contacted_count: counts.contacted })
      .eq('id', params.id);
  }

  return NextResponse.json({ success: true, person: data });
}
