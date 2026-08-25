/**
 * AI Circle Summary — pure metric + corpus builders.
 *
 * Everything here is deterministic and side-effect free so the API route stays
 * thin and the math is testable. All date work is Luxon in America/Chicago,
 * matching how meeting dates and submission timestamps are stored elsewhere
 * (see lib/week.ts and the circle-leader-toolkit routes).
 */
import { DateTime } from 'luxon';
import { composeSubmittedNotes } from './circleNotes';

const ZONE = 'America/Chicago';

export type TimeframeKey = 'last_month' | 'last_3_months' | 'last_6_months' | 'semester';

export const TIMEFRAME_KEYS: TimeframeKey[] = ['last_month', 'last_3_months', 'last_6_months', 'semester'];

export interface Timeframe {
  key: TimeframeKey;
  label: string;
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string;   // YYYY-MM-DD inclusive (today)
}

export interface OccurrenceRow {
  id: string;
  meeting_date: string;
  status: 'met' | 'did_not_meet' | 'no_record';
  headcount: number | null;
  regular_count: number | null;
  visitor_count: number | null;
  topic?: string | null;
  notes?: string | null;
  prayer_requests?: string | null;
}

export interface AttendeeRow {
  occurrence_id: string;
  ccb_individual_id: string;
  name: string | null;
  attendance_type: string | null;
}

export interface RosterRow {
  ccb_individual_id: string;
  full_name: string | null;
  added_at: string | null;
}

export interface AppSummaryRow {
  occurrence: string; // timestamptz
  did_not_meet: boolean | null;
  did_not_meet_reason: string | null;
  topic: string | null;
  notes: string | null;
  prayer_requests: string | null;
  dynamic_responses: unknown;
  // JSONB array of {firstName,lastName,...} — people the leader reported who
  // aren't in CCB yet. Names only reach the AI corpus (no contact info).
  manual_attendees?: unknown;
}

export interface CircleMetrics {
  rosterCount: number;
  membersAdded: { count: number; names: string[]; reliable: boolean };
  meetings: { met: number; didNotMeet: number; noRecord: number; total: number };
  attendance: {
    average: number | null;
    firstHalfAvg: number | null;
    secondHalfAvg: number | null;
    trendLabel: string | null;
  };
  rosterShowRate: number | null; // 0–100, avg regulars ÷ current active roster
  newFaces: Array<{ ccbId: string; name: string; firstDate: string; timesAttended: number }>;
  consistency: Array<{ ccbId: string; name: string; attended: number; ofMeetings: number }>;
  firstRecordedMeeting: string | null; // earliest synced meeting ever, for "since records began"
}

// Rows with added_at at (or near) the Unix epoch predate the added_at
// migration — their real join date is unknown, so they are excluded from
// "members added" and flag the count as approximate.
const ADDED_AT_RELIABLE_FLOOR = '1971-01-01';

