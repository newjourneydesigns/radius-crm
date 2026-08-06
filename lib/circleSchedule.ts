/**
 * Shared circle scheduling — the single answer to "when does this circle meet".
 *
 * Source of truth is the CCB calendar snapshot (circle_calendar_occurrences,
 * written by lib/ccb/circle-calendar-sync.ts). When a leader's snapshot covers
 * the requested range, the actual occurrence dates win; outside its coverage
 * (never synced, or past the runway end) scheduling falls back to the legacy
 * day/time/frequency fields via doesMeetingFrequencyIncludeDate — which is the
 * safety net and also the rollout mechanism: with no snapshot rows, behavior
 * is exactly what it was before this feature shipped.
 *
 * Isomorphic: pure functions plus a loader that accepts any Supabase client
 * (service client in API routes, the anon client in browser components — the
 * tables are readable by authenticated users under RLS).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { doesMeetingFrequencyIncludeDate } from './meetingFrequency';

export interface CalendarOccurrenceLite {
  leader_id: number;
  ccb_event_id: string;
  occurrence_date: string; // YYYY-MM-DD
  start_time: string | null; // "HH:mm"
  is_dominant: boolean;
}

export interface CalendarSyncStateLite {
  leader_id: number;
  window_start: string;
  last_occurrence_date: string | null;
  future_count: number;
  last_synced_at: string;
  status: string;
}

export interface ScheduleLeaderFields {
  id: number;
  day?: string | null;
  time?: string | null;
  frequency?: string | null;
  meeting_start_date?: string | null;
}

export interface LeaderScheduleContext {
  leader: ScheduleLeaderFields;
  /** Dominant-series occurrences only. May be range-bounded by the loader —
   *  callers must not query outside the bounds they loaded with. */
  occurrences: CalendarOccurrenceLite[];
  syncState?: CalendarSyncStateLite | null;
}

export type ScheduleHealthState = 'manual' | 'ok' | 'low' | 'none' | 'error';

const DAY_MS = 86_400_000;

function parseIsoDate(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr ?? '');
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(dateStr: string, days: number): string {
  const d = parseIsoDate(dateStr);
  if (!d) return dateStr;
  return toIsoDate(new Date(d.getTime() + days * DAY_MS));
}

/** Assemble contexts from already-fetched rows (used by client components that
 *  run their own Supabase queries). */
export function buildScheduleContexts(
  leaders: ScheduleLeaderFields[],
  occurrences: CalendarOccurrenceLite[],
  syncStates: CalendarSyncStateLite[],
): Map<number, LeaderScheduleContext> {
  const map = new Map<number, LeaderScheduleContext>();
  for (const leader of leaders) map.set(leader.id, { leader, occurrences: [], syncState: null });
  for (const occ of occurrences) {
    if (!occ.is_dominant) continue;
    map.get(occ.leader_id)?.occurrences.push(occ);
  }
  for (const state of syncStates) {
    const ctx = map.get(state.leader_id);
    if (ctx) ctx.syncState = state;
  }
  return map;
}

/** The date span the snapshot authoritatively describes. End is the runway end
 *  (last dominant occurrence), NOT the sync window end: past the runway we must
 *  fall back to legacy fields rather than silently report "no meetings". */
function coverageSpan(ctx: LeaderScheduleContext): { start: string; end: string } | null {
  const state = ctx.syncState;
  if (state?.last_occurrence_date) {
    return { start: state.window_start, end: state.last_occurrence_date };
  }
  if (ctx.occurrences.length > 0) {
    const dates = ctx.occurrences.map((o) => o.occurrence_date).sort();
    return { start: dates[0], end: dates[dates.length - 1] };
  }
  return null;
}

export function snapshotCovers(ctx: LeaderScheduleContext, startDate: string, endDate: string): boolean {
  const span = coverageSpan(ctx);
  if (!span) return false;
  return startDate <= span.end && endDate >= span.start;
}

/**
 * Scheduled meeting dates for the leader in [startDate, endDate] (inclusive).
 * Snapshot-covered ranges return the real CCB occurrence dates (so an off-week
 * of a bi-weekly circle is correctly empty); uncovered ranges use the legacy
 * frequency math.
 */
