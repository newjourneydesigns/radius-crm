/**
 * Calendar lookup for the reminder crons, served from the shared
 * `ccb_group_events_cache` table instead of live CCB.
 *
 * Why this exists: the email and push reminder crons fire every 5–15 minutes
 * and used to make a fresh, uncached `getGroupCalendarEvents` (CCB
 * `group_profile_from_id`) call for EVERY enabled leader on EVERY tick. With a
 * few dozen enabled leaders that is thousands of CCB calls a day for data that
 * barely changes — it was the dominant consumer that blew through CCB's 10,000
 * call/day quota (2026-06-08).
 *
 * The daily prewarm (`/api/circle-leader-toolkit/prewarm`) already refreshes
 * each meeting group's calendar into `ccb_group_events_cache.calendar_events`,
 * which is the exact shape `getGroupCalendarEvents` returns. The reminders only
 * need events that already started within the last hour or two, so reading the
 * freshest cached row per group is sufficient — and costs zero CCB calls.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Same shape as `CCBClient.getGroupCalendarEvents` returns. */
export type ReminderCalendarEvent = {
  eventId: string;
  title: string;
  startDateTime: string; // 'yyyy-LL-dd HH:mm:ss'
  startDate: string;     // 'yyyy-LL-dd'
  startTime?: string;
};

type CacheRow = {
  group_id: string | number;
  calendar_events: unknown;
  synced_at: string;
};

function coerceEvents(value: unknown): ReminderCalendarEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const e = raw as Record<string, unknown>;
      const eventId = e.eventId != null ? String(e.eventId) : '';
      const startDateTime = e.startDateTime != null ? String(e.startDateTime) : '';
      const startDate = e.startDate != null ? String(e.startDate) : '';
      if (!eventId || !startDateTime || !startDate) return null;
      return {
        eventId,
        title: e.title != null ? String(e.title) : '',
        startDateTime,
        startDate,
        startTime: e.startTime != null ? String(e.startTime) : undefined,
      } as ReminderCalendarEvent;
    })
    .filter((e): e is ReminderCalendarEvent => e !== null);
}

/**
 * Load cached calendar events for a set of CCB group IDs in ONE query.
 * Returns a map keyed by `String(group_id)` → events from that group's most
 * recently synced cache row. Groups with no cache row are simply absent from
 * the map (the caller skips them); the prewarm warms every meeting group daily,
 * so a missing row means there is nothing recent to remind about anyway.
 */
export async function loadCachedCalendarByGroup(
  supabase: SupabaseClient,
  groupIds: Array<string | number>
): Promise<Map<string, ReminderCalendarEvent[]>> {
  const byGroup = new Map<string, ReminderCalendarEvent[]>();
  const uniqueIds = Array.from(new Set(groupIds.map((id) => String(id)).filter(Boolean)));
  if (uniqueIds.length === 0) return byGroup;

  const { data, error } = await supabase
    .from('ccb_group_events_cache')
    .select('group_id, calendar_events, synced_at')
    .in('group_id', uniqueIds)
    .order('synced_at', { ascending: false });

  if (error) {
    console.warn('[reminder-calendar] cache read failed:', error.message);
    return byGroup;
  }

  // Rows arrive newest-first; keep only the first (freshest) row per group.
  for (const row of (data ?? []) as CacheRow[]) {
    const key = String(row.group_id);
    if (byGroup.has(key)) continue;
    byGroup.set(key, coerceEvents(row.calendar_events));
  }

  return byGroup;
}