export function resolveTimeframe(key: TimeframeKey, now: DateTime = DateTime.now().setZone(ZONE)): Timeframe {
  const today = now.setZone(ZONE).startOf('day');
  const endDate = today.toISODate()!;
  if (key === 'semester') {
    // Same semester boundaries as circle-reporting: Jan 1 / May 1 / Aug 1.
    const month = today.month;
    const startMonth = month <= 4 ? 1 : month <= 7 ? 5 : 8;
    const start = DateTime.fromObject({ year: today.year, month: startMonth, day: 1 }, { zone: ZONE });
    return { key, label: 'This semester', startDate: start.toISODate()!, endDate };
  }
  const months = key === 'last_month' ? 1 : key === 'last_3_months' ? 3 : 6;
  const label = key === 'last_month' ? 'Last month' : `Last ${months} months`;
  return { key, label, startDate: today.minus({ months }).toISODate()!, endDate };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Attendance for one met meeting, counting regulars only when derivable. */
function regularsFor(occ: OccurrenceRow): number | null {
  if (occ.regular_count != null) return occ.regular_count;
  if (occ.headcount != null) return Math.max(occ.headcount - (occ.visitor_count ?? 0), 0);
  return null;
}

export function computeMetrics(args: {
  timeframe: Timeframe;
  occurrences: OccurrenceRow[]; // in-window, ascending by meeting_date
  attendees: AttendeeRow[];     // rows for the in-window occurrences
  priorAttendeeIds: Set<string>; // every ccb_individual_id seen before the window
  rosterRows: RosterRow[];      // current active roster
  firstRecordedMeeting: string | null;
}): CircleMetrics {
  const { timeframe, occurrences, attendees, priorAttendeeIds, rosterRows, firstRecordedMeeting } = args;

  const met = occurrences.filter((o) => o.status === 'met');
  const didNotMeet = occurrences.filter((o) => o.status === 'did_not_meet').length;
  const noRecord = occurrences.filter((o) => o.status === 'no_record').length;

  // Average attendance over met meetings with a recorded headcount.
  const counted = met.filter((o) => o.headcount != null);
  const average = counted.length
    ? round1(counted.reduce((sum, o) => sum + o.headcount!, 0) / counted.length)
    : null;

  // Trend: split the window at its midpoint date and compare met-meeting
  // averages. Suppressed unless both halves have at least 2 counted meetings.
  const start = DateTime.fromISO(timeframe.startDate, { zone: ZONE });
  const end = DateTime.fromISO(timeframe.endDate, { zone: ZONE });
  const midpoint = start.plus({ milliseconds: end.diff(start).as('milliseconds') / 2 }).toISODate()!;
  const firstHalf = counted.filter((o) => o.meeting_date < midpoint);
  const secondHalf = counted.filter((o) => o.meeting_date >= midpoint);
  let firstHalfAvg: number | null = null;
  let secondHalfAvg: number | null = null;
  let trendLabel: string | null = null;
  if (firstHalf.length >= 2 && secondHalf.length >= 2) {
    firstHalfAvg = round1(firstHalf.reduce((s, o) => s + o.headcount!, 0) / firstHalf.length);
    secondHalfAvg = round1(secondHalf.reduce((s, o) => s + o.headcount!, 0) / secondHalf.length);
    trendLabel = `averaging ${firstHalfAvg} → ${secondHalfAvg}`;
  }

  // Roster show-rate: avg regulars per met meeting ÷ current active roster.
  const rosterCount = rosterRows.length;
  const regularCounts = met.map(regularsFor).filter((n): n is number => n != null);
  const rosterShowRate = rosterCount > 0 && regularCounts.length > 0
    ? Math.min(100, Math.round((regularCounts.reduce((s, n) => s + n, 0) / regularCounts.length / rosterCount) * 100))
    : null;

  // Members added: active roster rows whose added_at falls inside the window.
  const epochRows = rosterRows.filter((r) => r.added_at != null && r.added_at < ADDED_AT_RELIABLE_FLOOR);
  const added = rosterRows.filter((r) => {
    if (!r.added_at || r.added_at < ADDED_AT_RELIABLE_FLOOR) return false;
    const addedDate = DateTime.fromISO(r.added_at, { zone: ZONE }).toISODate();
    return addedDate != null && addedDate >= timeframe.startDate && addedDate <= timeframe.endDate;
  });
  const membersAdded = {
    count: added.length,
    names: added.map((r) => r.full_name || 'Unknown').sort(),
    reliable: epochRows.length === 0,
  };

  // Per-person attendance across the in-window occurrences.
  const dateByOccurrence = new Map(occurrences.map((o) => [o.id, o.meeting_date]));
  const perPerson = new Map<string, { name: string; dates: Set<string> }>();
  for (const a of attendees) {
    const date = dateByOccurrence.get(a.occurrence_id);
    if (!date) continue;
    const entry = perPerson.get(a.ccb_individual_id) ?? { name: a.name || 'Unknown', dates: new Set<string>() };
    if (a.name) entry.name = a.name;
    entry.dates.add(date);
    perPerson.set(a.ccb_individual_id, entry);
  }

  const newFaces = Array.from(perPerson.entries())
    .filter(([id]) => !priorAttendeeIds.has(id))
    .map(([id, p]) => ({
      ccbId: id,
      name: p.name,
      firstDate: Array.from(p.dates).sort()[0],
      timesAttended: p.dates.size,
    }))
    .sort((a, b) => a.firstDate.localeCompare(b.firstDate));

  const consistency = Array.from(perPerson.entries())
    .map(([id, p]) => ({ ccbId: id, name: p.name, attended: p.dates.size, ofMeetings: met.length }))
    .sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name));

  return {
    rosterCount,
    membersAdded,
    meetings: { met: met.length, didNotMeet, noRecord, total: occurrences.length },
    attendance: { average, firstHalfAvg, secondHalfAvg, trendLabel },
    rosterShowRate,
    newFaces,
    consistency,
    firstRecordedMeeting,
  };
}

