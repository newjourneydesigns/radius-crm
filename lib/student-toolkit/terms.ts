/**
 * Student ministry runs on semesters, and the CCB groups behind a circle are
 * rebuilt every term. Group config, directory rows, roster membership and
 * attendance all carry a term slug so a Fall roster never blends into Spring.
 */

import { DateTime } from 'luxon';
import { APP_TIME_ZONE } from '../dateUtils';

export type TermSlug = string; // '2026-fall' | '2026-spring'

/**
 * Fall runs August through December; everything else is Spring. Summer has no
 * term of its own — circles pause, and a leader looking at the app in July
 * should still see the roster they finished Spring with.
 */
export function currentTerm(now: DateTime = DateTime.now().setZone(APP_TIME_ZONE)): TermSlug {
  return now.month >= 8 ? `${now.year}-fall` : `${now.year}-spring`;
}

/** First day of a term — the lower bound for an attendance pull. */
export function termStartDate(term: TermSlug): string {
  const [yearRaw, season] = term.split('-');
  const year = Number(yearRaw);
  if (!Number.isFinite(year)) {
    return DateTime.now().setZone(APP_TIME_ZONE).minus({ weeks: 26 }).toISODate()!;
  }
  return season === 'fall' ? `${year}-08-01` : `${year}-01-01`;
}

/**
 * Chronological rank. Terms don't sort correctly as plain strings — '2026-fall'
 * sorts after '2026-spring' alphabetically but comes later in the year, so any
 * lexicographic ordering gets the two backwards.
 */
export function termSortKey(term: TermSlug): number {
  const [yearRaw, season] = term.split('-');
  const year = Number(yearRaw);
  if (!Number.isFinite(year)) return 0;
  return year * 10 + (season === 'fall' ? 1 : 0);
}

export function isValidTerm(term: string | null | undefined): term is TermSlug {
  return !!term && /^\d{4}-(fall|spring)$/.test(term);
}

/**
 * The term the toolkit is actually operating in.
 *
 * Driven by what staff have configured, not by the calendar: whichever term has
 * active CCB group mappings wins, latest first. Rosters are term-scoped, so a
 * hardcoded August flip would silently empty every leader's roster on a date
 * nobody chose. `currentTerm()` is only the fallback for a fresh install.
 */
export async function resolveActiveTerm(): Promise<TermSlug> {
  const { createServiceSupabaseClient } = await import('../server-supabase');
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('student_ministry_groups')
    .select('term')
    .eq('active', true);

  if (error || !data?.length) return currentTerm();

  const terms = Array.from(new Set(data.map((row) => String(row.term))));
  terms.sort((a, b) => termSortKey(b) - termSortKey(a));
  return terms[0] ?? currentTerm();
}

/** "2026-fall" → "Fall 2026", for admin screens and empty states. */
export function formatTerm(term: TermSlug): string {
  const [year, season] = term.split('-');
  if (!year || !season) return term;
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
}
