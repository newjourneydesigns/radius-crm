/**
 * Read path for the Student Leader Toolkit roster.
 *
 * Everything here is pure Supabase — the nightly sync in `attendance-sync.ts`
 * has already done the CCB work. Opening the roster makes no upstream calls.
 *
 * What a leader sees is deliberately narrow: first name, last name, birthday,
 * and the two dates that drive shepherding — last time at their circle, last
 * time at the movement. No phone, no email, no address, and no call/text
 * affordance, unlike the adult roster. These are minors; leaders reach them
 * through GroupMe, outside this app.
 */

import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../server-supabase';
import { APP_TIME_ZONE } from '../dateUtils';
import { resolveActiveTerm, type TermSlug } from './terms';
import type { StudentAttendanceKind, StudentRosterRow } from '../supabase';

/** Days without attending before a student surfaces in the absent alerts. */
export const ABSENCE_THRESHOLD_DAYS = 15;

/** How long a snooze holds before the student reappears in the alerts. */
export const SNOOZE_DURATION_DAYS = 7;

export type StudentRosterResult = {
  rows: StudentRosterRow[];
  term: TermSlug;
  /**
   * False when the leader's campus has no CCB group mapped for this term. The
   * roster still works — a leader can build their list — but every attendance
   * date reads as unknown, and the UI says so rather than implying nobody has
   * shown up.
   */
  attendanceConnected: boolean;
  /** Set when the read itself failed, so the page can say so instead of rendering empty. */
  error?: string;
};

/** Whole days between an ISO date and today, or null when there's no date. */
export function daysSince(
  isoDate: string | null | undefined,
  now: DateTime = DateTime.now().setZone(APP_TIME_ZONE)
): number | null {
  if (!isoDate) return null;
  const then = DateTime.fromISO(isoDate, { zone: APP_TIME_ZONE });
  if (!then.isValid) return null;
  return Math.floor(now.startOf('day').diff(then.startOf('day'), 'days').days);
}

/**
 * Is this student currently worth surfacing as absent?
 *
 * A snooze is honored only until the student shows up again — the same rule the
 * Circle Leader Toolkit applies client-side. Storing what the absence was when
 * the snooze was set is what makes that self-voiding possible.
 */
export function isAbsentAlert(
  row: Pick<StudentRosterRow, 'lastAttendedCircle' | 'snoozed_until'>,
  now: DateTime = DateTime.now().setZone(APP_TIME_ZONE)
): boolean {
  const days = daysSince(row.lastAttendedCircle, now);
  if (days === null) return false; // unknown ≠ absent
  if (days < ABSENCE_THRESHOLD_DAYS) return false;
  if (row.snoozed_until && DateTime.fromISO(row.snoozed_until) > now) return false;
  return true;
}

