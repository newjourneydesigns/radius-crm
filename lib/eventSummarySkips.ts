/**
 * Weeks a circle wasn't expected to report.
 *
 * Two ways a week gets skipped, and both must read the same on the tracker and
 * in reporting — otherwise a week looks clear on one page and delinquent on
 * the other:
 *
 *   - Manual — an ACPD cleared the week (event_summary_week_skips).
 *   - No calendar event — CCB has no event occurrence for the circle that
 *     week, so there was never a meeting to report on. This is the Labor Day
 *     case: the ACPD had already taken the events off the calendar.
 *
 * A skip is not a did-not-meet and not a missing summary. It removes the week
 * from what the circle owed.
 */

export function weekSkipKey(leaderId: number | string, weekStart: string): string {
  return `${leaderId}|${weekStart}`;
}

export type SkipReason = 'manual' | 'no_calendar_event';

export type SnapshotForSkip = {
  ccb_event_scheduled?: boolean | null;
  ccb_report_available?: boolean | null;
} | null | undefined;

/**
 * Whether CCB's calendar says this circle had no meeting scheduled.
 *
 * Guarded three ways, because a false negative here hides a circle that really
 * does owe a summary:
 *
 *   - A snapshot row must exist. `ccb_event_scheduled` defaults to FALSE, so
 *     "no row" and "no event" are indistinguishable in the column alone —
 *     absence of a sync is not evidence of an empty calendar.
 *   - The leader must have a ccb_group_id. Without one the week matcher falls
 *     back to fuzzy name matching, where a miss looks exactly like an empty
 *     calendar. Those circles stay on the list and an ACPD can skip them by
 *     hand.
 *   - Nothing may have been reported. If a summary or attendance arrived
 *     anyway, the meeting happened and the calendar was simply wrong.
 */
export function hasNoCalendarEvent(args: {
  snapshot: SnapshotForSkip;
  hasCcbGroupId: boolean;
  hasReport: boolean;
}): boolean {
  const { snapshot, hasCcbGroupId, hasReport } = args;
  if (!snapshot) return false;
  if (!hasCcbGroupId) return false;
  if (hasReport) return false;
  if (snapshot.ccb_report_available === true) return false;
  return snapshot.ccb_event_scheduled === false;
}

/**
 * Why this week is skipped, or null if it isn't. A manual skip wins — an ACPD
 * clearing a week by hand should still read as their call if the calendar
 * later fills in.
 */
export function skipReason(args: {
  manuallySkipped: boolean;
  snapshot: SnapshotForSkip;
  hasCcbGroupId: boolean;
  hasReport: boolean;
}): SkipReason | null {
  if (args.manuallySkipped) return 'manual';
  return hasNoCalendarEvent(args) ? 'no_calendar_event' : null;
}
