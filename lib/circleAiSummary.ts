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
  did_not_meet_reason?: string | null;
  topic?: string | null;
  notes?: string | null;
  prayer_requests?: string | null;
  dynamic_responses?: unknown;
  // JSONB array of {firstName,lastName,...} — people the leader reported who
  // aren't in CCB yet. Names only reach the AI corpus (no contact info).
  manual_attendees?: unknown;
  // TEXT[] of the roster people the leader ticked when submitting.
  attendee_ccb_ids?: unknown;
}

/** Who the leader reported for one meeting date, from their own submission. */
export interface SubmittedAttendance {
  date: string; // YYYY-MM-DD, Central
  didNotMeet: boolean;
  attendeeCcbIds: string[];
  /** Off-roster people the leader listed by hand — counted, but not identified. */
  manualCount: number;
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

/**
 * Per-date attendance out of the leader's own submitted summaries.
 *
 * A circle can have more than one CCB event landing on the same date, so
 * summaries are merged per date rather than letting the last row win. A date is
 * only "did not meet" when no summary for it reports a meeting.
 */
export function extractSubmittedAttendance(rows: AppSummaryRow[]): SubmittedAttendance[] {
  const byDate = new Map<string, SubmittedAttendance>();

  for (const row of rows) {
    const date = DateTime.fromISO(row.occurrence, { zone: ZONE }).toISODate();
    if (!date) continue;

    const entry = byDate.get(date) ?? {
      date,
      didNotMeet: Boolean(row.did_not_meet),
      attendeeCcbIds: [],
      manualCount: 0,
    };

    if (!row.did_not_meet) {
      entry.didNotMeet = false;
      const ids = Array.isArray(row.attendee_ccb_ids) ? row.attendee_ccb_ids : [];
      for (const raw of ids) {
        const id = String(raw ?? '').trim();
        if (id && !entry.attendeeCcbIds.includes(id)) entry.attendeeCcbIds.push(id);
      }
      entry.manualCount += manualAttendeeNames(row.manual_attendees).length;
    }

    byDate.set(date, entry);
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function computeMetrics(args: {
  timeframe: Timeframe;
  occurrences: OccurrenceRow[]; // in-window, ascending by meeting_date
  attendees: AttendeeRow[];     // rows for the in-window occurrences
  priorAttendeeIds: Set<string>; // every ccb_individual_id seen before the window
  rosterRows: RosterRow[];      // current active roster
  firstRecordedMeeting: string | null;
  submitted: SubmittedAttendance[]; // what the leader recorded in the app, in-window
}): CircleMetrics {
  const { timeframe, occurrences, attendees, priorAttendeeIds, rosterRows, firstRecordedMeeting, submitted } = args;

  const rosterNames = new Map(rosterRows.map((r) => [r.ccb_individual_id, r.full_name || 'Unknown']));

  const attendeesByOccurrence = new Map<string, AttendeeRow[]>();
  for (const a of attendees) {
    const list = attendeesByOccurrence.get(a.occurrence_id);
    if (list) list.push(a);
    else attendeesByOccurrence.set(a.occurrence_id, [a]);
  }

  // One row per meeting date, merged from both records of it: the CCB sync and
  // the leader's own submission. RADIUS only learns who was in the room when
  // the CCB round trip brings them back, and that trip can lag a day or miss an
  // occurrence entirely — which used to leave the meeting counted in the
  // denominator with nobody in it. Meeting notes have always merged the two
  // sources (see buildNotesCorpus); attendance now does the same.
  type MergedDay = {
    date: string;
    status: 'met' | 'did_not_meet' | 'no_record';
    headcount: number | null;
    regulars: number | null;
    people: Map<string, string>; // ccb_individual_id → display name
  };
  const days = new Map<string, MergedDay>();
  const dayFor = (date: string): MergedDay => {
    let day = days.get(date);
    if (!day) {
      day = { date, status: 'no_record', headcount: null, regulars: null, people: new Map() };
      days.set(date, day);
    }
    return day;
  };

  for (const occ of occurrences) {
    const day = dayFor(occ.meeting_date);
    if (occ.status === 'met' || day.status === 'no_record') day.status = occ.status;
    if (occ.headcount != null) day.headcount = occ.headcount;
    const regulars = regularsFor(occ);
    if (regulars != null) day.regulars = regulars;

    for (const a of attendeesByOccurrence.get(occ.id) ?? []) {
      const id = String(a.ccb_individual_id ?? '').trim();
      // An attendee row with no CCB id can't be told apart from any other one,
      // so it stays in the head count rather than collapsing every unidentified
      // person in the circle into a single name.
      if (!id) continue;
      if (a.name || !day.people.has(id)) day.people.set(id, a.name || rosterNames.get(id) || 'Unknown');
    }
  }

  for (const sub of submitted) {
    const day = dayFor(sub.date);
    if (sub.didNotMeet) {
      // The leader saying the circle didn't meet outranks a synced occurrence.
      day.status = 'did_not_meet';
      day.people.clear();
      continue;
    }
    day.status = 'met';
    for (const id of sub.attendeeCcbIds) {
      if (!day.people.has(id)) day.people.set(id, rosterNames.get(id) || 'Unknown');
    }
    // Off-roster guests carry no CCB id to follow across meetings, so they are
    // counted here and named in the notes corpus instead of the per-person list.
    if (day.headcount == null) day.headcount = sub.attendeeCcbIds.length + sub.manualCount;
    if (day.regulars == null) day.regulars = sub.attendeeCcbIds.length;
  }

  const orderedDays = Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));
  const met = orderedDays.filter((d) => d.status === 'met');
  const didNotMeet = orderedDays.filter((d) => d.status === 'did_not_meet').length;
  const noRecord = orderedDays.filter((d) => d.status === 'no_record').length;

  // Average attendance over met meetings with a recorded headcount.
  const counted = met.filter((d) => d.headcount != null);
  const average = counted.length
    ? round1(counted.reduce((sum, d) => sum + d.headcount!, 0) / counted.length)
    : null;

  // Trend: split the window at its midpoint date and compare met-meeting
  // averages. Suppressed unless both halves have at least 2 counted meetings.
  const start = DateTime.fromISO(timeframe.startDate, { zone: ZONE });
  const end = DateTime.fromISO(timeframe.endDate, { zone: ZONE });
  const midpoint = start.plus({ milliseconds: end.diff(start).as('milliseconds') / 2 }).toISODate()!;
  const firstHalf = counted.filter((d) => d.date < midpoint);
  const secondHalf = counted.filter((d) => d.date >= midpoint);
  let firstHalfAvg: number | null = null;
  let secondHalfAvg: number | null = null;
  let trendLabel: string | null = null;
  if (firstHalf.length >= 2 && secondHalf.length >= 2) {
    firstHalfAvg = round1(firstHalf.reduce((s, d) => s + d.headcount!, 0) / firstHalf.length);
    secondHalfAvg = round1(secondHalf.reduce((s, d) => s + d.headcount!, 0) / secondHalf.length);
    trendLabel = `averaging ${firstHalfAvg} → ${secondHalfAvg}`;
  }

  // Roster show-rate: avg regulars per met meeting ÷ current active roster.
  const rosterCount = rosterRows.length;
  const regularCounts = met.map((d) => d.regulars).filter((n): n is number => n != null);
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

  // Per-person attendance across the merged meeting days.
  const perPerson = new Map<string, { name: string; dates: Set<string> }>();
  for (const day of orderedDays) {
    for (const [id, name] of day.people) {
      const entry = perPerson.get(id) ?? { name, dates: new Set<string>() };
      if (name && name !== 'Unknown') entry.name = name;
      entry.dates.add(day.date);
      perPerson.set(id, entry);
    }
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
    meetings: { met: met.length, didNotMeet, noRecord, total: orderedDays.length },
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