export function scheduledDatesInRange(
  ctx: LeaderScheduleContext,
  startDate: string,
  endDate: string,
): { dates: string[]; source: 'snapshot' | 'legacy' } {
  if (snapshotCovers(ctx, startDate, endDate)) {
    const dates = Array.from(new Set(
      ctx.occurrences
        .filter((o) => o.occurrence_date >= startDate && o.occurrence_date <= endDate)
        .map((o) => o.occurrence_date),
    )).sort();
    return { dates, source: 'snapshot' };
  }

  const { leader } = ctx;
  if (!leader.day) return { dates: [], source: 'legacy' };
  const dates: string[] = [];
  let cursor = startDate.slice(0, 10);
  const end = endDate.slice(0, 10);
  // 1,100-day guard: well past any range the app asks for (a semester is ~200).
  for (let i = 0; cursor <= end && i < 1100; i++) {
    if (
      doesMeetingFrequencyIncludeDate({
        date: cursor,
        frequency: leader.frequency,
        meetingStartDate: leader.meeting_start_date,
        meetingDay: leader.day,
      })
    ) {
      dates.push(cursor);
    }
    cursor = addDaysISO(cursor, 1);
  }
  return { dates, source: 'legacy' };
}

export function doesLeaderMeetOnDate(ctx: LeaderScheduleContext, date: string): boolean {
  return scheduledDatesInRange(ctx, date, date).dates.length > 0;
}

/** Wall-clock meeting time for a date: the snapshot occurrence's time when we
 *  have it, else the leader's stored time. */
export function meetingTimeForDate(ctx: LeaderScheduleContext, date: string): string | null {
  const occ = ctx.occurrences.find((o) => o.occurrence_date === date && o.start_time);
  return occ?.start_time ?? ctx.leader.time ?? null;
}

/**
 * Snapshot health, computed live against today (a stale future_count is never
 * trusted): 'manual' = never synced; 'none' = no upcoming dates (red — fix in
 * CCB, then resync); 'low' = runway ends within 14 days (amber); 'error' = the
 * last sync attempt failed.
 */
export function scheduleHealth(
  ctx: LeaderScheduleContext,
  todayISO: string,
): { state: ScheduleHealthState; runwayEnd: string | null; lastSyncedAt: string | null } {
  const state = ctx.syncState;
  if (!state) return { state: 'manual', runwayEnd: null, lastSyncedAt: null };
  const runwayEnd = state.last_occurrence_date;
  const base = { runwayEnd, lastSyncedAt: state.last_synced_at };
  if (state.status === 'error') return { state: 'error', ...base };
  if (!runwayEnd || runwayEnd < todayISO) return { state: 'none', ...base };
  if (runwayEnd < addDaysISO(todayISO, 14)) return { state: 'low', ...base };
  return { state: 'ok', ...base };
}

const LEADER_CHUNK = 100;
const PAGE_SIZE = 1000;

/**
 * Load schedule contexts for a set of leaders. Optional from/to bounds limit
 * the occurrence rows fetched — pass bounds that contain every range you will
 * query. Coverage detection stays correct with bounded fetches because it
 * reads the sync-state columns, not the fetched rows.
 */
export async function fetchScheduleContexts(
  db: SupabaseClient,
  leaders: ScheduleLeaderFields[],
  opts?: { from?: string; to?: string },
): Promise<Map<number, LeaderScheduleContext>> {
  const map = buildScheduleContexts(leaders, [], []);
  const ids = leaders.map((l) => l.id);

  for (let i = 0; i < ids.length; i += LEADER_CHUNK) {
    const chunk = ids.slice(i, i + LEADER_CHUNK);

    for (let offset = 0; ; offset += PAGE_SIZE) {
      let query = db
        .from('circle_calendar_occurrences')
        .select('leader_id, ccb_event_id, occurrence_date, start_time, is_dominant')
        .in('leader_id', chunk)
        .eq('is_dominant', true)
        .order('occurrence_date', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (opts?.from) query = query.gte('occurrence_date', opts.from);
      if (opts?.to) query = query.lte('occurrence_date', opts.to);
      const { data, error } = await query;
      if (error) {
        console.error('❌ fetchScheduleContexts occurrences query failed:', error.message);
        break;
      }
      for (const occ of (data ?? []) as CalendarOccurrenceLite[]) {
        map.get(occ.leader_id)?.occurrences.push(occ);
      }
      if (!data || data.length < PAGE_SIZE) break;
    }

    const { data: states, error: stateError } = await db
      .from('circle_calendar_sync_state')
      .select('leader_id, window_start, last_occurrence_date, future_count, last_synced_at, status')
      .in('leader_id', chunk);
    if (stateError) {
      console.error('❌ fetchScheduleContexts sync-state query failed:', stateError.message);
      continue;
    }
    for (const state of (states ?? []) as CalendarSyncStateLite[]) {
      const ctx = map.get(state.leader_id);
      if (ctx) ctx.syncState = state;
    }
  }

  return map;
}
