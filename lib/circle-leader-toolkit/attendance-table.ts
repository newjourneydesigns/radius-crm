/**
 * Table-backed meeting STATUS for the Circle Leader Toolkit's events list.
 *
 * Scope note: this answers "was this meeting's summary received?" and nothing
 * else. It used to also answer "when did each person last attend?", and that
 * was a mistake — see the header of roster-data.ts. Per-person attendance now
 * comes from CCB, because these rows cannot carry it faithfully: they record no
 * attendance status (someone marked absent is stored the same as someone
 * present) and a `no_record` stub can overwrite a real meeting. Neither hurts a
 * received/pending answer, and both corrupt a last-attended date.
 *
 * The toolkit's read path used to answer "was this meeting's summary received?"
 * by downloading CCB's GLOBAL 12-week `attendance_profiles` payload (every
 * group in the church, as XML, multiple megabytes), parsing it, and keeping one
 * group's slice — on every page open. That is the read-amplification behind
 * "the toolkit is slow to open".
 *
 * Meanwhile the event-summary tracker's sync (`/api/ccb/sync-attendance`,
 * hourly for the last 14 days and nightly for the semester) already normalizes
 * that same payload into `circle_meeting_occurrences` (one small row per leader
 * per meeting date). This module reads THAT, so the first paint is one indexed
 * Supabase query instead of a blob fetch, an XML parse, and a live CCB round
 * trip.
 *
 * Two facts about the sync shape this code has to respect:
 *
 *  1. The sync writes `status = 'met'` for ANY CCB record it sees — including
 *     an empty one with no notes, topic, head count, or attendees. The toolkit's
 *     rule for "received" is stricter. Rather than change the sync (other
 *     readers depend on it), the toolkit's exact rule is re-applied here from
 *     `raw_payload`, which carries every field the rule needs. Same for the
 *     notes-prefix "did not meet" marker: the sync only honors CCB's explicit
 *     flag; `isDidNotMeetEvent` honors both, exactly as the blob path does.
 *
 *  2. `no_record` rows are the sync's guess at expected-but-missing meetings,
 *     generated from RADIUS's weekly `day` config — NOT from the CCB calendar,
 *     and ignoring bi-weekly cadence. The toolkit keeps its own calendar as the
 *     source of WHICH events exist and reads this table only for the STATUS of
 *     those events, so `no_record` rows are ignored here and absence reads as
 *     pending — BUT ONLY when the sync was actually looking at that event.
 *
 *  3. The sync sees only the ids in `circle_leaders.ccb_event_ids`, and keys
 *     rows on (leader, date). A calendar event outside that list is invisible
 *     to it, and a second event on the same date is overwritten. Either way a
 *     missing row means "not tracked", not "not submitted". The first version
 *     of this module got that wrong and rendered a Lead-app submission as
 *     PENDING; `syncCoversCalendar` is the guard, and callers must apply it
 *     before trusting a loader's answer as complete.
 *
 * Strangler-fig by design: each loader returns `null` when it finds no usable
 * rows for the leader, and callers ALSO refuse the table unless the sync's
 * event list covers the calendar. In both cases the existing blob/CCB path
 * runs unchanged. The sync skips leaders with no `ccb_event_ids`, uses a
 * different status filter than the toolkit, and a leader's list can lag a
 * renamed or re-created CCB event — so coverage is partial today and grows as
 * that data is fixed. The timing log names the reason a leader was refused.
 *
 * The DDL for these tables is not in the repo (only ALTERs are), so the
 * authoritative shape is the sync's own upsert — mirrored in the row types
 * below. If the sync's columns change, change these.
 */

import { createServiceSupabaseClient } from '../server-supabase';
import { isDidNotMeetEvent } from './did-not-meet-reasons';

export type OccurrenceStatus = { has: boolean; dnm: boolean; headCount: number | null };

/**
 * Whether the synced table can be trusted as the WHOLE answer for a leader.
 *
 * The table can always confirm "received" — a `met` row is real. It can only
 * confirm "pending" if the sync was actually looking at the event in question,
 * and the sync looks only at the ids in `circle_leaders.ccb_event_ids`. A
 * calendar event outside that list is invisible to the sync, so its missing
 * row means "not tracked", not "not submitted" — and rendering it as pending
 * is exactly the regression this guards against (a leader who submitted via
 * the Lead app under an event the sync doesn't list read as PENDING).
 *
 * Also refuses when two calendar events share a date: the sync keys on
 * (leader, date) and keeps one row, so the other event's status is lost.
 *
 * Returns the reason on refusal so the timing log can say which leaders need
 * their `ccb_event_ids` fixed — that is the data problem to solve upstream.
 */
export function syncCoversCalendar(
  calendarEvents: Array<{ eventId: string; startDate: string }>,
  ccbEventIds: string[] | null | undefined
): { covered: true } | { covered: false; reason: string } {
  const tracked = new Set((ccbEventIds ?? []).map((id) => String(id).trim()).filter(Boolean));
  if (tracked.size === 0) return { covered: false, reason: 'no-ccb-event-ids' };

  const untracked = new Set<string>();
  const seenDates = new Map<string, string>();
  for (const e of calendarEvents) {
    const id = String(e.eventId ?? '').trim();
    const date = String(e.startDate ?? '').slice(0, 10);
    if (!id) continue;
    if (!tracked.has(id)) untracked.add(id);
    const prior = seenDates.get(date);
    if (prior && prior !== id) return { covered: false, reason: `two-events-on-${date}` };
    seenDates.set(date, id);
  }
  if (untracked.size > 0) {
    return { covered: false, reason: `untracked-event-ids:${Array.from(untracked).join(',')}` };
  }
  return { covered: true };
}

