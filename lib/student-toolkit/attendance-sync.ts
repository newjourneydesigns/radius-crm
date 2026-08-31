/**
 * Nightly CCB pull behind the Student Leader Toolkit roster.
 *
 * Staff map CCB groups to a campus and term in `student_ministry_groups`; this
 * walks those rows and fills two caches:
 *
 *   student_directory_cache — the students a leader can add to their roster
 *   student_attendance      — one row per student per occurrence attended
 *
 * Reads are then pure Supabase, so opening the roster never touches CCB. That
 * matters twice over: CCB enforces a shared daily request budget, and a leader
 * on a phone in a church lobby should not wait on an upstream API.
 *
 * Uses the v2 client on purpose. `getGroupParticipants` returns birthdays
 * inline (v1 needs a profile call per person — the N+1 that makes
 * /api/ccb/group-roster time out past ~18 people), and
 * `getGroupAttendanceInRange` replaces v1's global attendance_profiles blob
 * with one call per group.
 */

import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../server-supabase';
import { createCCBv2Client, type AttendanceSummaryV2 } from '../ccb/ccb-v2-client';
import { CCBDailyBudgetError, type CCBApiRequestContext } from '../ccb/ccb-api-gateway';
import { isDidNotMeetEvent } from '../circle-leader-toolkit/did-not-meet-reasons';
import { APP_TIME_ZONE } from '../dateUtils';
import { resolveActiveTerm, termStartDate, type TermSlug } from './terms';
import type { StudentAttendanceKind } from '../supabase';

/** Supabase rejects very large payloads; upsert in slices. */
const UPSERT_CHUNK = 500;

export type StudentGroupSyncOutcome = {
  ccb_group_id: string;
  campus: string;
  kind: StudentAttendanceKind;
  students: number;
  occurrences: number;
  attendanceRows: number;
  error?: string;
};

export type StudentSyncResult = {
  term: TermSlug;
  groupsConfigured: number;
  groupsSynced: number;
  studentsUpserted: number;
  attendanceRowsUpserted: number;
  groups: StudentGroupSyncOutcome[];
  /**
   * True when no group is mapped yet. Not an error — it's the expected state
   * until student ministry hands over the CCB group IDs, and the roster page
   * reports "attendance isn't connected" rather than an empty list.
   */
  notConfigured: boolean;
};

type MinistryGroupRow = {
  id: number;
  campus: string;
  term: string;
  kind: StudentAttendanceKind;
  ccb_group_id: string;
};

