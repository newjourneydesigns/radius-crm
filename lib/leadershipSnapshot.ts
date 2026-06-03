// Single source of truth for the Leadership Snapshot self-assessment: the
// category/question template, the rating scale, and the scoring math. Used by
// the assessment UI, the results view, the API route, and the AI prompt.
//
// Ported from the original "Leadership Snapshot" prototype. Bump TEMPLATE_VERSION
// if the questions change so historical submissions still render against the
// template_version they were captured under.

import type { LeadershipSnapshotCategoryScore } from './supabase';

// v1 = original 1–4 scale; v2 = 1–5 scale. Bumped so historical submissions
// keep the scale they were scored under.
export const TEMPLATE_VERSION = 2;

export const STRENGTH_THRESHOLD = 70; // >= 70% = Strength, else Growth Opportunity

export interface SnapshotQuestion {
  id: string;   // q<cat>_<n>, e.g. q1_1
  stem: string;
}

export interface SnapshotCategory {
  id: string;            // cat1..cat5
  label: string;
  subtitle: string;
  reflectionId: string;  // r1..r5
  reflectionPrompt: string;
  questions: SnapshotQuestion[];
}

export interface ScaleOption {
  value: number;
  label: string;
}

export const SCALE: ScaleOption[] = [
  { value: 1, label: 'Never' },
  { value: 2, label: 'Rarely' },
  { value: 3, label: 'Sometimes' },
  { value: 4, label: 'Often' },
  { value: 5, label: 'Always' },
];

/** Highest value on the rating scale (used for percentage scoring). */
export const SCALE_MAX = SCALE.length;

export const CATEGORIES: SnapshotCategory[] = [
  {
    id: 'cat1',
    label: 'Personal Spiritual Health',
    subtitle: 'How well are you tending your own walk with Jesus?',
    reflectionId: 'r1',
    reflectionPrompt:
      "What does your personal time with Jesus look like right now? What's working — or what feels lacking?",
    questions: [
      { id: 'q1_1', stem: 'I am consistently engaging in personal spiritual practices (prayer, Scripture, worship).' },
      { id: 'q1_2', stem: 'I feel spiritually healthy and full — not running on empty.' },
      { id: 'q1_3', stem: 'I am actively pursuing my own growth and next steps with Jesus.' },
    ],
  },
  {
    id: 'cat2',
    label: 'Circle Leadership',
    subtitle: 'How effectively are you leading your Circle?',
    reflectionId: 'r2',
    reflectionPrompt:
      "What's the current health of your Circle? What are you most proud of — and where do you sense the most room to grow?",
    questions: [
      { id: 'q2_1', stem: 'I come prepared and prayerfully ready to lead each Circle gathering.' },
      { id: 'q2_2', stem: 'I create an environment where people feel safe to be honest and vulnerable.' },
      { id: 'q2_3', stem: 'I actively help people in my Circle take next steps in their journey with Jesus.' },
    ],
  },
  {
    id: 'cat3',
    label: 'Discipleship & Multiplication',
    subtitle: 'Are you raising up the next generation of leaders?',
    reflectionId: 'r3',
    reflectionPrompt:
      "Who are you investing in right now? What's one thing holding you back from more intentional discipleship?",
    questions: [
      { id: 'q3_1', stem: 'I am intentionally investing in someone who could become a future Circle Leader.' },
      { id: 'q3_2', stem: 'I have a clear vision for what it would look like for my Circle to multiply.' },
      { id: 'q3_3', stem: 'I model a disciple-making lifestyle in front of my Circle.' },
    ],
  },
  {
    id: 'cat4',
    label: 'Community & Relationships',
    subtitle: 'How connected are you to the people in your Circle?',
    reflectionId: 'r4',
    reflectionPrompt:
      "How would you describe the level of authentic community in your Circle right now? What's one thing you could do to deepen it?",
    questions: [
      { id: 'q4_1', stem: 'I know what is going on in the lives of the people in my Circle.' },
      { id: 'q4_2', stem: 'I connect with Circle members outside of our regular gathering time.' },
      { id: 'q4_3', stem: 'My Circle feels like genuine family — not just a weekly meeting.' },
    ],
  },
  {
    id: 'cat5',
    label: 'Alignment & Support',
    subtitle: 'How connected are you to the larger Valley Creek family?',
    reflectionId: 'r5',
    reflectionPrompt:
      'Where do you feel most connected to Valley Creek as a whole — and where do you feel most disconnected or unsupported?',
    questions: [
      { id: 'q5_1', stem: "I feel supported and equipped by Valley Creek's leadership structure." },
      { id: 'q5_2', stem: "My Circle's culture is aligned with Valley Creek's values and vision." },
      { id: 'q5_3', stem: 'I am engaged with development opportunities and resources provided for Circle Leaders.' },
    ],
  },
];

