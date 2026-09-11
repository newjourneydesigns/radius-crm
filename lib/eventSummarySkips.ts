/**
 * Weeks a circle wasn't expected to report.
 *
 * A skip is an ACPD's call, recorded in event_summary_week_skips. It is not a
 * did-not-meet and not a missing summary: it removes the week from what the
 * circle owed. The tracker and reporting both read this one rule so a week can
 * never look clear on one page and delinquent on the other.
 *
 * Manual only, deliberately. An automatic version — "no CCB calendar event
 * this week, so nothing to report" — shipped on 2026-09-10 and was pulled the
 * same day. It read event_summary_snapshots.ccb_event_scheduled, which is
 * derived from CCB's attendance_profiles feed. That feed lists occurrences
 * with an attendance record, not the calendar, so a circle that simply hadn't
 * reported yet read as "no event" and was skipped: every unreported circle
 * left Awaiting Submission at once. The flag is also only written by the
 * manual Sync Now, so it was frozen at the last click. If auto-skipping comes
 * back it needs a source that actually reflects the group's calendar (the
 * nightly calendar job's event occurrences), verified against real weeks
 * before any circle is hidden on its say-so.
 */

export function weekSkipKey(leaderId: number | string, weekStart: string): string {
  return `${leaderId}|${weekStart}`;
}

export type SkipReason = 'manual';

/** Why this week is skipped, or null if it isn't. */
export function skipReason(args: { manuallySkipped: boolean }): SkipReason | null {
  return args.manuallySkipped ? 'manual' : null;
}
