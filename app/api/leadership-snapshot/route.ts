/**
 * Leadership Snapshot API — Circle Leader self-assessment submissions.
 *
 * All access goes through the service-role client after verifying the RADIUS
 * user session (same approach as the Circle Summary inbox). Submitting is open
 * to any signed-in user; reviewing other leaders, editing, and confirming the
 * leader link require the ACPD (admin) role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../lib/server-supabase';
import { computeCategoryScores, overallScore, isComplete, DEFAULT_TEMPLATE, type SnapshotTemplate } from '../../../lib/leadershipSnapshot';
import { generateSnapshotInsights } from '../../../lib/leadershipSnapshotAi';
import { createSnapshot, insertRevision, buildSnapshotPayload } from '../../../lib/leadershipSnapshotServer';

export const dynamic = 'force-dynamic';

type Profile = { id: string; email: string | null; name: string | null; role: string | null };

async function requireRadiusUser(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return { user: null, profile: null, response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  }
  const supabase = createServiceSupabaseClient();
  const { data: profile, error } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !profile) {
    return { user: null, profile: null, response: NextResponse.json({ error: 'Unable to verify user profile' }, { status: 403 }) };
  }
  return { user, profile: profile as Profile, response: null };
}

function isAdmin(profile: Profile | null): boolean {
  return profile?.role === 'ACPD';
}

/** Case-insensitive lookup of a Circle Leader by email. Returns id or null. */
async function matchLeaderByEmail(email: string | null): Promise<number | null> {
  if (!email || !email.trim()) return null;
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from('circle_leaders')
    .select('id')
    .ilike('email', email.trim())
    .limit(1);
  return data && data.length > 0 ? Number(data[0].id) : null;
}

// ── GET ────────────────────────────────────────────────────────────────────
// ?id=<uuid>        single submission + its revisions (admin or owner)
// ?leader_id=<n>    a leader's submissions, newest first (admin)
// ?unlinked=true    submissions awaiting leader-link confirmation (admin)
// (no params)       all submissions, newest first (admin)
export async function GET(req: NextRequest) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  const supabase = createServiceSupabaseClient();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const leaderId = url.searchParams.get('leader_id');
  const unlinked = url.searchParams.get('unlinked');

  if (id) {
    const { data: snapshot, error } = await supabase
      .from('leadership_snapshots')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!snapshot) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Owner can read their own; everyone else must be admin.
    if (!isAdmin(auth.profile) && snapshot.submitted_by !== auth.user!.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: revisions } = await supabase
      .from('leadership_snapshot_revisions')
      .select('id, snapshot_id, version, edited_by, created_at')
      .eq('snapshot_id', id)
      .order('version', { ascending: false });

    return NextResponse.json({ snapshot, revisions: revisions || [] });
  }

  // List endpoints are admin-only.
  if (!isAdmin(auth.profile)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let query = supabase
    .from('leadership_snapshots')
    .select('*')
    .order('created_at', { ascending: false });

  if (leaderId) query = query.eq('circle_leader_id', parseInt(leaderId, 10));
  if (unlinked === 'true') query = query.eq('leader_link_confirmed', false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshots: data || [] });
}

// ── POST ───────────────────────────────────────────────────────────────────
// Create a submission: validate, score, auto-match leader, generate AI, store
// the row + a version-1 revision. Open to any signed-in RADIUS user.
export async function POST(req: NextRequest) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const respondentEmail = (body.respondent_email || '').trim() || null;
  const circleLeaderId =
    body.circle_leader_id != null ? Number(body.circle_leader_id) : await matchLeaderByEmail(respondentEmail);

  const { snapshot, error, status } = await createSnapshot({
    circleLeaderId,
    leaderLinkConfirmed: false,
    submittedBy: auth.user!.id,
    respondent_name: body.respondent_name,
    respondent_email: respondentEmail,
    respondent_phone: body.respondent_phone,
    role: body.role,
    campus: body.campus,
    circle_type: body.circle_type,
    group_size: body.group_size,
    answers: (body.answers || {}) as Record<string, number>,
    reflections: (body.reflections || {}) as Record<string, string>,
  });

  if (error) return NextResponse.json({ error }, { status: status || 500 });
  return NextResponse.json({ snapshot }, { status: 201 });
}

// ── PATCH ──────────────────────────────────────────────────────────────────
// action 'confirm_link' — set/confirm the Circle Leader link (no version bump).
// otherwise — edit content: recompute scores, bump version, write a revision.
// AI is regenerated only when { regenerate: true } is passed. Admin-only.
export async function PATCH(req: NextRequest) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;
  if (!isAdmin(auth.profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = body.id ? String(body.id) : '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: existing, error: loadError } = await supabase
    .from('leadership_snapshots')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Confirm / correct the leader link only — metadata, not content history.
  if (body.action === 'confirm_link') {
    const updates: any = { leader_link_confirmed: body.leader_link_confirmed !== false };
    if (body.circle_leader_id !== undefined) {
      updates.circle_leader_id = body.circle_leader_id != null ? Number(body.circle_leader_id) : null;
    }
    const { data, error } = await supabase
      .from('leadership_snapshots')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ snapshot: data });
  }

  // Content edit. Score against the template this submission was taken under
  // (frozen on the row) so edits never re-grade against newer questions.
  const template = (existing.template as SnapshotTemplate) || DEFAULT_TEMPLATE;
  const updates: any = { updated_by: auth.user!.id };
  const textFields = ['respondent_name', 'respondent_email', 'respondent_phone', 'role', 'campus', 'circle_type', 'group_size'];
  for (const f of textFields) {
    if (body[f] !== undefined) updates[f] = body[f] == null ? null : String(body[f]).trim() || null;
  }
  if (body.reflections !== undefined) updates.reflections = body.reflections || {};

  let answersChanged = false;
  if (body.answers !== undefined) {
    const answers = body.answers as Record<string, number>;
    if (!isComplete(answers, template)) {
      return NextResponse.json({ error: 'Every rating question must have a value.' }, { status: 400 });
    }
    const categoryScores = computeCategoryScores(answers, template);
    updates.answers = answers;
    updates.category_scores = categoryScores;
    updates.overall_score = overallScore(categoryScores);
    answersChanged = true;
  }

  // Optionally regenerate AI insights (costs Gemini quota — opt-in).
  if (body.regenerate === true) {
    const answers = (updates.answers || existing.answers) as Record<string, number>;
    const categoryScores = computeCategoryScores(answers, template);
    const reflections = (updates.reflections || existing.reflections) as Record<string, string>;
    const firstName = String(updates.respondent_name ?? existing.respondent_name ?? '').trim().split(/\s+/)[0] || 'Leader';
    const { summary, categoryNextSteps } = await generateSnapshotInsights({
      firstName,
      role: String(updates.role ?? existing.role ?? 'Circle Leader'),
      campus: String(updates.campus ?? existing.campus ?? 'your'),
      circleType: String(updates.circle_type ?? existing.circle_type ?? 'Circle'),
      groupSize: String(updates.group_size ?? existing.group_size ?? 'your group'),
      categoryScores,
      reflections,
      categories: template.categories,
    });
    if (summary !== null) updates.ai_summary = summary;
    if (categoryNextSteps !== null) updates.ai_category_next_steps = categoryNextSteps;
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

  try {
    await insertRevision(id, nextVersion, buildSnapshotPayload(updated), auth.user!.id);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to record revision.' }, { status: 500 });
  }

  return NextResponse.json({ snapshot: updated, answersChanged });
}
