/**
 * Reads per-person "last attended" out of ccb_attendance_facts.
 *
 * This is the source the roster should have been using all along: CCB's own
 * record, keyed on CCB's own identifiers, kept forever, and never deleted
 * because some job failed to see it. See the migration
 * (20260904120000_ccb_attendance_facts.sql) for the full reasoning.
 *
 * Two things it deliberately does differently from the loader it replaces:
 *
 *  1. No 12-week horizon. The old path derived last-attended from a rolling
 *     12-week payload, so a member who had been away four months showed no
 *     date at all — which is exactly when a leader most needs one. The facts
 *     table keeps everything, so the answer is "March 14", not silence.
 *
 *  2. Attribution by the accumulating event -> group map rather than by
 *     whatever calendar happens to be cached. An event that has aged off the
 *     calendar still resolves.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type Supabase = SupabaseClient<any, any, any>;

// The event ids a group has ever been seen to own. Small (a circle has one or
// two recurring events), so this stays a cheap indexed lookup.
async function eventIdsForGroup(supabase: Supabase, groupId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('ccb_event_group_map')
    .select('ccb_event_id')
    .eq('ccb_group_id', groupId);

  if (error) {
    console.warn('[attendance-facts] event/group lookup failed:', error.message);
    return [];
  }
  return (data ?? []).map((row: { ccb_event_id: string }) => String(row.ccb_event_id));
}

/**
 * `{ ccb_individual_id -> latest YYYY-MM-DD attended }` for one group.
 *
 * Returns null when the group has no mapped events or the table has nothing
 * for them — the caller must fall back rather than render an empty roster as
 * "nobody has ever attended". An empty map is only a real answer once we know
 * the group's events, and we cannot tell those cases apart from here.
 */
export async function loadLastAttendedFromFacts(
  supabase: Supabase,
  groupId: string
): Promise<Record<string, string> | null> {
  const eventIds = await eventIdsForGroup(supabase, groupId);
  if (eventIds.length === 0) return null;

  const { data, error } = await supabase
    .from('ccb_attendance_facts')
    .select('ccb_individual_id, occurrence_date, ccb_status')
    .in('ccb_event_id', eventIds)
    .order('occurrence_date', { ascending: false });

  if (error) {
    console.warn('[attendance-facts] fact read failed:', error.message);
    return null;
  }

  const rows = (data ?? []) as Array<{
    ccb_individual_id: string;
    occurrence_date: string;
    ccb_status: string | null;
  }>;
  if (rows.length === 0) return null;

  const lastAttended: Record<string, string> = {};
  for (const row of rows) {
    // CCB does not currently report a status at all — every attendee entry is
    // someone who was there. Honour one if it ever appears rather than
    // silently counting an absence as attendance.
    const status = String(row.ccb_status ?? '').toLowerCase();
    if (status === 'absent' || status === 'no') continue;

    const id = String(row.ccb_individual_id ?? '').trim();
    const date = String(row.occurrence_date ?? '').slice(0, 10);
    if (!id || !date) continue;
    if (!lastAttended[id] || date > lastAttended[id]) lastAttended[id] = date;
  }

  return Object.keys(lastAttended).length > 0 ? lastAttended : null;
}
