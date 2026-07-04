/**
 * Circle Reporting engine — shared by the /circle-reporting dashboard API and
 * the weekly executive email. Reconstructs, for every completed Sunday–Saturday
 * week in a range, which circles were expected to meet and what actually
 * happened (met / did not meet / no summary), merging three sources in
 * priority order: Radius toolkit submissions, CCB meeting occurrences, and
 * weekly event-summary snapshots.
 *
 * Server-side only: callers pass a service-role Supabase client.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { categorizeDidNotMeetReason } from './circle-leader-toolkit/did-not-meet-reasons';

export type EventStatus = 'met' | 'did_not_meet' | 'no_summary';

export type LeaderRow = {
  id: number;
  name: string;
  circle_name: string | null;
  ccb_group_name: string | null;
  campus: string | null;
  circle_type: string | null;
  acpd: string | null;
  day: string | null;
  time: string | null;
  frequency: string | null;
  meeting_start_date: string | null;
  status: string | null;
  leader_type: string | null;
};

export type OccurrenceRow = {
  id: number;
  leader_id: number;
  meeting_date: string;
  status: string | null;
  headcount: number | null;
  has_notes: boolean | null;
  topic: string | null;
  notes: string | null;
  prayer_requests: string | null;
  source: string | null;
};

export type SubmissionRow = {
  id: string;
  leader_id: number;
  occurrence: string;
  did_not_meet: boolean | null;
  did_not_meet_reason: string | null;
  topic: string | null;
  notes: string | null;
  prayer_requests: string | null;
  info: string | null;
  attendee_ccb_ids: string[] | null;
  manual_attendees: unknown;
  status: string | null;
  reviewed_at: string | null;
};

export type SnapshotRow = {
  circle_leader_id: number;
  week_start_date: string;
  event_summary_state: string | null;
  ccb_event_scheduled: boolean | null;
  ccb_report_available: boolean | null;
  leader_status: string | null;
  campus: string | null;
  circle_type: string | null;
  acpd: string | null;
  meeting_day: string | null;
  meeting_frequency: string | null;
  meeting_time: string | null;
  meeting_start_date: string | null;
};

export type ExpectedEvent = {
  leader: LeaderRow;
  week_start_date: string;
  expected_date: string;
};

export type WeeklyEvent = {
  week_start_date: string;
  leader_id: number;
  leader_name: string;
  circle_name: string;
  leader_status: string;
  campus: string;
  circle_type: string;
  acpd: string;
  scheduled_date: string;
  scheduled_time: string;
  frequency: string;
  status: EventStatus;
  status_label: string;
  attendance_count: number | null;
  notes_submitted: boolean;
  did_not_meet_reason: string | null;
  source: 'radius' | 'ccb' | 'snapshot' | 'none';
};

export type Summary = {
  expected: number;
  met: number;
  didNotMeet: number;
  noSummary: number;
  compliancePct: number;
  totalAttendance: number;
  averageCircleSize: number;
  /** Unique circles (leaders) contributing expected events. */
  distinctCircles: number;
  /** Met events that carry a recorded headcount. */
  metWithAttendance: number;
  /**
   * % of met events with a recorded headcount. Below 100 means attendance
   * totals undercount reality (CCB/snapshot syncs don't always carry counts).
   */
  attendanceCoveragePct: number;
};

export type Breakdown = Summary & { name: string };

export type ReasonInsight = {
  reason: string;
  count: number;
  category: 'valid' | 'coaching' | 'other';
};

export type AttentionEntry = {
  leader_id: number;
  leader_name: string;
  circle_name: string;
  campus: string;
  acpd: string;
  frequency: string;
  /** Consecutive most-recent expected meetings with no summary. */
  missedCount: number;
  lastMissedDate: string;
  lastReportedDate: string | null;
  lastReportedLabel: string | null;
};

export type TrendPoint = Summary & { week_start_date: string; label: string };

const ACTIVE_STATUSES = new Set(['active']);
const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// ── Date helpers (UTC-based; range dates are plain YYYY-MM-DD) ─────────────

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toISODate(date);
}

export function startOfWeekSunday(value: string): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return toISODate(date);
}

export function todayCentralISO(): string {
  const centralNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  return centralNow.toISOString().slice(0, 10);
}