/** True when this campus has at least one CCB group mapped for the term. */
export async function isAttendanceConnected(campus: string | null, term: TermSlug): Promise<boolean> {
  if (!campus) return false;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('student_ministry_groups')
    .select('id')
    .eq('campus', campus)
    .eq('term', term)
    .eq('active', true)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * Latest attendance date per student per kind.
 *
 * One query over the roster's ids, reduced in memory. Rosters are ~10-30
 * students, so this beats a per-student round trip and avoids needing an RPC.
 */
async function loadLastAttended(
  individualIds: string[]
): Promise<Record<string, Partial<Record<StudentAttendanceKind, string>>>> {
  const byStudent: Record<string, Partial<Record<StudentAttendanceKind, string>>> = {};
  if (!individualIds.length) return byStudent;

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('student_attendance')
    .select('ccb_individual_id, kind, occurrence')
    .in('ccb_individual_id', individualIds)
    .order('occurrence', { ascending: false });

  if (error) {
    console.error('[student-toolkit] Failed to load attendance:', error);
    return byStudent;
  }

  // Rows arrive newest first, so the first hit per (student, kind) is the answer.
  for (const row of data ?? []) {
    const id = String(row.ccb_individual_id);
    const kind = row.kind as StudentAttendanceKind;
    if (!byStudent[id]) byStudent[id] = {};
    if (!byStudent[id][kind]) byStudent[id][kind] = row.occurrence as string;
  }

  return byStudent;
}

/** The leader's roster, with both attendance dates resolved. */
export async function loadStudentRoster(
  leader: { id: number | string; campus: string | null; term?: string | null },
  options?: { term?: TermSlug }
): Promise<StudentRosterResult> {
  const term = options?.term ?? (leader.term as TermSlug) ?? (await resolveActiveTerm());
  const supabase = createServiceSupabaseClient();

  const { data: members, error: membersError } = await supabase
    .from('student_roster_members')
    .select('ccb_individual_id, snoozed_until')
    .eq('student_leader_id', leader.id)
    .eq('term', term)
    .is('removed_at', null);

  if (membersError) {
    console.error('[student-toolkit] Failed to load roster members:', membersError);
    return { rows: [], term, attendanceConnected: false, error: 'Could not load your roster.' };
  }

  const attendanceConnected = await isAttendanceConnected(leader.campus, term);

  if (!members?.length) {
    return { rows: [], term, attendanceConnected };
  }

  const ids = members.map((m) => String(m.ccb_individual_id));
  const snoozeById = new Map(members.map((m) => [String(m.ccb_individual_id), m.snoozed_until]));

  const [{ data: directory, error: directoryError }, lastAttended] = await Promise.all([
    supabase
      .from('student_directory_cache')
      .select('ccb_individual_id, first_name, last_name, full_name, birthday, grade, is_active')
      .in('ccb_individual_id', ids),
    loadLastAttended(ids),
  ]);

  if (directoryError) {
    console.error('[student-toolkit] Failed to load student directory:', directoryError);
  }

  const directoryById = new Map((directory ?? []).map((d) => [String(d.ccb_individual_id), d]));

  const rows: StudentRosterRow[] = ids.map((id) => {
    const entry = directoryById.get(id);
    return {
      ccb_individual_id: id,
      first_name: entry?.first_name ?? null,
      last_name: entry?.last_name ?? null,
      full_name: entry?.full_name ?? null,
      birthday: entry?.birthday ?? null,
      grade: entry?.grade ?? null,
      lastAttendedCircle: lastAttended[id]?.circle ?? null,
      lastAttendedMovement: lastAttended[id]?.movement ?? null,
      snoozed_until: snoozeById.get(id) ?? null,
      is_active: entry?.is_active ?? true,
    };
  });

  // Longest-absent first — the list is a work queue, not a directory. Students
  // with no attendance record yet sort last: unknown isn't the same as absent.
  rows.sort((a, b) => {
    const aDays = daysSince(a.lastAttendedCircle);
    const bDays = daysSince(b.lastAttendedCircle);
    if (aDays === null && bDays === null) {
      return (a.full_name || '').localeCompare(b.full_name || '');
    }
    if (aDays === null) return 1;
    if (bDays === null) return -1;
    return bDays - aDays;
  });

  return { rows, term, attendanceConnected };
}

/**
 * Candidates a leader can add, scoped to their own campus and term.
 *
 * Deliberately NOT CCB's global individual search — which is what the adult
 * roster uses. A volunteer student leader has no business searching the whole
 * church directory, and there's no need: their students are in the campus's
 * mapped groups.
 */
export async function searchStudentDirectory(
  campus: string | null,
  term: TermSlug,
  query: string,
  options?: { limit?: number; excludeIds?: string[] }
): Promise<Array<{ ccb_individual_id: string; full_name: string | null; birthday: string | null; grade: string | null }>> {
  if (!campus) return [];
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const supabase = createServiceSupabaseClient();
  let request = supabase
    .from('student_directory_cache')
    .select('ccb_individual_id, full_name, birthday, grade')
    .eq('campus', campus)
    .eq('term', term)
    .eq('is_active', true)
    .ilike('full_name', `%${trimmed}%`)
    .order('full_name')
    .limit(options?.limit ?? 25);

  if (options?.excludeIds?.length) {
    request = request.not('ccb_individual_id', 'in', `(${options.excludeIds.join(',')})`);
  }

  const { data, error } = await request;
  if (error) {
    console.error('[student-toolkit] Directory search failed:', error);
    return [];
  }
  return data ?? [];
}