const NOTE_CHAR_CAP = 1500;
const CORPUS_MEETING_CAP = 30;

function clip(text: string | null | undefined): string | null {
  const t = String(text ?? '').trim();
  if (!t) return null;
  return t.length > NOTE_CHAR_CAP ? `${t.slice(0, NOTE_CHAR_CAP)}…` : t;
}

/** Names (only — no contact info) of people the leader added manually. */
function manualAttendeeNames(manualAttendees: unknown): string[] {
  if (!Array.isArray(manualAttendees)) return [];
  return manualAttendees
    .map((p) => {
      const person = (p ?? {}) as { firstName?: unknown; lastName?: unknown };
      return `${String(person.firstName ?? '').trim()} ${String(person.lastName ?? '').trim()}`.trim();
    })
    .filter(Boolean);
}

/**
 * Chronological plain-text corpus of the circle's meeting notes for the AI.
 * App-submitted summaries take precedence over the CCB-synced occurrence for
 * the same date (their narrative lives in dynamic_responses — composed via
 * composeSubmittedNotes), matching resolveLeaderWeek's precedence.
 */
export function buildNotesCorpus(occurrences: OccurrenceRow[], appSummaries: AppSummaryRow[]): string {
  type Entry = {
    date: string;
    status: string;
    topic: string | null;
    notes: string | null;
    prayerRequests: string | null;
  };

  const byDate = new Map<string, Entry>();
  for (const occ of occurrences) {
    const status = occ.status === 'met' ? 'Met' : occ.status === 'did_not_meet' ? 'Did not meet' : 'No record';
    byDate.set(occ.meeting_date, {
      date: occ.meeting_date,
      status,
      topic: clip(occ.topic),
      notes: clip(occ.notes),
      prayerRequests: clip(occ.prayer_requests),
    });
  }

  for (const sub of appSummaries) {
    const date = DateTime.fromISO(sub.occurrence, { zone: ZONE }).toISODate();
    if (!date) continue;
    let composed = composeSubmittedNotes(sub.notes, sub.dynamic_responses);
    const newPeople = manualAttendeeNames(sub.manual_attendees);
    if (newPeople.length) {
      composed = [composed, `New people this meeting (not in CCB yet): ${newPeople.join(', ')}`]
        .filter(Boolean)
        .join('\n\n');
    }
    byDate.set(date, {
      date,
      status: sub.did_not_meet
        ? `Did not meet${sub.did_not_meet_reason ? ` (${sub.did_not_meet_reason})` : ''}`
        : 'Met',
      topic: clip(sub.topic),
      notes: clip(composed),
      prayerRequests: clip(sub.prayer_requests),
    });
  }

  const entries = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  const kept = entries.slice(-CORPUS_MEETING_CAP);

  const blocks = kept.map((e) => {
    const lines = [`${e.date} | ${e.status}${e.topic ? ` | Topic: ${e.topic}` : ''}`];
    if (e.notes) lines.push(`Notes: ${e.notes}`);
    if (e.prayerRequests) lines.push(`Prayer requests: ${e.prayerRequests}`);
    return lines.join('\n');
  });

  const dropped = entries.length - kept.length;
  if (dropped > 0) blocks.unshift(`(${dropped} earlier meeting${dropped === 1 ? '' : 's'} omitted to stay within limits)`);

  return blocks.join('\n\n');
}
