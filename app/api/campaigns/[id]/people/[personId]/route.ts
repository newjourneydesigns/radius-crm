import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../../../lib/server-supabase';
import { normalizePhone } from '../../../../../../lib/phoneUtils';

export const dynamic = 'force-dynamic';

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

  return NextResponse.json({ success: true, person: data });
}
