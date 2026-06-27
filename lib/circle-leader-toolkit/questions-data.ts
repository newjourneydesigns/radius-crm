/**
 * Loader for the active admin-configured dynamic form questions, shared by the
 * /dynamic-questions API route and the server-rendered event form page.
 *
 * The query is identical for every leader (it only varies by today's date), so
 * a short in-memory cache keyed by the date keeps repeated form opens off the
 * database while still picking up edits within a minute. Keyed by date so the
 * active_from/active_to window naturally refreshes at the day rollover.
 */

import { createServiceSupabaseClient } from '../server-supabase';

const QUESTIONS_TTL_MS = 60_000;
let questionsCache: { date: string; expires: number; questions: unknown[] } | null = null;

export async function loadActiveDynamicQuestions(): Promise<{ questions: unknown[]; error?: string }> {
  const today = new Date().toISOString().slice(0, 10);

  if (questionsCache && questionsCache.date === today && questionsCache.expires > Date.now()) {
    return { questions: questionsCache.questions };
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('dynamic_questions')
    .select('id, label, help_text, field_type, options, required, show_when_did_not_meet, show_when_attended, sort_order, response_key')
    .or(`active_from.is.null,active_from.lte.${today}`)
    .or(`active_to.is.null,active_to.gte.${today}`)
    .order('sort_order', { ascending: true });

  if (error) {
    return { questions: [], error: error.message };
  }

  const questions = data || [];
  questionsCache = { date: today, expires: Date.now() + QUESTIONS_TTL_MS, questions };
  return { questions };
}