/** Exactly what `/api/ccb/sync-attendance` stores in `raw_payload`. */
type OccurrenceRawPayload = {
  eventId?: string | null;
  title?: string | null;
  occurrence?: string | null;
  headCount?: number | null;
  didNotMeet?: boolean | null;
  topic?: string | null;
  notes?: string | null;
  prayerRequests?: string | null;
  attendeeCount?: number | null;
};

type OccurrenceRow = {
  id: number | string;
  ccb_event_id: string | null;
  meeting_date: string;
  status: 'met' | 'did_not_meet' | 'no_record' | string;
  headcount: number | null;
  has_notes?: boolean | null;
  raw_payload: OccurrenceRawPayload | null;
};

type Supabase = ReturnType<typeof createServiceSupabaseClient>;

function textOf(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

/**
 * The toolkit's "received" rule, applied to a synced row. Mirrors
 * `buildAttendanceMap` in events-data.ts field for field so a summary can never
 * count as received on one path and pending on the other.
 *
 * Reads the row's own columns as well as `raw_payload`: at least one writer
 * upserts `met` rows with `headcount` and `has_notes` set but `raw_payload`
 * empty and `ccb_event_id` null (124 such rows across 95 leaders in a
 * two-week window on 2026-09-02). A meeting is received if EITHER source
 * says so.
 */
function statusFromRow(row: OccurrenceRow): OccurrenceStatus {
  const raw = row.raw_payload ?? {};
  const notes = textOf(raw.notes);
  const dnm = isDidNotMeetEvent({ didNotMeet: raw.didNotMeet ?? row.status === 'did_not_meet', notes });

  const rawHeadCount = Number(raw.headCount ?? row.headcount);
  const attendeeCount = Number(raw.attendeeCount ?? 0);
  const headCount = rawHeadCount > 0 ? rawHeadCount : attendeeCount > 0 ? attendeeCount : null;

  const has =
    dnm ||
    !!notes ||
    row.has_notes === true ||
    !!textOf(raw.topic) ||
    (headCount ?? 0) > 0 ||
    attendeeCount > 0;

  return { has, dnm, headCount };
}

/** Date-only key for a synced row the sync stored without an event id. */
export function dateOnlyStatusKey(date: string): string {
  return `*|${date}`;
}

/**
 * Look up an event's status, tolerating the sync's null event ids. The sync
 * keys rows on (leader, date) and has been observed writing `status = 'met'`
 * with `ccb_event_id = null` for a real meeting (a leader's 8/23 with head
 * count 10 sat beside 8/16 and 8/30 that carried the id). Dropping those rows
 * rendered a received summary as PENDING. So: exact key first, then the
 * date-only key. The date fallback is safe only because `syncCoversCalendar`
 * refuses any leader with two calendar events on one date — within a covered
 * leader, a date identifies exactly one event.
 */
export function lookupOccurrenceStatus(
  map: Map<string, OccurrenceStatus>,
  eventId: string,
  date: string
): OccurrenceStatus | undefined {
  return map.get(`${eventId}|${date}`) ?? map.get(dateOnlyStatusKey(date));
}

/**
 * Per-event status for one leader over a date window, from the synced table.
 * Keyed `"${ccb_event_id}|${YYYY-MM-DD}"` to match the blob path's map; rows
 * the sync stored with a null event id are keyed by date alone (see
 * `lookupOccurrenceStatus`).
 *
 * Returns `null` when the table has nothing usable for this leader in the
 * window — the caller must fall back. An empty map is never returned: a leader
 * with a `met` row somewhere in the window is covered; one with none is not
 * distinguishable from "not synced", so it is treated as not covered.
 */
export async function loadOccurrenceStatuses(
  supabase: Supabase,
  leaderId: number | string,
  startStr: string,
  endStr: string
): Promise<Map<string, OccurrenceStatus> | null> {
  const { data, error } = await supabase
    .from('circle_meeting_occurrences')
    .select('id, ccb_event_id, meeting_date, status, headcount, has_notes, raw_payload')
    .eq('leader_id', leaderId)
    .in('status', ['met', 'did_not_meet'])
    .gte('meeting_date', startStr)
    .lte('meeting_date', endStr);

  if (error) {
    // Includes the table-not-visible case. Warn and let the caller fall back
    // rather than turning a read-path optimization into an outage.
    console.warn('[toolkit/attendance-table] occurrence read failed:', error.message);
    return null;
  }

  const rows = (data ?? []) as OccurrenceRow[];
  if (rows.length === 0) return null;

  const map = new Map<string, OccurrenceStatus>();
  for (const row of rows) {
    const date = textOf(row.meeting_date).slice(0, 10);
    if (!date) continue;
    const eventId = textOf(row.ccb_event_id);
    const status = statusFromRow(row);
    // A null event id is NOT a reason to drop a real meeting — key it by date.
    map.set(eventId ? `${eventId}|${date}` : dateOnlyStatusKey(date), status);
  }
  return map.size > 0 ? map : null;
}
