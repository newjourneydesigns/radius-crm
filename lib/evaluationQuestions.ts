import { ScorecardDimension } from './supabase';
import { supabase } from './supabase';

// ── Question Definitions ────────────────────────────────────

export interface EvaluationQuestion {
  key: string;
  label: string;
}

// Default hardcoded questions — used as fallback if no DB questions exist
export const EVALUATION_QUESTIONS: Record<ScorecardDimension, EvaluationQuestion[]> = {
  reach: [
    { key: 'leader_invited_last_30_days', label: 'Leader has personally invited someone in the last 30 days' },
    { key: 'non_leader_invited_recently', label: 'A non-leader member has invited someone recently' },
    { key: 'new_person_attended_60_days', label: 'A new person has attended in the last 60 days' },
    { key: 'leader_talks_about_inviting', label: 'Leader regularly talks about inviting' },
    { key: 'members_expect_to_invite', label: 'Members expect to invite others' },
    { key: 'friends_brought_without_staff', label: 'Friends have been brought without staff prompting' },
    { key: 'group_engages_outside_church', label: 'Group engages with people outside the church' },
  ],
  connect: [
    { key: 'communicates_outside_gathering', label: 'Leader communicates with members outside of gatherings' },
    { key: 'prays_for_each_other_weekly', label: 'Members pray for each other weekly' },
    { key: 'knows_personal_details', label: 'Leader knows personal details about members' },
    { key: 'hangs_outside_circle', label: 'Members hang out outside circle meetings' },
    { key: 'group_conversations_not_leader_centric', label: 'Group conversations are not leader-centric' },
    { key: 'new_people_integrated_quickly', label: 'New people are integrated quickly' },
    { key: 'notices_when_missing', label: 'Group notices when someone is missing' },
  ],
  disciple: [
    { key: 'leader_asks_next_steps', label: 'Leader asks about spiritual next steps' },
    { key: 'leader_knows_member_next_steps', label: 'Leader knows each member\'s next steps' },
    { key: 'members_take_spiritual_actions', label: 'Members are taking spiritual action steps' },
    { key: 'scripture_applied_personally', label: 'Scripture is applied personally, not just discussed' },
    { key: 'growth_stories_shared', label: 'Growth stories are shared within the group' },
    { key: 'leader_follows_up_commitments', label: 'Leader follows up on commitments members make' },
    { key: 'measurable_growth_last_month', label: 'Measurable spiritual growth in the last month' },
  ],
  develop: [
    { key: 'future_leader_identified', label: 'A future leader has been identified' },
    { key: 'person_knows_they_are_developed', label: 'That person knows they are being developed' },
    { key: 'given_real_responsibility', label: 'They have been given real responsibility' },
    { key: 'helps_lead_regularly', label: 'They help lead regularly' },
    { key: 'meets_outside_circle', label: 'Leader meets with them outside circle' },
    { key: 'leadership_discussed', label: 'Leadership and multiplication is discussed openly' },
    { key: 'could_run_group_if_needed', label: 'Could run the group if needed' },
  ],
};

// ── Scoring Logic ───────────────────────────────────────────

export type AnswerValue = 'yes' | 'no' | 'unsure' | null;

export interface CategoryAnswer {
  question_key: string;
  answer: AnswerValue;
}

export interface CategoryEvaluation {
  id?: number;
  leader_id: number;
  category: ScorecardDimension;
  manual_override_score: number | null;
  context_notes: string;
  answers: Record<string, AnswerValue>;
  updated_at?: string;
}

/**
 * Calculate the suggested score from a set of answers.
 * Returns null if no questions were answered.
 */
export function calculateSuggestedScore(answers: Record<string, AnswerValue>): number | null {
  let yesCount = 0;
  let questionCount = 0;

  for (const answer of Object.values(answers)) {
    if (answer === 'yes' || answer === 'no' || answer === 'unsure') {
      questionCount++;
      if (answer === 'yes') yesCount++;
      // 'unsure' counts as answered but not as yes (same effect as 'no' on ratio)
    }
  }

  if (questionCount === 0) return null;

  const ratio = yesCount / questionCount;

  if (ratio <= 0.20) return 1;
  if (ratio <= 0.40) return 2;
  if (ratio <= 0.60) return 3;
  if (ratio <= 0.80) return 4;
  return 5;
}

/**
 * Determine the final score for a category.
 * Priority: manual override > suggested > fallback (existing stored score)
 */
export function getFinalScore(
  manualOverride: number | null,
  suggestedScore: number | null,
  fallbackScore: number | null
): number | null {
  if (manualOverride !== null) return manualOverride;
  if (suggestedScore !== null) return suggestedScore;
  return fallbackScore;
}

// ── Database Question Loading ───────────────────────────────

let _cachedQuestions: Record<ScorecardDimension, EvaluationQuestion[]> | null = null;
let _cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Load evaluation questions from the scorecard_questions table.
 * Falls back to hardcoded EVALUATION_QUESTIONS if DB table doesn't exist or is empty.
 * Caches results for 1 minute.
 */
export async function loadEvaluationQuestions(): Promise<Record<ScorecardDimension, EvaluationQuestion[]>> {
  // Return cache if still valid
  if (_cachedQuestions && (Date.now() - _cacheTimestamp) < CACHE_TTL) {
    return _cachedQuestions;
  }

  try {
    const { data, error } = await supabase
      .from('scorecard_questions')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      // Fallback to hardcoded defaults
      _cachedQuestions = EVALUATION_QUESTIONS;
      _cacheTimestamp = Date.now();
      return EVALUATION_QUESTIONS;
    }

    // Group by category
    const result: Record<string, EvaluationQuestion[]> = {
      reach: [],
      connect: [],
      disciple: [],
      develop: [],
    };

    for (const q of data) {
      if (result[q.category]) {
        result[q.category].push({
          key: q.question_key,
          label: q.label,
        });
      }
    }

    _cachedQuestions = result as Record<ScorecardDimension, EvaluationQuestion[]>;
    _cacheTimestamp = Date.now();
    return _cachedQuestions;
  } catch (err) {
    console.error('Error loading evaluation questions from DB:', err);
    // Fallback to hardcoded defaults
    return EVALUATION_QUESTIONS;
  }
}

/**
 * Invalidate the cached questions (call after modifying questions in settings)
 */
export function invalidateQuestionsCache() {
  _cachedQuestions = null;
  _cacheTimestamp = 0;
}

/**
 * Build a question key → label map for a given set of questions.
 * Used to persist question text with answers.
 */
export function buildQuestionLabelMap(questions: Record<ScorecardDimension, EvaluationQuestion[]>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const category of Object.values(questions)) {
    for (const q of category) {
      map[q.key] = q.label;
    }
  }
  return map;
}