export function weekStartsBetween(startDate: string, endDate: string): string[] {
  const weeks: string[] = [];
  let cursor = startOfWeekSunday(startDate);
  const endWeek = startOfWeekSunday(endDate);
  while (cursor <= endWeek) {
    weeks.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

function dayIndex(day: string | null): number | null {
  const key = (day ?? '').trim().toLowerCase();
  return DAY_INDEX[key] ?? null;
}

// ── Schedule / frequency logic ──────────────────────────────────────────────

// Merge a week's captured cadence over the leader's current values so the
// schedule projection reconstructs that week from the cadence as it was then,
// not as it is today. Falls back to current values when no snapshot recorded
// them (weeks before point-in-time capture began).
function applySnapshotCadence(leader: LeaderRow, snapshot?: SnapshotRow): LeaderRow {
  if (!snapshot) return leader;
  return {
    ...leader,
    day: snapshot.meeting_day || leader.day,
    frequency: snapshot.meeting_frequency || leader.frequency,
    time: snapshot.meeting_time || leader.time,
    meeting_start_date: snapshot.meeting_start_date || leader.meeting_start_date,
  };
}

function expectedDateForWeek(weekStart: string, leader: LeaderRow): string {
  const idx = dayIndex(leader.day);
  return addDays(weekStart, idx ?? 0);
}

function normalizeFrequency(value: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\band\b/g, ',')
    .replace(/&/g, ',')
    .replace(/\s+/g, '')
    .replace(/,+/g, ',')
    .replace(/^,|,$/g, '');
}

// Ordinal week-of-month markers ("1st", "3rd"). Requires the ordinal suffix so
// interval frequencies like "every 2 weeks" are never misread as "2nd week of
// the month".
function ordinalNumbers(normFrequency: string): number[] {
  const matches = normFrequency.match(/\d+(?=st|nd|rd|th)/g) ?? [];
  return matches
    .map((part) => parseInt(part, 10))
    .filter((num) => num >= 1 && num <= 5);
}

function weekdayOccurrenceInMonth(dateISO: string): number {
  return Math.floor((parseDate(dateISO).getUTCDate() - 1) / 7) + 1;
}

function monthIndex(dateISO: string): number {
  return parseDate(dateISO).getUTCMonth();
}

function weeksBetween(a: string, b: string): number {
  return Math.floor((parseDate(b).getTime() - parseDate(a).getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function isExpectedThisWeek(leader: LeaderRow, weekStart: string, statusOverride?: string | null): boolean {
  // Use the leader's point-in-time status for the week when we captured it, so a
  // leader who is paused today but was active that week is still expected (and
  // vice versa). Fall back to current status when no snapshot recorded it.
  const effectiveStatus = statusOverride && statusOverride.trim() ? statusOverride : leader.status;
  if (!ACTIVE_STATUSES.has((effectiveStatus ?? '').toLowerCase())) return false;
  if ((leader.leader_type ?? 'circle') !== 'circle') return false;

  const expectedDate = expectedDateForWeek(weekStart, leader);
  if (leader.meeting_start_date && expectedDate < leader.meeting_start_date) return false;

  const norm = normalizeFrequency(leader.frequency);
  if (!norm || norm === 'weekly') return true;

  if (norm.includes('bi-weekly') || norm.includes('biweekly') || norm.includes('everyother')) {
    if (!leader.meeting_start_date) return true;
    return Math.abs(weeksBetween(startOfWeekSunday(leader.meeting_start_date), weekStart)) % 2 === 0;
  }

  // Interval cadence: "every 2 weeks", "every 3 weeks", … anchored to the
  // meeting start date (without an anchor we can't compute parity, so expect
  // weekly rather than silently dropping the circle from reporting).
  const interval = norm.match(/^every(\d+)weeks?$/);
  if (interval) {
    const n = parseInt(interval[1], 10);
    if (n <= 1 || !leader.meeting_start_date) return true;
    const diff = weeksBetween(startOfWeekSunday(leader.meeting_start_date), weekStart);
    return ((diff % n) + n) % n === 0;
  }

  const ordinals = ordinalNumbers(norm);
  if (ordinals.length > 0) {
    return ordinals.includes(weekdayOccurrenceInMonth(expectedDate));
  }

  if (norm === 'monthly') {
    return weekdayOccurrenceInMonth(expectedDate) === 1;
  }

  if (norm === 'quarterly') {
    return [0, 3, 6, 9].includes(monthIndex(expectedDate)) && weekdayOccurrenceInMonth(expectedDate) === 1;
  }

  return true;
}

// ── Row helpers ─────────────────────────────────────────────────────────────

function manualAttendeeCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function dateFromTimestamp(value: string): string {
  return value.slice(0, 10);
}

function hasText(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0;
}

function notesSubmitted(submission?: SubmissionRow, occurrence?: OccurrenceRow): boolean {
  return Boolean(
    hasText(submission?.topic) ||
    hasText(submission?.notes) ||
    hasText(submission?.prayer_requests) ||
    hasText(submission?.info) ||
    hasText(occurrence?.topic) ||
    hasText(occurrence?.notes) ||
    hasText(occurrence?.prayer_requests) ||
    occurrence?.has_notes
  );
}

const reasonCategory = categorizeDidNotMeetReason;

function percent(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function labelForStatus(status: EventStatus): string {
  if (status === 'met') return 'Met';
  if (status === 'did_not_meet') return 'Did Not Meet';
  return 'No Summary';
}

export type ReportIndexes = {
  submissionsByLeaderWeek: Map<string, SubmissionRow>;
  occurrencesByLeaderWeek: Map<string, OccurrenceRow>;
  snapshotsByLeaderWeek: Map<string, SnapshotRow>;
};

function buildIndexes(
  submissions: SubmissionRow[],
  occurrences: OccurrenceRow[],
  snapshots: SnapshotRow[]
): ReportIndexes {
  const submissionsByLeaderWeek = new Map<string, SubmissionRow>();
  for (const row of submissions) {
    if (row.status && row.status !== 'submitted') continue;
    const key = `${row.leader_id}|${startOfWeekSunday(dateFromTimestamp(row.occurrence))}`;
    const existing = submissionsByLeaderWeek.get(key);
    if (!existing || row.occurrence > existing.occurrence) submissionsByLeaderWeek.set(key, row);
  }

  const occurrencesByLeaderWeek = new Map<string, OccurrenceRow>();
  for (const row of occurrences) {
    const key = `${row.leader_id}|${startOfWeekSunday(row.meeting_date)}`;
    const existing = occurrencesByLeaderWeek.get(key);
    if (!existing || row.meeting_date > existing.meeting_date) occurrencesByLeaderWeek.set(key, row);
  }

  const snapshotsByLeaderWeek = new Map<string, SnapshotRow>();
  for (const row of snapshots) {
    snapshotsByLeaderWeek.set(`${row.circle_leader_id}|${row.week_start_date}`, row);
  }

  return { submissionsByLeaderWeek, occurrencesByLeaderWeek, snapshotsByLeaderWeek };
}

function buildWeeklyEvent(expected: ExpectedEvent, indexes: ReportIndexes): WeeklyEvent {
  const key = `${expected.leader.id}|${expected.week_start_date}`;
  const submission = indexes.submissionsByLeaderWeek.get(key);
  const occurrence = indexes.occurrencesByLeaderWeek.get(key);
  const snapshot = indexes.snapshotsByLeaderWeek.get(key);

  const submittedAttendance =
    (submission?.attendee_ccb_ids?.length ?? 0) + manualAttendeeCount(submission?.manual_attendees);
  const occurrenceAttendance = occurrence?.headcount ?? null;
  const attendance = submittedAttendance > 0 ? submittedAttendance : occurrenceAttendance;

  let status: EventStatus = 'no_summary';
  let source: WeeklyEvent['source'] = 'none';

  if (submission?.did_not_meet) {
    status = 'did_not_meet';
    source = 'radius';
  } else if (submission) {
    // Any accepted Radius submission that isn't "did not meet" counts as met —
    // even with zero attendees recorded, the leader reported. Attendance may
    // still come from the CCB occurrence when the submission carries none.
    status = 'met';
    source = 'radius';
  } else if (occurrence?.status === 'did_not_meet') {
    status = 'did_not_meet';
    source = 'ccb';
  } else if (occurrence?.status === 'met' && (occurrence.headcount ?? 0) > 0) {
    status = 'met';
    source = 'ccb';
  } else if (snapshot?.event_summary_state === 'did_not_meet' || snapshot?.event_summary_state === 'skipped') {
    // 'skipped' is the snapshot equivalent of "did not meet" (see the
    // event_summary_status enum history), so it counts as a reported miss
    // rather than a missing summary.
    status = 'did_not_meet';
    source = 'snapshot';
  } else if (snapshot?.event_summary_state === 'received') {
    status = 'met';
    source = 'snapshot';
  }

  return {
    week_start_date: expected.week_start_date,
    leader_id: expected.leader.id,
    leader_name: expected.leader.name,
    circle_name: expected.leader.circle_name || expected.leader.ccb_group_name || expected.leader.name,
    // Prefer the leader's point-in-time attributes captured on the snapshot for
    // that week; fall back to the leader's current values when no snapshot
    // recorded them (e.g. weeks before point-in-time capture began).
    leader_status: snapshot?.leader_status || expected.leader.status || 'Unknown',
    campus: snapshot?.campus || expected.leader.campus || 'Unknown',
    circle_type: snapshot?.circle_type || expected.leader.circle_type || 'Unknown',
    acpd: snapshot?.acpd || expected.leader.acpd || 'Unassigned',
    scheduled_date: expected.expected_date,
    scheduled_time: snapshot?.meeting_time || expected.leader.time || '',
    frequency: snapshot?.meeting_frequency || expected.leader.frequency || 'Weekly',
    status,
    status_label: labelForStatus(status),
    attendance_count: status === 'met' ? attendance ?? null : null,
    notes_submitted: notesSubmitted(submission, occurrence),
    // A structured reason only exists when the leader marked "did not meet" in
    // Radius. CCB- and snapshot-derived misses carry no reason field, so we
    // leave it null rather than guessing — reporting labels those "Not specified".
    did_not_meet_reason: submission?.did_not_meet ? submission.did_not_meet_reason || null : null,
    source,
  };
}

// ── Aggregation ─────────────────────────────────────────────────────────────

export function aggregateEvents(events: WeeklyEvent[]): Summary {
  const expected = events.length;
  const met = events.filter((event) => event.status === 'met').length;
  const didNotMeet = events.filter((event) => event.status === 'did_not_meet').length;
  const noSummary = events.filter((event) => event.status === 'no_summary').length;
  const totalAttendance = events.reduce((sum, event) => sum + (event.attendance_count ?? 0), 0);
  const metWithAttendance = events.filter((event) => event.status === 'met' && (event.attendance_count ?? 0) > 0).length;
  const distinctCircles = new Set(events.map((event) => event.leader_id)).size;

  return {
    expected,
    met,
    didNotMeet,
    noSummary,
    compliancePct: percent(met + didNotMeet, expected),
    totalAttendance,
    averageCircleSize: metWithAttendance > 0 ? Math.round((totalAttendance / metWithAttendance) * 10) / 10 : 0,
    distinctCircles,
    metWithAttendance,
    attendanceCoveragePct: percent(metWithAttendance, met),
  };
}

export function groupedBreakdown(events: WeeklyEvent[], key: 'campus' | 'circle_type' | 'acpd'): Breakdown[] {
  const groups = new Map<string, WeeklyEvent[]>();
  for (const event of events) {
    const value = event[key] || 'Unknown';
    groups.set(value, [...(groups.get(value) ?? []), event]);
  }
  return Array.from(groups.entries())
    .map(([name, rows]) => ({ name, ...aggregateEvents(rows) }))
    .sort((a, b) => b.expected - a.expected || a.name.localeCompare(b.name));
}

const NOT_SPECIFIED_LABEL = 'Not specified';

export function reasonInsights(events: WeeklyEvent[]) {
  const didNotMeetRows = events.filter((event) => event.status === 'did_not_meet');
  const counts = new Map<string, { reason: string; count: number; category: 'valid' | 'coaching' | 'other' }>();
  // Reason-less misses are tracked separately and broken down by where they came
  // from, so "Not specified" reads as an attribution gap (mostly CCB/snapshot
  // syncs, which carry no reason field) rather than being merged into "Other".
  const notSpecifiedBySource = { radius: 0, ccb: 0, snapshot: 0 };
  for (const event of didNotMeetRows) {
    const rawReason = event.did_not_meet_reason?.trim();
    const reason = rawReason || NOT_SPECIFIED_LABEL;
    if (!rawReason && event.source !== 'none') {
      notSpecifiedBySource[event.source] += 1;
    }
    const key = reason.toLowerCase();
    const existing = counts.get(key) ?? { reason, count: 0, category: rawReason ? reasonCategory(reason) : 'other' };
    existing.count += 1;
    counts.set(key, existing);
  }

  const byReason = Array.from(counts.values()).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  const byCategory = byReason.reduce(
    (acc, row) => {
      acc[row.category] += row.count;
      return acc;
    },
    { valid: 0, coaching: 0, other: 0 }
  );
  const notSpecified = counts.get(NOT_SPECIFIED_LABEL.toLowerCase())?.count ?? 0;

  return {
    total: didNotMeetRows.length,
    // Top cards highlight actionable, leader-supplied reasons; the unattributed
    // "Not specified" bucket is surfaced separately in its own callout.
    topReasons: byReason.filter((row) => row.reason !== NOT_SPECIFIED_LABEL).slice(0, 3),
    byReason,
    byCategory,
    notSpecified,
    notSpecifiedBySource,
  };
}

/**
 * Circles currently missing summaries: for each leader, count consecutive
 * most-recent expected meetings (within the range) with no summary. A circle
 * that reported its latest expected meeting has a streak of 0 and is excluded.
 */
export function buildAttentionList(events: WeeklyEvent[], minMissed = 2): AttentionEntry[] {
  const byLeader = new Map<number, WeeklyEvent[]>();
  for (const event of events) {
    byLeader.set(event.leader_id, [...(byLeader.get(event.leader_id) ?? []), event]);
  }

  const entries: AttentionEntry[] = [];
  for (const rows of Array.from(byLeader.values())) {
    rows.sort((a, b) => a.week_start_date.localeCompare(b.week_start_date));
    let missed = 0;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].status !== 'no_summary') break;
      missed += 1;
    }
    if (missed < minMissed) continue;

    const latest = rows[rows.length - 1];
    const lastReported = [...rows].reverse().find((row) => row.status !== 'no_summary') ?? null;
    entries.push({
      leader_id: latest.leader_id,
      leader_name: latest.leader_name,
      circle_name: latest.circle_name,
      campus: latest.campus,
      acpd: latest.acpd,
      frequency: latest.frequency,
      missedCount: missed,
      lastMissedDate: latest.scheduled_date,
      lastReportedDate: lastReported?.scheduled_date ?? null,
      lastReportedLabel: lastReported?.status_label ?? null,
    });
  }

  return entries.sort((a, b) => b.missedCount - a.missedCount || a.leader_name.localeCompare(b.leader_name));
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

// Full-content record for the AI export. Unlike WeeklyEvent (which strips the
// summary text down to a boolean), this carries the actual topic / notes /
// prayer requests so the export is useful for downstream analysis.
export function buildExportRecord(expected: ExpectedEvent, indexes: ReportIndexes) {
  const key = `${expected.leader.id}|${expected.week_start_date}`;
  const submission = indexes.submissionsByLeaderWeek.get(key);
  const occurrence = indexes.occurrencesByLeaderWeek.get(key);
  const event = buildWeeklyEvent(expected, indexes);
  const reason = submission?.did_not_meet_reason || null;

  return {
    week_start_date: expected.week_start_date,
    scheduled_date: expected.expected_date,
    scheduled_time: event.scheduled_time,
    frequency: event.frequency,
    leader_id: expected.leader.id,
    leader_name: expected.leader.name,
    circle_name: event.circle_name,
    campus: event.campus,
    circle_type: event.circle_type,
    acpd: event.acpd || '',
    leader_status: event.leader_status,
    reporting_status: event.status_label,
    attendance: event.attendance_count,
    topic: cleanText(submission?.topic || occurrence?.topic),
    notes: cleanText(submission?.notes || occurrence?.notes),
    prayer_requests: cleanText(submission?.prayer_requests || occurrence?.prayer_requests),
    info: cleanText(submission?.info),
    did_not_meet_reason: reason || '',
    did_not_meet_category: event.status === 'did_not_meet' ? reasonCategory(reason) : '',
    source: event.source,
  };
}

// ── Data loading ────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000;

/**
 * Page through a PostgREST query until a short page. The old `.limit(20000)`
 * approach silently truncated year-to-date ranges (snapshots grow as
 * leaders × weeks); paging removes the cap. The builder must apply a stable
 * order so pages don't overlap.
 */
async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

const SNAPSHOT_FULL_SELECT =
  'circle_leader_id, week_start_date, event_summary_state, ccb_event_scheduled, ccb_report_available, leader_status, campus, circle_type, acpd, meeting_day, meeting_frequency, meeting_time, meeting_start_date';
const SNAPSHOT_OPTIONAL_COLUMNS_RE =
  /ccb_event_scheduled|ccb_report_available|leader_status|circle_type|acpd|campus|meeting_day|meeting_frequency|meeting_time|meeting_start_date/;

async function fetchSnapshots(
  db: SupabaseClient,
  leaderIds: number[],
  queryStart: string,
  lastWeekStart: string
): Promise<SnapshotRow[]> {
  try {
    return await fetchAllRows<SnapshotRow>((from, to) =>
      db
        .from('event_summary_snapshots')
        .select(SNAPSHOT_FULL_SELECT)
        .in('circle_leader_id', leaderIds)
        .gte('week_start_date', queryStart)
        .lte('week_start_date', lastWeekStart)
        .order('circle_leader_id')
        .order('week_start_date')
        .range(from, to) as any
    );
  } catch (error: any) {
    // Older databases may be missing the CCB columns and/or the point-in-time
    // leader-attribute columns. Fall back to the minimal set and default the
    // rest, so reporting still works before those migrations have run.
    if (!SNAPSHOT_OPTIONAL_COLUMNS_RE.test(error?.message ?? '')) throw error;
    const rows = await fetchAllRows<Pick<SnapshotRow, 'circle_leader_id' | 'week_start_date' | 'event_summary_state'>>(
      (from, to) =>
        db
          .from('event_summary_snapshots')
          .select('circle_leader_id, week_start_date, event_summary_state')
          .in('circle_leader_id', leaderIds)
          .gte('week_start_date', queryStart)
          .lte('week_start_date', lastWeekStart)
          .order('circle_leader_id')
          .order('week_start_date')
          .range(from, to) as any
    );
    return rows.map((row) => ({
      ...row,
      ccb_event_scheduled: false,
      ccb_report_available: false,
      leader_status: null,
      campus: null,
      circle_type: null,
      acpd: null,
      meeting_day: null,
      meeting_frequency: null,
      meeting_time: null,
      meeting_start_date: null,
    }));
  }
}

export type CircleReportInput = {
  startDate: string;
  endDate: string;
  campusFilter?: string[];
  acpdFilter?: string[];
  circleTypeFilter?: string[];
  statusFilter?: string[];
};

export type CircleReport = {
  /** Range after snapping to completed Sunday–Saturday weeks. */
  startDate: string;
  endDate: string;
  currentWeek: string;
  lastCompletedWeek: string;
  filterOptions: { campuses: string[]; acpds: string[]; circleTypes: string[]; statuses: string[] };
  /** All events across the fetched window (may extend past the display range edges). */
  allEvents: WeeklyEvent[];
  /** Expected events paired for export-record building. */
  expectedEvents: ExpectedEvent[];
  indexes: ReportIndexes;
  /** Events within [startDate, endDate]. */
  rangedEvents: WeeklyEvent[];
  summary: Summary;
  weeklyTrend: TrendPoint[];
  reasonTrend: Array<{ week_start_date: string; valid: number; coaching: number; other: number }>;
  campusBreakdown: Breakdown[];
  circleTypeBreakdown: Breakdown[];
  acpdBreakdown: Breakdown[];
  didNotMeetInsights: ReturnType<typeof reasonInsights>;
  attentionList: AttentionEntry[];
};

export async function loadCircleReport(db: SupabaseClient, input: CircleReportInput): Promise<CircleReport> {
  const today = todayCentralISO();
  const currentWeek = startOfWeekSunday(today);
  const lastCompletedSaturday = addDays(currentWeek, -1);
  const lastCompletedWeek = startOfWeekSunday(lastCompletedSaturday);

  const campusFilter = input.campusFilter ?? [];
  const acpdFilter = input.acpdFilter ?? [];
  const circleTypeFilter = input.circleTypeFilter ?? [];
  const statusFilter = input.statusFilter ?? [];

  // Reporting is limited to completed weeks (Sunday–Saturday). Snap the range
  // to whole weeks and never include the in-progress current week. This keeps
  // the KPI totals (filtered by exact date) reconciled with the weekly-trend
  // buckets (grouped by week), which only line up when the edges are aligned.
  let startDate = startOfWeekSunday(input.startDate);
  let endDate = addDays(startOfWeekSunday(input.endDate), 6);
  if (endDate > lastCompletedSaturday) endDate = lastCompletedSaturday;
  if (endDate < startDate) startDate = startOfWeekSunday(endDate);

  // The status filter is applied per-week against the point-in-time snapshot
  // status (below), NOT against the leader's current status — filtering the
  // leader query by current status would erase history for anyone who has
  // since changed status. Campus/type/ACPD are far less volatile, so they stay
  // on the query for efficiency.
  const leaderRows = await fetchAllRows<LeaderRow>((from, to) => {
    let query = db
      .from('circle_leaders')
      .select('id, name, circle_name, ccb_group_name, campus, circle_type, acpd, day, time, frequency, meeting_start_date, status, leader_type')
      .order('id');
    if (campusFilter.length > 0) query = query.in('campus', campusFilter);
    if (acpdFilter.length > 0) query = query.in('acpd', acpdFilter);
    if (circleTypeFilter.length > 0) query = query.in('circle_type', circleTypeFilter);
    return query.range(from, to) as any;
  });
  const leaderIds = leaderRows.map((leader) => leader.id);

  const filterOptions = {
    campuses: Array.from(new Set(leaderRows.map((leader) => leader.campus).filter(Boolean) as string[])).sort(),
    acpds: Array.from(new Set(leaderRows.map((leader) => leader.acpd).filter(Boolean) as string[])).sort(),
    circleTypes: Array.from(new Set(leaderRows.map((leader) => leader.circle_type).filter(Boolean) as string[])).sort(),
    statuses: Array.from(new Set(leaderRows.map((leader) => leader.status).filter(Boolean) as string[])).sort(),
  };

  const emptyReport = (): CircleReport => ({
    startDate,
    endDate,
    currentWeek,
    lastCompletedWeek,
    filterOptions,
    allEvents: [],
    expectedEvents: [],
    indexes: buildIndexes([], [], []),
    rangedEvents: [],
    summary: aggregateEvents([]),
    weeklyTrend: [],
    reasonTrend: [],
    campusBreakdown: [],
    circleTypeBreakdown: [],
    acpdBreakdown: [],
    didNotMeetInsights: reasonInsights([]),
    attentionList: [],
  });

  if (leaderIds.length === 0) return emptyReport();

  const queryStart = startOfWeekSunday(startDate);
  const queryEnd = addDays(startOfWeekSunday(endDate), 6);

  const [occurrences, submissions, snapshotRows] = await Promise.all([
    fetchAllRows<OccurrenceRow>((from, to) =>
      db
        .from('circle_meeting_occurrences')
        .select('id, leader_id, meeting_date, status, headcount, has_notes, topic, notes, prayer_requests, source')
        .in('leader_id', leaderIds)
        .gte('meeting_date', queryStart)
        .lte('meeting_date', queryEnd)
        .order('id')
        .range(from, to) as any
    ),
    fetchAllRows<SubmissionRow>((from, to) =>
      db
        .from('circle_event_summaries')
        .select('id, leader_id, occurrence, did_not_meet, did_not_meet_reason, topic, notes, prayer_requests, info, attendee_ccb_ids, manual_attendees, status, reviewed_at')
        .in('leader_id', leaderIds)
        .gte('occurrence', `${queryStart}T00:00:00.000Z`)
        .lt('occurrence', `${addDays(queryEnd, 1)}T00:00:00.000Z`)
        .order('id')
        .range(from, to) as any
    ),
    fetchSnapshots(db, leaderIds, queryStart, startOfWeekSunday(queryEnd)),
  ]);

  const indexes = buildIndexes(submissions, occurrences, snapshotRows);

  const allExpectedByKey = new Map<string, ExpectedEvent>();
  const leadersById = new Map(leaderRows.map((leader) => [leader.id, leader]));

  const addExpected = (leaderId: number, weekStart: string, expectedDate: string) => {
    const leader = leadersById.get(leaderId);
    if (!leader) return;
    if (expectedDate < queryStart || expectedDate > queryEnd) return;
    const key = `${leaderId}|${weekStart}`;
    if (!allExpectedByKey.has(key)) {
      allExpectedByKey.set(key, { leader, week_start_date: weekStart, expected_date: expectedDate });
      return;
    }

    const existing = allExpectedByKey.get(key)!;
    if (expectedDate < existing.expected_date) {
      allExpectedByKey.set(key, { leader, week_start_date: weekStart, expected_date: expectedDate });
    }
  };

  for (const week of weekStartsBetween(queryStart, queryEnd)) {
    for (const leader of leaderRows) {
      const snap = indexes.snapshotsByLeaderWeek.get(`${leader.id}|${week}`);
      const effLeader = applySnapshotCadence(leader, snap);
      if (!isExpectedThisWeek(effLeader, week, snap?.leader_status)) continue;
      const expectedDate = expectedDateForWeek(week, effLeader);
      addExpected(leader.id, week, expectedDate);
    }
  }

  // Historical correction: current status is not a reliable proxy for a
  // past week. If a circle reported in Supabase for a week, include it in
  // that week's reporting set even if it is now paused/off-boarding/etc.
  for (const row of submissions) {
    if (row.status && row.status !== 'submitted') continue;
    const reportDate = dateFromTimestamp(row.occurrence);
    addExpected(row.leader_id, startOfWeekSunday(reportDate), reportDate);
  }

  for (const row of occurrences) {
    if (!row.status || (row.status !== 'met' && row.status !== 'did_not_meet')) continue;
    addExpected(row.leader_id, startOfWeekSunday(row.meeting_date), row.meeting_date);
  }

  for (const row of snapshotRows) {
    const hasReport =
      row.ccb_report_available ||
      row.event_summary_state === 'received' ||
      row.event_summary_state === 'did_not_meet' ||
      row.event_summary_state === 'skipped';
    if (!hasReport) continue;
    const leader = leadersById.get(row.circle_leader_id);
    if (!leader) continue;
    const effLeader = applySnapshotCadence(leader, row);
    addExpected(row.circle_leader_id, row.week_start_date, expectedDateForWeek(row.week_start_date, effLeader));
  }

  let pairs = Array.from(allExpectedByKey.values()).map((expected) => ({
    expected,
    event: buildWeeklyEvent(expected, indexes),
  }));

  // Point-in-time status filter: an event's leader_status is the snapshot
  // status for that week (falling back to current), so filtering here keeps a
  // leader's history visible under the status they actually had at the time.
  if (statusFilter.length > 0) {
    const wanted = new Set(statusFilter.map((value) => value.toLowerCase()));
    pairs = pairs.filter(({ event }) => wanted.has(event.leader_status.toLowerCase()));
  }

  const expectedEvents = pairs.map(({ expected }) => expected);
  const allEvents = pairs.map(({ event }) => event);
  const rangedEvents = allEvents.filter((event) => event.scheduled_date >= startDate && event.scheduled_date <= endDate);

  const eventsByWeek = new Map<string, WeeklyEvent[]>();
  for (const event of allEvents) {
    eventsByWeek.set(event.week_start_date, [...(eventsByWeek.get(event.week_start_date) ?? []), event]);
  }

  const weeklyTrend = weekStartsBetween(startOfWeekSunday(startDate), startOfWeekSunday(endDate)).map((week) => {
    const rows = eventsByWeek.get(week) ?? [];
    return {
      week_start_date: week,
      label: new Date(`${week}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      ...aggregateEvents(rows),
    };
  });

  const reasonTrend = weeklyTrend.map((week) => {
    const rows = eventsByWeek.get(week.week_start_date) ?? [];
    const categories = reasonInsights(rows).byCategory;
    return { week_start_date: week.week_start_date, ...categories };
  });

  return {
    startDate,
    endDate,
    currentWeek,
    lastCompletedWeek,
    filterOptions,
    allEvents,
    expectedEvents,
    indexes,
    rangedEvents,
    summary: aggregateEvents(rangedEvents),
    weeklyTrend,
    reasonTrend,
    campusBreakdown: groupedBreakdown(rangedEvents, 'campus'),
    circleTypeBreakdown: groupedBreakdown(rangedEvents, 'circle_type'),
    acpdBreakdown: groupedBreakdown(rangedEvents, 'acpd'),
    didNotMeetInsights: reasonInsights(rangedEvents),
    attentionList: buildAttentionList(rangedEvents),
  };
}
