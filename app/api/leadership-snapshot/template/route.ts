/**
 * Leadership Snapshot template API.
 *  GET — the active template (any signed-in RADIUS user). Used by the staff
 *        take-it page and the admin editor.
 *  PUT — save a new template version (ACPD admin only). Append-only: the new
 *        version becomes active and previous versions are deactivated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';
import { getActiveTemplate } from '../../../../lib/leadershipSnapshotServer';

export const dynamic = 'force-dynamic';

async function requireUser(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return { user: null, role: null, response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  const supabase = createServiceSupabaseClient();
  const { data: profile, error } = await supabase.from('users').select('id, role').eq('id', user.id).maybeSingle();
  if (error || !profile) return { user: null, role: null, response: NextResponse.json({ error: 'Unable to verify user profile' }, { status: 403 }) };
  return { user, role: profile.role as string | null, response: null };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
const rid = () => Math.random().toString(36).slice(2, 8);

/** Validate + normalize the editor payload into a clean template structure. */
function normalize(body: any): { scale: any[]; categories: any[] } | { error: string } {
  const rawScale = Array.isArray(body?.scale) ? body.scale : [];
  const scale = rawScale
    .map((s: any, i: number) => ({ value: i + 1, label: String(s?.label ?? '').trim() }))
    .filter((s: any) => s.label.length > 0);
  if (scale.length < 2) return { error: 'The rating scale needs at least 2 options.' };

  const rawCats = Array.isArray(body?.categories) ? body.categories : [];
  if (rawCats.length < 1) return { error: 'Add at least one category.' };

  const usedCat = new Set<string>();
  const usedQ = new Set<string>();
  const categories: any[] = [];

  for (const c of rawCats) {
    const label = String(c?.label ?? '').trim();
    if (!label) return { error: 'Every category needs a name.' };

    let id = String(c?.id ?? '').trim() || `c_${slug(label)}_${rid()}`;
    while (usedCat.has(id)) id = `c_${slug(label)}_${rid()}`;
    usedCat.add(id);

    const rawQs = Array.isArray(c?.questions) ? c.questions : [];
    const questions: any[] = [];
    for (const q of rawQs) {
      const stem = String(q?.stem ?? '').trim();
      if (!stem) continue;
      let qid = String(q?.id ?? '').trim() || `q_${rid()}`;
      while (usedQ.has(qid)) qid = `q_${rid()}`;
      usedQ.add(qid);
      questions.push({ id: qid, stem });
    }
    if (questions.length < 1) return { error: `“${label}” needs at least one question.` };

    categories.push({
      id,
      label,
      subtitle: String(c?.subtitle ?? '').trim(),
      reflectionId: String(c?.reflectionId ?? '').trim() || `r_${id}`,
      reflectionPrompt: String(c?.reflectionPrompt ?? '').trim(),
      questions,
    });
  }

  return { scale, categories };
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const template = await getActiveTemplate();
  return NextResponse.json({ template });
}

export async function PUT(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  if (auth.role !== 'ACPD') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const result = normalize(body);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const supabase = createServiceSupabaseClient();

  const { data: latest } = await supabase
    .from('leadership_snapshot_templates')
    .select('version')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = Number(latest?.version || 0) + 1;

  // Deactivate prior versions, then insert the new active one (append-only).
  await supabase.from('leadership_snapshot_templates').update({ is_active: false }).eq('is_active', true);

  const { data, error } = await supabase
    .from('leadership_snapshot_templates')
    .insert({
      version: nextVersion,
      scale: result.scale,
      categories: result.categories,
      is_active: true,
      created_by: auth.user!.id,
    })
    .select('version, scale, categories')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}
