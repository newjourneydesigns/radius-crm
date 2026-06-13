import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type EventStatus = 'met' | 'did_not_meet' | 'no_summary';

type LeaderRow = {
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

type OccurrenceRow = {
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

type SubmissionRow = {
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

type SnapshotRow = {
  circle_leader_id: number;
  week_start_date: string;
  event_summary_state: string | null;
  ccb_event_scheduled: boolean | null;
  ccb_report_available: boolean | null;
};

type ExpectedEvent = {
  leader: LeaderRow;
  week_start_date: string;
  expected_date: string;
};

type WeeklyEvent = {
  week_start_date: string;
  leader_id: number;
  leader_name: string;
  circle_name: string;
  leader_status: string;
  campus: string;
  circle_type: string;
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

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toISODate(date);
}

function startOfWeekSunday(value: string): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return toISODate(date);
}

function todayCentralISO(): string {
  const centralNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  return centralNow.toISOString().slice(0, 10);
}

function weekStartsBetween(startDate: string, endDate: string): string[] {
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

function ordinalNumbers(normFrequency: string): number[] {
  const matches = normFrequency.match(/\d+(?:st|nd|rd|th)?/g) ?? [];
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

function isExpectedThisWeek(leader: LeaderRow, weekStart: string): boolean {
  if (!ACTIVE_STATUSES.has((leader.status ?? '').toLowerCase())) return false;
  if ((leader.leader_type ?? 'circle') !== 'circle') return false;

  const expectedDate = expectedDateForWeek(weekStart, leader);
  if (leader.meeting_start_date && expectedDate < leader.meeting_start_date) return false;

  const norm = normalizeFrequency(leader.frequency);
  if (!norm || norm === 'weekly') return true;

  if (norm.includes('bi-weekly') || norm.includes('biweekly') || norm.includes('everyother')) {
    if (!leader.meeting_start_date) return true;
    return Math.abs(weeksBetween(startOfWeekSunday(leader.meeting_start_date), weekStart)) % 2 === 0;
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

function reasonCategory(reason: string | null): 'valid' | 'coaching' | 'other' {
  const text = (reason ?? '').toLowerCase();
  if (!text.trim()) return 'other';
  if (/(weather|storm|ice|snow|holiday|thanksgiving|christmas|easter|ill|sick|health|emergency|funeral|travel|vacation|spring break|summer break|church|event|schedule conflict)/i.test(text)) {
    return 'valid';
  }
  if (/(forgot|no one|nobody|low attendance|communication|communicat|cancel|leader unavailable|did not plan|not prepared|last minute)/i.test(text)) {
    return 'coaching';
  }
  return 'other';
}

function percent(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function labelForStatus(status: EventStatus): string {
  if (status === 'met') return 'Met';
  if (status === 'did_not_meet') return 'Did Not Meet';
  return 'No Summary';
}

function buildIndexes(
  submissions: SubmissionRow[],
  occurrences: OccurrenceRow[],
  snapshots: SnapshotRow[]
) {
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

function buildWeeklyEvent(
  expected: ExpectedEvent,
  indexes: ReturnType<typeof buildIndexes>
): WeeklyEvent {
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
  } else if (submission && submittedAttendance > 0) {
    status = 'met';
    source = 'radius';
  } else if (occurrence?.status === 'did_not_meet') {
    status = 'did_not_meet';
    source = 'ccb';
  } else if (occurrence?.status === 'met' && (occurrence.headcount ?? 0) > 0) {
    status = 'met';
    source = 'ccb';
  } else if (snapshot?.event_summary_state === 'did_not_meet') {
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
    leader_status: expected.leader.status || 'Unknown',
    campus: expected.leader.campus || 'Unknown',
    circle_type: expected.leader.circle_type || 'Unknown',
    scheduled_date: expected.expected_date,
    scheduled_time: expected.leader.time || '',
    frequency: expected.leader.frequency || 'Weekly',
    status,
    status_label: labelForStatus(status),
    attendance_count: status === 'met' ? attendance ?? null : null,
    notes_submitted: notesSubmitted(submission, occurrence),
    did_not_meet_reason: submission?.did_not_meet_reason || null,
    source,
  };
}

function aggregateEvents(events: WeeklyEvent[]) {
  const expected = events.length;
  const met = events.filter((event) => event.status === 'met').length;
  const didNotMeet = events.filter((event) => event.status === 'did_not_meet').length;
  const noSummary = events.filter((event) => event.status === 'no_summary').length;
  const totalAttendance = events.reduce((sum, event) => sum + (event.attendance_count ?? 0), 0);
  const metWithAttendance = events.filter((event) => event.status === 'met' && (event.attendance_count ?? 0) > 0).length;

  return {
    expected,
    met,
    didNotMeet,
    noSummary,
    compliancePct: percent(met + didNotMeet, expected),
    totalAttendance,
    averageCircleSize: metWithAttendance > 0 ? Math.round((totalAttendance / metWithAttendance) * 10) / 10 : 0,
  };
}

function groupedBreakdown(events: WeeklyEvent[], key: 'campus' | 'circle_type') {
  const groups = new Map<string, WeeklyEvent[]>();
  for (const event of events) {
    const value = event[key] || 'Unknown';
    groups.set(value, [...(groups.get(value) ?? []), event]);
  }
  return Array.from(groups.entries())
    .map(([name, rows]) => ({ name, ...aggregateEvents(rows) }))
    .sort((a, b) => b.expected - a.expected || a.name.localeCompare(b.name));
}

function reasonInsights(events: WeeklyEvent[]) {
  const didNotMeetRows = events.filter((event) => event.status === 'did_not_meet');
  const counts = new Map<string, { reason: string; count: number; category: 'valid' | 'coaching' | 'other' }>();
  for (const event of didNotMeetRows) {
    const reason = event.did_not_meet_reason?.trim() || 'Other';
    const key = reason.toLowerCase();
    const existing = counts.get(key) ?? { reason, count: 0, category: reasonCategory(reason) };
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

  return {
    total: didNotMeetRows.length,
    topReasons: byReason.slice(0, 3),
    byReason,
    byCategory,
  };
}

function serializeCSVRows(events: WeeklyEvent[]) {
  return events.map((event) => ({
    Week: event.week_start_date,
    Leader: event.leader_name,
    Circle: event.circle_name,
    Status: event.leader_status,
    Campus: event.campus,
    'Circle Type': event.circle_type,
    'Scheduled Date': event.scheduled_date,
    Time: event.scheduled_time,
    Frequency: event.frequency,
    'Reporting Status': event.status_label,
    Attendance: event.attendance_count ?? '',
    'Notes Submitted': event.notes_submitted ? 'Yes' : 'No',
    'Did Not Meet Reason': event.did_not_meet_reason ?? '',
    Source: event.source,
  }));
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

// Full-content record for the AI export. Unlike WeeklyEvent (which strips the
// summary text down to a boolean), this carries the actual topic / notes /
// prayer requests so the export is useful for downstream analysis.
function buildExportRecord(expected: ExpectedEvent, indexes: ReturnType<typeof buildIndexes>) {
  const key = `${expected.leader.id}|${expected.week_start_date}`;
  const submission = indexes.submissionsByLeaderWeek.get(key);
  const occurrence = indexes.occurrencesByLeaderWeek.get(key);
  const event = buildWeeklyEvent(expected, indexes);
  const reason = submission?.did_not_meet_reason || null;

  return {
    week_start_date: expected.week_start_date,
    scheduled_date: expected.expected_date,
    scheduled_time: expected.leader.time || '',
    frequency: expected.leader.frequency || 'Weekly',
    leader_id: expected.leader.id,
    leader_name: expected.leader.name,
    circle_name: event.circle_name,
    campus: event.campus,
    circle_type: event.circle_type,
    acpd: expected.leader.acpd || '',
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

export async function GET(request: Request) {
  try {
    const db = getDB();
    const { searchParams } = new URL(request.url);

    const today = todayCentralISO();
    const currentWeek = startOfWeekSunday(today);
    const selectedWeek = searchParams.get('week_start_date') || currentWeek;
    const rangePreset = searchParams.get('range') || 'semester_to_date';
    const customStart = searchParams.get('start_date');
    const customEnd = searchParams.get('end_date');
    const campusFilter = searchParams.getAll('campus').filter(Boolean);
    const circleTypeFilter = searchParams.getAll('circle_type').filter(Boolean);
    const statusFilter = searchParams.getAll('status').filter((value) => value && value !== 'all');
    const exportMode = searchParams.get('export') === '1';

    let startDate = customStart || addDays(currentWeek, -84);
    let endDate = customEnd || addDays(currentWeek, 6);

    if (!customStart && !customEnd) {
      if (rangePreset === 'current_week') {
        startDate = selectedWeek;
        endDate = addDays(selectedWeek, 6);
      } else if (rangePreset === 'previous_week') {
        startDate = addDays(selectedWeek, -7);
        endDate = addDays(selectedWeek, -1);
      } else if (rangePreset === 'year_to_date') {
        startDate = `${today.slice(0, 4)}-01-01`;
        endDate = today;
      } else if (rangePreset === 'semester_to_date') {
        const month = monthIndex(today);
        const year = today.slice(0, 4);
        const semesterStart = month <= 4 ? `${year}-01-01` : month <= 7 ? `${year}-05-01` : `${year}-08-01`;
        startDate = semesterStart;
        endDate = today;
      }
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ error: 'Dates must be YYYY-MM-DD' }, { status: 400 });
    }

    let leadersQuery = db
      .from('circle_leaders')
      .select('id, name, circle_name, ccb_group_name, campus, circle_type, acpd, day, time, frequency, meeting_start_date, status, leader_type')
      .order('name')
      .limit(5000);

    if (campusFilter.length > 0) leadersQuery = leadersQuery.in('campus', campusFilter);
    if (circleTypeFilter.length > 0) leadersQuery = leadersQuery.in('circle_type', circleTypeFilter);
    if (statusFilter.length > 0) leadersQuery = leadersQuery.in('status', statusFilter);

    const { data: leaders, error: leadersError } = await leadersQuery;
    if (leadersError) throw leadersError;

    const leaderRows = (leaders ?? []) as LeaderRow[];
    const leaderIds = leaderRows.map((leader) => leader.id);

    if (leaderIds.length === 0) {
      return NextResponse.json({
        filters: { rangePreset, startDate, endDate, selectedWeek, campuses: [], circleTypes: [], statuses: [] },
        summary: aggregateEvents([]),
        wowTrend: { complianceDelta: 0, attendanceDelta: 0, expectedDelta: 0 },
        weeklyEvents: [],
        weeklyTrend: [],
        campusBreakdown: [],
        circleTypeBreakdown: [],
        didNotMeetInsights: reasonInsights([]),
        csvRows: [],
      });
    }

    const queryStart = startOfWeekSunday(startDate);
    const queryEnd = addDays(startOfWeekSunday(endDate), 6);
    const selectedWeekEnd = addDays(selectedWeek, 6);

    const [occurrencesRes, submissionsRes, snapshotsRes] = await Promise.all([
      db
        .from('circle_meeting_occurrences')
        .select('id, leader_id, meeting_date, status, headcount, has_notes, topic, notes, prayer_requests, source')
        .in('leader_id', leaderIds)
        .gte('meeting_date', queryStart)
        .lte('meeting_date', queryEnd)
        .limit(20000),
      db
        .from('circle_event_summaries')
        .select('id, leader_id, occurrence, did_not_meet, did_not_meet_reason, topic, notes, prayer_requests, info, attendee_ccb_ids, manual_attendees, status, reviewed_at')
        .in('leader_id', leaderIds)
        .gte('occurrence', `${queryStart}T00:00:00.000Z`)
        .lt('occurrence', `${addDays(queryEnd, 1)}T00:00:00.000Z`)
        .limit(20000),
      db
        .from('event_summary_snapshots')
        .select('circle_leader_id, week_start_date, event_summary_state, ccb_event_scheduled, ccb_report_available')
        .in('circle_leader_id', leaderIds)
        .gte('week_start_date', queryStart)
        .lte('week_start_date', startOfWeekSunday(queryEnd))
        .limit(20000),
    ]);

    if (occurrencesRes.error) throw occurrencesRes.error;
    if (submissionsRes.error) throw submissionsRes.error;

    let snapshotRows = (snapshotsRes.data ?? []) as SnapshotRow[];
    if (snapshotsRes.error && /ccb_event_scheduled|ccb_report_available/.test(snapshotsRes.error.message)) {
      const fallback = await db
        .from('event_summary_snapshots')
        .select('circle_leader_id, week_start_date, event_summary_state')
        .in('circle_leader_id', leaderIds)
        .gte('week_start_date', queryStart)
        .lte('week_start_date', startOfWeekSunday(queryEnd))
        .limit(20000);
      if (fallback.error) throw fallback.error;
      snapshotRows = (fallback.data ?? []).map((row: any) => ({
        ...row,
        ccb_event_scheduled: false,
        ccb_report_available: false,
      }));
    } else if (snapshotsRes.error) {
      throw snapshotsRes.error;
    }

    const indexes = buildIndexes(
      (submissionsRes.data ?? []) as SubmissionRow[],
      (occurrencesRes.data ?? []) as OccurrenceRow[],
      snapshotRows
    );

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
        if (!isExpectedThisWeek(leader, week)) continue;
        const expectedDate = expectedDateForWeek(week, leader);
        addExpected(leader.id, week, expectedDate);
      }
    }

    // Historical correction: current status is not a reliable proxy for a
    // past week. If a circle reported in Supabase for a week, include it in
    // that week's reporting set even if it is now paused/off-boarding/etc.
    for (const row of (submissionsRes.data ?? []) as SubmissionRow[]) {
      if (row.status && row.status !== 'submitted') continue;
      const reportDate = dateFromTimestamp(row.occurrence);
      addExpected(row.leader_id, startOfWeekSunday(reportDate), reportDate);
    }

    for (const row of (occurrencesRes.data ?? []) as OccurrenceRow[]) {
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
      addExpected(row.circle_leader_id, row.week_start_date, expectedDateForWeek(row.week_start_date, leader));
    }

    const allExpected = Array.from(allExpectedByKey.values());
    const allEvents = allExpected.map((event) => buildWeeklyEvent(event, indexes));
    const rangedEvents = allEvents.filter((event) => event.scheduled_date >= startDate && event.scheduled_date <= endDate);

    // Export mode: return full summary content for every expected event in the
    // range so it can be downloaded as JSON/CSV and handed to AI for analysis.
    if (exportMode) {
      const records = allExpected
        .filter((event) => event.expected_date >= startDate && event.expected_date <= endDate)
        .map((event) => buildExportRecord(event, indexes))
        .sort(
          (a, b) =>
            a.scheduled_date.localeCompare(b.scheduled_date) ||
            a.campus.localeCompare(b.campus) ||
            a.leader_name.localeCompare(b.leader_name)
        );

      return NextResponse.json(
        {
          generatedAt: new Date().toISOString(),
          filters: {
            startDate,
            endDate,
            campuses: campusFilter,
            circleTypes: circleTypeFilter,
            statuses: statusFilter,
          },
          summary: aggregateEvents(rangedEvents),
          totalRecords: records.length,
          events: records,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    const selectedWeekEvents = allEvents
      .filter((event) => event.week_start_date === selectedWeek && event.scheduled_date <= selectedWeekEnd)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.scheduled_time.localeCompare(b.scheduled_time) || a.leader_name.localeCompare(b.leader_name));

    const summary = aggregateEvents(rangedEvents);
    const previousWeek = addDays(selectedWeek, -7);
    const selectedSummary = aggregateEvents(allEvents.filter((event) => event.week_start_date === selectedWeek));
    const previousSummary = aggregateEvents(allEvents.filter((event) => event.week_start_date === previousWeek));

    const weeklyTrend = weekStartsBetween(startOfWeekSunday(startDate), startOfWeekSunday(endDate)).map((week) => {
      const rows = allEvents.filter((event) => event.week_start_date === week);
      return {
        week_start_date: week,
        label: new Date(`${week}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        ...aggregateEvents(rows),
      };
    });

    const reasonTrend = weeklyTrend.map((week) => {
      const rows = allEvents.filter((event) => event.week_start_date === week.week_start_date);
      const categories = reasonInsights(rows).byCategory;
      return { week_start_date: week.week_start_date, ...categories };
    });

    const campuses = Array.from(new Set(leaderRows.map((leader) => leader.campus).filter(Boolean) as string[])).sort();
    const circleTypes = Array.from(new Set(leaderRows.map((leader) => leader.circle_type).filter(Boolean) as string[])).sort();
    const statuses = Array.from(new Set(leaderRows.map((leader) => leader.status).filter(Boolean) as string[])).sort();

    return NextResponse.json(
      {
        filters: {
          rangePreset,
          startDate,
          endDate,
          selectedWeek,
          previousWeek,
          campuses,
          circleTypes,
          statuses,
        },
        summary,
        selectedWeekSummary: selectedSummary,
        wowTrend: {
          complianceDelta: Math.round((selectedSummary.compliancePct - previousSummary.compliancePct) * 10) / 10,
          attendanceDelta: selectedSummary.totalAttendance - previousSummary.totalAttendance,
          expectedDelta: selectedSummary.expected - previousSummary.expected,
        },
        weeklyEvents: selectedWeekEvents,
        weeklyTrend,
        reasonTrend,
        campusBreakdown: groupedBreakdown(rangedEvents, 'campus'),
        circleTypeBreakdown: groupedBreakdown(rangedEvents, 'circle_type'),
        didNotMeetInsights: reasonInsights(rangedEvents),
        csvRows: serializeCSVRows(selectedWeekEvents),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('[circle-reporting GET]', err);
    return NextResponse.json({ error: err.message || 'Failed to load circle reporting data' }, { status: 500 });
  }
}
