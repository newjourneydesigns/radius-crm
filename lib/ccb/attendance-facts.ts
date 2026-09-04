/**
 * Writes CCB's attendance payload into the durable fact tables.
 *
 * See supabase/migrations/20260904120000_ccb_attendance_facts.sql for why the
 * fact and its group attribution are stored separately. The short version: CCB
 * names an event and its attendees but not the group, every event -> group
 * mapping we hold decays with a sliding 12-week window, and letting that decay
 * reach the data is what erased 404 meetings.
 *
 * The rule this module exists to enforce: **not seeing something is never a
 * reason to delete it.** Deletes are scoped to the exact (event, occurrence)
 * pairs the payload actually contained, so a corrected record in CCB — someone
 * unchecked after the fact — still propagates, while an event missing from a
 * run leaves its history untouched. That is the precise inversion of the
 * `no_record` stub, which deleted on the basis of absence.
 *
 * Costs no CCB calls of its own. Callers hand it a payload they already
 * fetched.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LinkRow } from './ccb-client';

type Supabase = SupabaseClient<any, any, any>;

/** One person on one occurrence of one event. */
export type AttendanceFact = {
  ccbEventId: string;
  occurrenceDate: string; // YYYY-MM-DD
  ccbIndividualId: string;
  attendeeName: string;
  ccbStatus: string | null;
};

/**
 * Flatten the bulk attendance map `fetchAllAttendanceInRange` returns into
 * facts plus the occurrence keys they came from.
 *
 * Deliberately takes the WHOLE map rather than one leader's slice. The payload
 * is church-wide and already paid for; storing all of it means an event we
 * cannot attribute to a group today is still on file when we can. Filtering
 * here would rebuild the exact hole this table exists to close.
 *
 * A did-not-meet occurrence contributes no facts but still returns its key, so
 * a meeting later corrected to did-not-meet has its old attendees cleaned up.
 */
export function factsFromAttendanceRows(byEventId: Map<string, LinkRow[]>): {
  facts: AttendanceFact[];
  occurrenceKeys: Array<{ ccbEventId: string; occurrenceDate: string }>;
} {
  const facts: AttendanceFact[] = [];
  const keys = new Map<string, { ccbEventId: string; occurrenceDate: string }>();

  for (const rows of Array.from(byEventId.values())) {
    for (const row of rows) {
      const ccbEventId = String(row.attendance?.eventId || row.eventId || '').trim();
      const occurrenceDate = String(row.occurDate || '').slice(0, 10);
      if (!ccbEventId || !occurrenceDate) continue;

      keys.set(`${ccbEventId}|${occurrenceDate}`, { ccbEventId, occurrenceDate });

      for (const attendee of row.attendance?.attendees ?? []) {
        const ccbIndividualId = String(attendee?.id ?? '').trim();
        if (!ccbIndividualId) continue;
        const status = String(attendee?.status ?? '').trim();
        facts.push({
          ccbEventId,
          occurrenceDate,
          ccbIndividualId,
          attendeeName: String(attendee?.name ?? '').trim(),
          ccbStatus: status || null,
        });
      }
    }
  }

  return { facts, occurrenceKeys: Array.from(keys.values()) };
}

export type RecordFactsResult = {
  occurrences: number;
  facts: number;
  written: number;
  error?: string;
};

// PostgREST caps a single request payload well below this, and a 12-week
// church-wide pull is comfortably tens of thousands of rows.
const UPSERT_CHUNK = 500;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Persist a batch of facts.
 *
 * `occurrenceKeys` must list every (event, occurrence) the payload covered —
 * including ones that turned out to have no attendees, since "this meeting
 * happened and nobody was named" is a real correction to a meeting that
 * previously had names. Anything NOT in that list is left alone.
 */
