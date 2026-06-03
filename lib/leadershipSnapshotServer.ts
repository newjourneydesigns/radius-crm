// Shared server-side logic for creating Leadership Snapshots, used by both the
// RADIUS staff route (/api/leadership-snapshot) and the leader-facing Circle
// Summary route (/api/circle-summary/health). Keeps scoring, AI generation, and
// the version-1 revision write identical across both entry points.

import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from './server-supabase';
import {
  computeCategoryScores,
  overallScore,
  isComplete,
  DEFAULT_TEMPLATE,
  type SnapshotTemplate,
} from './leadershipSnapshot';
import { generateSnapshotInsights } from './leadershipSnapshotAi';

export interface SnapshotWindow {
  opensOn: string | null;  // YYYY-MM-DD, inclusive
  closesOn: string | null; // YYYY-MM-DD, inclusive
  isOpen: boolean;
  status: 'scheduled' | 'open' | 'closed';
}

export function normalizeSnapshotDate(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const date = DateTime.fromObject(
      { year: Number(us[3]), month: Number(us[1]), day: Number(us[2]) },
      { zone: 'America/Chicago' }
    );
    return date.isValid ? date.toISODate() : null;
  }

  return null;
}

export function snapshotWindowStatus(
  today: string,
  opensOn: string | null,
  closesOn: string | null
): SnapshotWindow['status'] {
  if (opensOn && today < opensOn) return 'scheduled';
  if (closesOn && today > closesOn) return 'closed';
  return 'open';
}

function buildSnapshotWindow(opensOn: string | null, closesOn: string | null): SnapshotWindow {
  const today = DateTime.now().setZone('America/Chicago').toISODate() || new Date().toISOString().slice(0, 10);
  const status = snapshotWindowStatus(today, opensOn, closesOn);
  return { opensOn, closesOn, isOpen: status === 'open', status };
}

/**
 * The current submission window. Open when today (church-local) falls within
 * [opensOn, closesOn]; NULL bounds are treated as unbounded. Fails OPEN if the
 * settings table doesn't exist yet, so the form isn't accidentally locked.
 */
export async function getSnapshotWindow(): Promise<SnapshotWindow> {
  try {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from('leadership_snapshot_settings')
      .select('opens_on, closes_on')
      .eq('id', 1)
      .maybeSingle();
    if (error) return buildSnapshotWindow(null, null);

    const opensOn = normalizeSnapshotDate(data?.opens_on);
    const closesOn = normalizeSnapshotDate(data?.closes_on);
    return buildSnapshotWindow(opensOn, closesOn);
  } catch {
    return buildSnapshotWindow(null, null);
  }
}

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

type SnapshotPayload = {
  circle_leader_id: number | null;
  respondent_name: string | null;
  respondent_email: string | null;
  respondent_phone: string | null;
  role: string | null;
  campus: string | null;
  circle_type: string | null;
  group_size: string | null;
  answers: Record<string, number>;
  reflections: Record<string, string>;
  category_scores: unknown[];
  overall_score: number;
  ai_summary: string | null;
  ai_category_next_steps: Record<string, string> | null;
};

type SnapshotRow = Partial<SnapshotPayload> & {
  id?: string;
  ai_category_next_steps?: Record<string, string> | null;
};

/** The editable content of a snapshot — what we copy into each revision. */
export function buildSnapshotPayload(row: SnapshotRow): SnapshotPayload {
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

export async function insertRevision(snapshotId: string, version: number, payload: SnapshotPayload, editedBy: string | null) {
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
): Promise<{ snapshot?: SnapshotRow; error?: string; status?: number }> {
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
  const snapshotRow = snapshot as SnapshotRow;

  try {
    await insertRevision(String(snapshotRow.id), 1, buildSnapshotPayload(snapshotRow), input.submittedBy);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to record initial revision.';
    return { error: message, status: 500 };
  }

  return { snapshot: snapshotRow };
}
