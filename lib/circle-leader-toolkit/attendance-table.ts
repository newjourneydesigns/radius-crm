/**
 * Table-backed attendance for the Circle Leader Toolkit.
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
 * per meeting date) and `circle_meeting_attendees` (one row per person per
 * occurrence). This module reads THOSE, so the first paint is a couple of
 * indexed Supabase queries instead of a blob fetch, an XML parse, and a live
 * CCB round trip.
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
 *     those events, so `no_record` rows are ignored here and absence simply
 *     reads as pending. That also sidesteps the sync keying on (leader, date)
 *     while the toolkit keys on (event, date): a `met` row carries its
 *     `ccb_event_id`, and that is the key used.
 *
 * Strangler-fig by design: each loader returns `null` when it finds no usable
 * rows for the leader, and the caller falls through to the existing blob/CCB
 * path. The sync skips leaders with no `ccb_event_ids` and a different status
 * filter than the toolkit, so some leaders won't be covered on day one — they
 * keep today's behavior, and cover as the sync's population grows. Nobody gets
 * worse; covered leaders get fast.
 *
 * The DDL for these tables is not in the repo (only ALTERs are), so the
 * authoritative shape is the sync's own upsert — mirrored in the row types
 * below. If the sync's columns change, change these.
 */

import { createServiceSupabaseClient } from '../server-supabase';
import { isDidNotMeetEvent } from './did-not-meet-reasons';

export type OccurrenceStatus = { has: boolean; dnm: boolean; headCount: number | null };

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
  raw_payload: OccurrenceRawPayload | null;
};

type AttendeeRow = {
  occurrence_id: number | string;
  ccb_individual_id: string | number | null;
};

type Supabase = ReturnType<typeof createServiceSupabaseClient>;

function textOf(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

/**
 * The toolkit's "received" rule, applied to a synced row. Mirrors
 * `buildAttendanceMap` in events-data.ts field for field so a summary can never
 * count as received on one path and pending on the other.
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
    !!textOf(raw.topic) ||
    (headCount ?? 0) > 0 ||
    attendeeCount > 0;

  return { has, dnm, headCount };
}

/**
 * Per-event status for one leader over a date window, from the synced table.
 * Keyed `"${ccb_event_id}|${YYYY-MM-DD}"` to match the blob path's map.
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
    .select('id, ccb_event_id, meeting_date, status, headcount, raw_payload')
    .eq('leader_id', leaderId)
    .in('status', ['met', 'did_not_meet'])
    .not('ccb_event_id', 'is', null)
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
    const eventId = textOf(row.ccb_event_id);
    const date = textOf(row.meeting_date).slice(0, 10);
    if (!eventId || !date) continue;
    map.set(`${eventId}|${date}`, statusFromRow(row));
  }
  return map.size > 0 ? map : null;
}

/**
 * Per-person "last attended" for one leader over a window, from the synced
 * attendee rows. Same output shape as `computeLastAttended` in roster-data.ts:
 * `{ ccb_individual_id → latest YYYY-MM-DD attended }`.
 *
 * Did-not-meet occurrences are excluded (they carry no attendees anyway, but
 * the guard matches the blob path so the two can never diverge). The sync
 * only writes attendee rows when CCB listed attendees, so a head-count-only
 * meeting contributes nothing per person — identical to the blob path, which
 * also iterates attendees.
 *
 * Two plain queries rather than a PostgREST embed: the FK constraint name is
 * not in the repo, and guessing it would fail silently at runtime.
 *
 * Returns `null` when there are no covered occurrences for the leader — the
 * caller must fall back. A covered leader whose members simply have no
 * attendance in the window gets an empty map, which is a real answer.
 */
export async function loadLastAttendedFromTable(
  supabase: Supabase,
  leaderId: number | string,
  startStr: string,
  endStr: string
): Promise<Record<string, string> | null> {
  const { data: occData, error: occError } = await supabase
    .from('circle_meeting_occurrences')
    .select('id, meeting_date, status, raw_payload')
    .eq('leader_id', leaderId)
    .in('status', ['met', 'did_not_meet'])
    .gte('meeting_date', startStr)
    .lte('meeting_date', endStr);

  if (occError) {
    console.warn('[toolkit/attendance-table] occurrence read failed:', occError.message);
    return null;
  }

  const occurrences = (occData ?? []) as Array<Pick<OccurrenceRow, 'id' | 'meeting_date' | 'status' | 'raw_payload'>>;
  if (occurrences.length === 0) return null;

  // Date per occurrence id, skipping did-not-meet weeks (same rule as the
  // blob path's computeLastAttended).
  const dateById = new Map<string, string>();
  for (const occ of occurrences) {
    const notes = textOf(occ.raw_payload?.notes);
    if (isDidNotMeetEvent({ didNotMeet: occ.raw_payload?.didNotMeet ?? occ.status === 'did_not_meet', notes })) {
      continue;
    }
    const date = textOf(occ.meeting_date).slice(0, 10);
    if (date) dateById.set(String(occ.id), date);
  }
  if (dateById.size === 0) return {};

  const { data: attData, error: attError } = await supabase
    .from('circle_meeting_attendees')
    .select('occurrence_id, ccb_individual_id')
    .in('occurrence_id', Array.from(dateById.keys()));

  if (attError) {
    console.warn('[toolkit/attendance-table] attendee read failed:', attError.message);
    return null;
  }

  const lastAttended: Record<string, string> = {};
  for (const row of (attData ?? []) as AttendeeRow[]) {
    const id = textOf(row.ccb_individual_id);
    const date = dateById.get(String(row.occurrence_id));
    if (!id || !date) continue;
    if (!lastAttended[id] || date > lastAttended[id]) lastAttended[id] = date;
  }
  return lastAttended;
}
