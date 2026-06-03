// Shared server-side logic for creating Leadership Snapshots, used by both the
// RADIUS staff route (/api/leadership-snapshot) and the leader-facing Circle
// Summary route (/api/circle-summary/health). Keeps scoring, AI generation, and
// the version-1 revision write identical across both entry points.

import { createServiceSupabaseClient } from './server-supabase';
import {
  computeCategoryScores,
  overallScore,
  isComplete,
  DEFAULT_TEMPLATE,
  type SnapshotTemplate,
} from './leadershipSnapshot';
import { generateSnapshotInsights } from './leadershipSnapshotAi';

/** The active (admin-edited) template, or the built-in default if none exists. */
export async function getActiveTemplate(): Promise<SnapshotTemplate> {
  try {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from('leadership_snapshot_templates')
      .select('version, scale, categories')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return DEFAULT_TEMPLATE;
    return {
      version: Number(data.version),
      scale: data.scale,
      categories: data.categories,
    } as SnapshotTemplate;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

const clean = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

export interface CreateSnapshotInput {
  circleLeaderId: number | null;
  leaderLinkConfirmed: boolean;
  submittedBy: string | null;
  respondent_name?: string | null;
  respondent_email?: string | null;
  respondent_phone?: string | null;
  role?: string | null;
  campus?: string | null;
  circle_type?: string | null;
  group_size?: string | null;
  answers: Record<string, number>;
  reflections: Record<string, string>;
  /** Template to score against. Defaults to the active template. */
  template?: SnapshotTemplate;
}

/** The editable content of a snapshot — what we copy into each revision. */
export function buildSnapshotPayload(row: any) {
  return {
    circle_leader_id: row.circle_leader_id ?? null,
    respondent_name: row.respondent_name ?? null,
    respondent_email: row.respondent_email ?? null,
    respondent_phone: row.respondent_phone ?? null,
    role: row.role ?? null,
    campus: row.campus ?? null,
    circle_type: row.circle_type ?? null,
    group_size: row.group_size ?? null,
    answers: row.answers ?? {},
    reflections: row.reflections ?? {},
    category_scores: row.category_scores ?? [],
    overall_score: row.overall_score ?? 0,
    ai_summary: row.ai_summary ?? null,
    ai_category_next_steps: row.ai_category_next_steps ?? null,
  };
}

export async function insertRevision(snapshotId: string, version: number, payload: any, editedBy: string | null) {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from('leadership_snapshot_revisions').insert({
    snapshot_id: snapshotId,
    version,
    data: payload,
    edited_by: editedBy,
  });
  if (error) throw error;
}

/**
 * Validate, score, generate AI insights, and insert a snapshot row plus its
 * version-1 revision. Returns { snapshot } or { error, status }.
 */
export async function createSnapshot(
  input: CreateSnapshotInput
): Promise<{ snapshot?: any; error?: string; status?: number }> {
  const answers = input.answers || {};
  const reflections = input.reflections || {};
  const template = input.template || (await getActiveTemplate());

  if (!isComplete(answers, template)) {
    return { error: 'Please answer every rating question before submitting.', status: 400 };
  }

  const categoryScores = computeCategoryScores(answers, template);
  const overall = overallScore(categoryScores);
  const firstName = (input.respondent_name || '').trim().split(/\s+/)[0] || 'Leader';

  const { summary, categoryNextSteps } = await generateSnapshotInsights({
    firstName,
    role: (input.role || 'Circle Leader').trim() || 'Circle Leader',
    campus: (input.campus || '').trim() || 'your',
    circleType: (input.circle_type || '').trim() || 'Circle',
    groupSize: (input.group_size || '').trim() || 'your group',
    categoryScores,
    reflections,
    categories: template.categories,
  });

  const supabase = createServiceSupabaseClient();
  const { data: snapshot, error } = await supabase
    .from('leadership_snapshots')
    .insert({
      circle_leader_id: input.circleLeaderId,
      leader_link_confirmed: input.leaderLinkConfirmed,
      submitted_by: input.submittedBy,
      respondent_name: clean(input.respondent_name),
      respondent_email: clean(input.respondent_email),
      respondent_phone: clean(input.respondent_phone),
      role: clean(input.role),
      campus: clean(input.campus),
      circle_type: clean(input.circle_type),
      group_size: clean(input.group_size),
      answers,
      reflections,
      category_scores: categoryScores,
      overall_score: overall,
      ai_summary: summary,
      ai_category_next_steps: categoryNextSteps,
      template,
      template_version: template.version,
      version: 1,
    })
    .select()
    .single();

  if (error) return { error: error.message, status: 500 };

  try {
    await insertRevision(snapshot.id, 1, buildSnapshotPayload(snapshot), input.submittedBy);
  } catch (e: any) {
    return { error: e.message || 'Failed to record initial revision.', status: 500 };
  }

  return { snapshot };
}