async function chunkedUpsert<T>(
  table: string,
  rows: T[],
  onConflict: string
): Promise<number> {
  if (!rows.length) return 0;
  const supabase = createServiceSupabaseClient();
  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const slice = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from(table).upsert(slice as any, { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    written += slice.length;
  }
  return written;
}

/**
 * Attendance rows for one group's occurrences.
 *
 * Two exclusions, matching how the Circle Leader Toolkit reads attendance so a
 * week can't count here and not there: a did-not-meet occurrence never counts
 * for anyone, and an attendee explicitly marked absent didn't attend.
 */
export function attendanceRowsFromSummaries(
  summaries: AttendanceSummaryV2[],
  group: MinistryGroupRow
): Array<{
  ccb_individual_id: string;
  kind: StudentAttendanceKind;
  occurrence: string;
  ccb_group_id: string;
  ccb_event_id: string | null;
  term: string;
}> {
  const rows: Array<{
    ccb_individual_id: string;
    kind: StudentAttendanceKind;
    occurrence: string;
    ccb_group_id: string;
    ccb_event_id: string | null;
    term: string;
  }> = [];
  // Same person, same day, two events — keep one row so the unique index on
  // (individual, kind, occurrence) doesn't reject the whole chunk.
  const seen = new Set<string>();

  for (const summary of summaries) {
    if (!summary?.occurrence) continue;
    if (isDidNotMeetEvent({ didNotMeet: summary.didNotMeet, notes: summary.notes })) continue;

    for (const attendee of summary.attendees ?? []) {
      const id = String(attendee?.id ?? '').trim();
      if (!id) continue;
      const status = String(attendee?.status ?? '').trim().toLowerCase();
      if (status === 'absent' || status === 'no') continue;

      const key = `${id}:${summary.occurrence}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rows.push({
        ccb_individual_id: id,
        kind: group.kind,
        occurrence: summary.occurrence,
        ccb_group_id: group.ccb_group_id,
        ccb_event_id: summary.eventId ?? null,
        term: group.term,
      });
    }
  }

  return rows;
}

/**
 * Pull every active mapped group for a term.
 *
 * One group's failure is recorded and the rest continue — a single bad group ID
 * shouldn't cost every campus its attendance. A daily-budget refusal is the one
 * exception: it aborts, because every remaining call would fail the same way.
 */
export async function syncStudentMinistryGroups(options?: {
  term?: TermSlug;
  ccbContext?: CCBApiRequestContext;
}): Promise<StudentSyncResult> {
  const term = options?.term ?? (await resolveActiveTerm());
  const supabase = createServiceSupabaseClient();
  const runStartedAt = new Date().toISOString();

  const { data: groups, error: groupsError } = await supabase
    .from('student_ministry_groups')
    .select('id, campus, term, kind, ccb_group_id')
    .eq('term', term)
    .eq('active', true);

  if (groupsError) {
    throw new Error(`Could not read student_ministry_groups: ${groupsError.message}`);
  }

  const configured = (groups ?? []) as MinistryGroupRow[];
  const result: StudentSyncResult = {
    term,
    groupsConfigured: configured.length,
    groupsSynced: 0,
    studentsUpserted: 0,
    attendanceRowsUpserted: 0,
    groups: [],
    notConfigured: configured.length === 0,
  };

  if (!configured.length) return result;

  const ccb = createCCBv2Client(options?.ccbContext);
  const startDate = termStartDate(term);
  const endDate = DateTime.now().setZone(APP_TIME_ZONE).toISODate()!;

  for (const group of configured) {
    const outcome: StudentGroupSyncOutcome = {
      ccb_group_id: group.ccb_group_id,
      campus: group.campus,
      kind: group.kind,
      students: 0,
      occurrences: 0,
      attendanceRows: 0,
    };

    try {
      // 1. Directory — names and birthdays, no contact fields. These are minors;
      //    the toolkit never stores or shows a phone, email, or address for them.
      const participants = await ccb.getGroupParticipants(group.ccb_group_id);
      const active = participants.filter((p) => p.isActive !== false && p.id);
      const freshIds = active.map((p) => String(p.id));

      // Note what we deliberately do NOT carry over: email, phone, mobilePhone.
      // These are minors, and the toolkit has no surface that shows contact
      // information — the directory table has no column to put it in.
      const directoryRows = active.map((p) => ({
        term: group.term,
        ccb_individual_id: String(p.id),
        ccb_group_id: group.ccb_group_id,
        campus: group.campus,
        first_name: p.firstName || null,
        last_name: p.lastName || null,
        full_name: p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || null,
        birthday: p.birthday || null,
        is_active: true,
        last_seen_in_group_at: runStartedAt,
        synced_at: runStartedAt,
      }));

      outcome.students = await chunkedUpsert(
        'student_directory_cache',
        directoryRows,
        'term,ccb_individual_id'
      );

      // Membership flag for this group's kind. Cleared across the campus first,
      // then set for the people CCB just listed — a student can be in both the
      // circle and the movement group, so the flags are tracked independently
      // rather than inferred from the row's last-writer-wins ccb_group_id.
      const membershipColumn = group.kind === 'circle' ? 'in_circle_group' : 'in_movement_group';
      await supabase
        .from('student_directory_cache')
        .update({ [membershipColumn]: false })
        .eq('term', group.term)
        .eq('campus', group.campus);
      if (freshIds.length) {
        await supabase
          .from('student_directory_cache')
          .update({ [membershipColumn]: true })
          .eq('term', group.term)
          .eq('campus', group.campus)
          .in('ccb_individual_id', freshIds);
      }

      // Anyone CCB no longer lists in any mapped group is deactivated rather
      // than deleted, so a leader's roster row survives a mid-semester group
      // edit and they can still see that a student dropped off.
      await supabase
        .from('student_directory_cache')
        .update({ is_active: false })
        .eq('term', group.term)
        .eq('campus', group.campus)
        .lt('synced_at', runStartedAt);

      // 2. Attendance
      const summaries = await ccb.getGroupAttendanceInRange(group.ccb_group_id, startDate, endDate);
      outcome.occurrences = summaries.length;

      const attendanceRows = attendanceRowsFromSummaries(summaries, group);

      // `getGroupAttendanceInRange` had no caller before this sync, and its
      // attendee mapper reads a `people_information` key that has never been
      // checked against a live v2 response. If that key is wrong, every
      // occurrence parses fine and every attendee list comes back empty — so
      // the roster would quietly report that no student has ever attended.
      // Occurrences with nobody in them is not a state real attendance
      // produces, so treat it as a mapping failure and say so, rather than
      // writing a confidently wrong answer into the cache.
      if (summaries.length > 0 && attendanceRows.length === 0) {
        throw new Error(
          `CCB returned ${summaries.length} occurrence(s) for group ${group.ccb_group_id} but no attendees. ` +
          'The v2 attendance response shape likely differs from what mapAttendees expects — ' +
          'verify it before trusting the roster dates.'
        );
      }

      outcome.attendanceRows = await chunkedUpsert(
        'student_attendance',
        attendanceRows,
        'ccb_individual_id,kind,occurrence'
      );

      result.groupsSynced += 1;
      result.studentsUpserted += outcome.students;
      result.attendanceRowsUpserted += outcome.attendanceRows;

      await supabase
        .from('student_ministry_groups')
        .update({ last_synced_at: runStartedAt, last_sync_error: null })
        .eq('id', group.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcome.error = message;
      console.error(`[student-toolkit] Sync failed for CCB group ${group.ccb_group_id}:`, message);

      await supabase
        .from('student_ministry_groups')
        .update({ last_sync_error: message })
        .eq('id', group.id);

      result.groups.push(outcome);

      // Every remaining group would hit the same wall — stop and report.
      if (err instanceof CCBDailyBudgetError) return result;
      continue;
    }

    result.groups.push(outcome);
  }

  return result;
}
