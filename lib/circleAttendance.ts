/**
 * How many people attended a circle in a given week.
 *
 * Attendance reaches RADIUS by two different routes and they store it in two
 * different shapes:
 *
 *   - A leader submitting through the Circle Leader Toolkit writes
 *     `circle_event_summaries`, where attendance is the list of people they
 *     checked off (`attendee_ccb_ids`) plus anyone they added by hand who has
 *     no CCB record yet (`manual_attendees`). There is no headcount column.
 *   - The CCB sync writes `circle_meeting_occurrences.headcount`, already
 *     totalled as named attendees + CCB's unnamed "head count" extras.
 *
 * Readers that look only at the occurrence row report zero for every circle
 * that came in through the toolkit, so keep the two shapes reconciled here.
 */

type SubmissionAttendance = {
  attendee_ccb_ids?: unknown;
  manual_attendees?: unknown;
} | null | undefined;

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/** People recorded on a toolkit submission: named CCB people + manual adds. */
export function submittedAttendanceCount(submission: SubmissionAttendance): number {
  if (!submission) return 0;
  return countArray(submission.attendee_ccb_ids) + countArray(submission.manual_attendees);
}

/**
 * The week's attendance for one circle. The leader's own submission is
 * first-hand and wins; the CCB occurrence headcount is the fallback for
 * circles that only ever reported in CCB. Null means nobody has reported
 * a number yet — distinct from a reported zero.
 */
export function weekAttendanceCount(
  submission: SubmissionAttendance,
  occurrenceHeadcount: number | null | undefined
): number | null {
  const submitted = submittedAttendanceCount(submission);
  if (submitted > 0) return submitted;
  return occurrenceHeadcount ?? null;
}