export async function recordAttendanceFacts(
  supabase: Supabase,
  facts: AttendanceFact[],
  occurrenceKeys: Array<{ ccbEventId: string; occurrenceDate: string }>
): Promise<RecordFactsResult> {
  const result: RecordFactsResult = {
    occurrences: occurrenceKeys.length,
    facts: facts.length,
    written: 0,
  };
  if (occurrenceKeys.length === 0) return result;

  const now = new Date().toISOString();
  const factsByOccurrence = new Map<string, AttendanceFact[]>();
  for (const fact of facts) {
    const key = `${fact.ccbEventId}|${fact.occurrenceDate}`;
    const bucket = factsByOccurrence.get(key);
    if (bucket) bucket.push(fact);
    else factsByOccurrence.set(key, [fact]);
  }

  // Upsert first, delete second. In that order a run that dies partway has
  // added rows but removed none — recoverable. The other order can leave a
  // meeting emptied.
  const rows = facts.map((f) => ({
    ccb_event_id: f.ccbEventId,
    occurrence_date: f.occurrenceDate,
    ccb_individual_id: f.ccbIndividualId,
    attendee_name: f.attendeeName || null,
    ccb_status: f.ccbStatus,
    last_seen_at: now,
  }));

  for (const batch of chunk(rows, UPSERT_CHUNK)) {
    const { error } = await supabase
      .from('ccb_attendance_facts')
      .upsert(batch, { onConflict: 'ccb_event_id,occurrence_date,ccb_individual_id' });
    if (error) {
      result.error = error.message;
      console.error('[attendance-facts] upsert failed:', error.message);
      return result;
    }
    result.written += batch.length;
  }

  // Drop anyone CCB no longer lists on an occurrence it DID report. Scoped to
  // one occurrence at a time so the delete can never widen past what we saw.
  for (const key of occurrenceKeys) {
    const seen = factsByOccurrence.get(`${key.ccbEventId}|${key.occurrenceDate}`) ?? [];
    const keepIds = seen.map((f) => f.ccbIndividualId);

    let query = supabase
      .from('ccb_attendance_facts')
      .delete()
      .eq('ccb_event_id', key.ccbEventId)
      .eq('occurrence_date', key.occurrenceDate);

    if (keepIds.length > 0) {
      query = query.not('ccb_individual_id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`);
    }

    const { error } = await query;
    if (error) {
      console.warn(
        `[attendance-facts] stale cleanup failed for ${key.ccbEventId} on ${key.occurrenceDate}:`,
        error.message
      );
    }
  }

  return result;
}

/**
 * Union event -> group pairs into the map. Never removes one: an id we stop
 * seeing is an id whose event has aged off a 12-week calendar, not an id that
 * became wrong, and forgetting it is what made old meetings unattributable.
 *
 * A pair already in the map keeps its original group. If an event genuinely
 * moves between groups in CCB, that needs a deliberate correction rather than
 * a silent flip driven by whichever job ran last.
 */
export async function recordEventGroupMap(
  supabase: Supabase,
  pairs: Array<{ ccbEventId: string; ccbGroupId: string }>,
  source = 'calendar'
): Promise<{ written: number; error?: string }> {
  const deduped = new Map<string, string>();
  for (const pair of pairs) {
    const eventId = String(pair.ccbEventId ?? '').trim();
    const groupId = String(pair.ccbGroupId ?? '').trim();
    if (eventId && groupId && !deduped.has(eventId)) deduped.set(eventId, groupId);
  }
  if (deduped.size === 0) return { written: 0 };

  const rows = Array.from(deduped, ([ccb_event_id, ccb_group_id]) => ({
    ccb_event_id,
    ccb_group_id,
    source,
  }));

  let written = 0;
  for (const batch of chunk(rows, UPSERT_CHUNK)) {
    const { error } = await supabase
      .from('ccb_event_group_map')
      .upsert(batch, { onConflict: 'ccb_event_id', ignoreDuplicates: true });
    if (error) {
      console.warn('[attendance-facts] event/group map write failed:', error.message);
      return { written, error: error.message };
    }
    written += batch.length;
  }
  return { written };
}