export const ROLE_OPTIONS = ['Circle Leader', 'Apprentice Circle Leader'];
export const CAMPUS_OPTIONS = ['Denton', 'Flower Mound', 'Gainesville', 'Lewisville', 'Online'];
export const CIRCLE_TYPE_OPTIONS = ["Men's", "Women's", 'Couples', 'Mixed', 'Young Adults', 'Other'];
export const GROUP_SIZE_OPTIONS = ['1–4 people', '5–8 people', '9–12 people', '13+ people'];

// ── Template ────────────────────────────────────────────────────────────────
// The categories/questions/scale are admin-editable and versioned (stored in
// leadership_snapshot_templates). This constant is the seed/fallback when no
// active template exists in the database yet.
export interface SnapshotTemplate {
  version: number;
  scale: ScaleOption[];
  categories: SnapshotCategory[];
}

export const DEFAULT_TEMPLATE: SnapshotTemplate = {
  version: TEMPLATE_VERSION,
  scale: SCALE,
  categories: CATEGORIES,
};

/** Highest rating value for a template (used for percentage scoring). */
export function scaleMax(template: SnapshotTemplate): number {
  return template.scale.length || SCALE_MAX;
}

/** Every rating question id in a template, in order. */
export function allQuestionIds(template: SnapshotTemplate): string[] {
  return template.categories.flatMap((c) => c.questions.map((q) => q.id));
}

/** Percent score for a single category given the scale's max value. */
export function categoryScore(answers: Record<string, number>, questionIds: string[], max: number): number {
  if (questionIds.length === 0 || max <= 0) return 0;
  const total = questionIds.reduce((sum, qid) => sum + (Number(answers[qid]) || 0), 0);
  return Math.round((total / (questionIds.length * max)) * 100);
}

/** Per-category scores + strength flags for a full set of answers. */
export function computeCategoryScores(
  answers: Record<string, number>,
  template: SnapshotTemplate = DEFAULT_TEMPLATE
): LeadershipSnapshotCategoryScore[] {
  const max = scaleMax(template);
  return template.categories.map((cat) => {
    const score = categoryScore(answers, cat.questions.map((q) => q.id), max);
    return { id: cat.id, label: cat.label, score, isStrength: score >= STRENGTH_THRESHOLD };
  });
}

/**
 * Convert a stored 0-100 percentage into an average rating on a `max`-point
 * scale (one decimal). For a normally-scored submission this equals the literal
 * average of the answers (e.g. all 5s on a 5-point scale → 5.0).
 */
export function pctToRating(pct: number, max: number): number {
  return Math.round((pct / 100) * max * 10) / 10;
}

/** Format a percentage as an "X.X" rating string on a `max`-point scale. */
export function formatRating(pct: number, max: number): string {
  return pctToRating(pct, max).toFixed(1);
}

/** Overall score = average of the category percentages. */
export function overallScore(categoryScores: LeadershipSnapshotCategoryScore[]): number {
  if (categoryScores.length === 0) return 0;
  const sum = categoryScores.reduce((acc, c) => acc + c.score, 0);
  return Math.round(sum / categoryScores.length);
}

/** True when every rating question in the template has a valid (1..max) answer. */
export function isComplete(
  answers: Record<string, number>,
  template: SnapshotTemplate = DEFAULT_TEMPLATE
): boolean {
  const max = scaleMax(template);
  const ids = allQuestionIds(template);
  if (ids.length === 0) return false;
  return ids.every((qid) => {
    const v = Number(answers[qid]);
    return v >= 1 && v <= max;
  });
}
