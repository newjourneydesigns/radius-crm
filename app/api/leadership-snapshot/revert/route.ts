/**
 * Revert a Leadership Snapshot to a previous version. Loads that version's
 * stored payload, applies it to the live row, and records the revert itself as
 * a new revision so history stays append-only and auditable. Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

const EDITABLE_KEYS = [
  'circle_leader_id',
  'respondent_name',
  'respondent_email',
  'respondent_phone',
  'role',
  'campus',
  'circle_type',
  'group_size',
  'answers',
  'reflections',
  'category_scores',
  'overall_score',
  'ai_summary',
  'ai_category_next_steps',
] as const;

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return { user: null, response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  }
  const supabase = createServiceSupabaseClient();
  const { data: profile, error } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !profile) {
    return { user: null, response: NextResponse.json({ error: 'Unable to verify user profile' }, { status: 403 }) };
  }
  if (profile.role !== 'ACPD') {
    return { user: null, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = body.id ? String(body.id) : '';
  const targetVersion = Number(body.version);
  if (!id || !Number.isInteger(targetVersion) || targetVersion < 1) {
    return NextResponse.json({ error: 'id and a valid version are required' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  const { data: existing, error: loadError } = await supabase
    .from('leadership_snapshots')
    .select('id, version')
    .eq('id', id)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: revision, error: revError } = await supabase
    .from('leadership_snapshot_revisions')
    .select('data, version')
    .eq('snapshot_id', id)
    .eq('version', targetVersion)
    .maybeSingle();
  if (revError) return NextResponse.json({ error: revError.message }, { status: 500 });
  if (!revision) return NextResponse.json({ error: 'That version was not found.' }, { status: 404 });

  const payload = (revision.data || {}) as Record<string, any>;
  const updates: any = { updated_by: auth.user!.id };
  for (const key of EDITABLE_KEYS) {
    if (key in payload) updates[key] = payload[key];
  }

  const nextVersion = Number(existing.version || 1) + 1;
  updates.version = nextVersion;

  const { data: updated, error: updateError } = await supabase
    .from('leadership_snapshots')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { error: revInsertError } = await supabase.from('leadership_snapshot_revisions').insert({
    snapshot_id: id,
    version: nextVersion,
    data: { ...payload, _reverted_from_version: targetVersion },
    edited_by: auth.user!.id,
  });
  if (revInsertError) return NextResponse.json({ error: revInsertError.message }, { status: 500 });

  return NextResponse.json({ snapshot: updated, revertedFrom: targetVersion });
}
