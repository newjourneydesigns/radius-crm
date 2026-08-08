/**
 * Circle calendar sync — snapshots a circle's CCB group calendar (v2
 * GET /groups/{id}/calendar) into circle_calendar_occurrences and derives the
 * day/time/frequency scalars on circle_leaders from the actual occurrence
 * dates. CCB is the source of truth; RADIUS stops guessing cadence.
 *
 * Sync is MANUAL by design (import, per-circle Resync Calendar, admin bulk
 * backfill) — there is no refresh cron. Normally one CCB call per circle per
 * sync; when CCB rejects the full ~14-month window with HTTP 412, the client
 * bisects into narrower sub-range calls until CCB accepts.
 *
 * Dates and times from CCB are the church's own wall clock and are stored
 * verbatim; Luxon is used only for window math in America/Chicago.
 */

import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../server-supabase';
import type { CCBv2Client, GroupCalendarOccurrenceV2 } from './ccb-v2-client';

type SupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

const APP_ZONE = 'America/Chicago';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface CalendarSyncWindow {
  start: string; // YYYY-MM-DD
  end: string;
  today: string;
}

/**
 * 8 weeks back (covers the tracker's recent weeks and overdue math — deeper
 * history stays on the event_summary_snapshots cadence overlay) through
 * 12 months forward (a year of runway between manual resyncs).
 */
export function calendarSyncWindow(now: DateTime = DateTime.now().setZone(APP_ZONE)): CalendarSyncWindow {
  return {
    start: now.minus({ weeks: 8 }).toISODate()!,
    end: now.plus({ months: 12 }).toISODate()!,
    today: now.toISODate()!,
  };
}

/**
 * A group calendar can carry several event series (the circle meeting plus
 * socials/one-offs). The schedule-driving series is the one with the most
 * future occurrences; ties break on total count, then smallest event id, so
 * the pick is deterministic across syncs.
 */
export function pickDominantEventId(occurrences: GroupCalendarOccurrenceV2[], todayISO: string): string | null {
  const byEvent = new Map<string, { future: number; total: number }>();
  for (const occ of occurrences) {
    const entry = byEvent.get(occ.eventId) ?? { future: 0, total: 0 };
    entry.total += 1;
    if (occ.occurrenceDate >= todayISO) entry.future += 1;
    byEvent.set(occ.eventId, entry);
  }
  let winner: string | null = null;
  let best = { future: -1, total: -1 };
  for (const [eventId, counts] of Array.from(byEvent.entries())) {
    if (
      counts.future > best.future ||
      (counts.future === best.future && counts.total > best.total) ||
      (counts.future === best.future && counts.total === best.total &&
        winner !== null && compareEventIds(eventId, winner) < 0)
    ) {
      winner = eventId;
      best = counts;
    }
  }
  return winner;
}

function compareEventIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

export interface DerivedSchedule {
  day: string | null;
  time: string | null; // "HH:mm" (24h canonical, matches normalizeTimeValue)
  frequency: string | null;
  meetingStartDate: string | null; // bi-weekly parity anchor
}

function parseIsoDate(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

function weekdayName(dateStr: string): string | null {
  const d = parseIsoDate(dateStr);
  return d ? DAY_NAMES[d.getUTCDay()] : null;
}

function dayDiff(a: string, b: string): number {
  const da = parseIsoDate(a);
  const db = parseIsoDate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** Week-of-month, same semantics as lib/meetingFrequency.ts ("1st Tuesday" = day 1-7). */
function weekOfMonth(dateStr: string): number {
  const d = parseIsoDate(dateStr);
  return d ? Math.floor((d.getUTCDate() - 1) / 7) + 1 : 0;
}

/**
 * Derive the human schedule from the dominant series' occurrence dates.
 * Produces the canonical frequency strings the rest of the app already knows
 * ('Weekly', 'Bi-weekly', '1st, 3rd', '1st, 3rd, 5th', '2nd, 4th', 'Monthly',
 * 'Quarterly' — see lib/frequencyUtils.ts) or 'Custom' when no pattern fits.
 */
export function deriveScheduleFromOccurrences(
  dates: string[],
  timesByDate: Record<string, string | null>,
  todayISO: string,
): DerivedSchedule {
  const all = Array.from(new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort();
  if (all.length === 0) return { day: null, time: null, frequency: null, meetingStartDate: null };

  // Modal weekday; tie → the weekday of the most recent date.
  const byWeekday = new Map<string, string[]>();
  for (const d of all) {
    const wd = weekdayName(d);
    if (!wd) continue;
    byWeekday.set(wd, [...(byWeekday.get(wd) ?? []), d]);
  }
  let day: string | null = null;
  let onDay: string[] = [];
  for (const [wd, wdDates] of Array.from(byWeekday.entries())) {
    if (
      wdDates.length > onDay.length ||
      (wdDates.length === onDay.length && wdDates[wdDates.length - 1] > (onDay[onDay.length - 1] ?? ''))
    ) {
      day = wd;
      onDay = wdDates;
    }
  }
  const consistency = onDay.length / all.length;

  // Time: most frequent wall-clock time among upcoming on-day dates (fallback: all on-day).
  const timePool = onDay.filter((d) => d >= todayISO);
  const timeCounts = new Map<string, number>();
  for (const d of (timePool.length > 0 ? timePool : onDay)) {
    const t = timesByDate[d];
    if (t) timeCounts.set(t, (timeCounts.get(t) ?? 0) + 1);
  }
  let time: string | null = null;
  for (const [t, count] of Array.from(timeCounts.entries())) {
    if (time === null || count > (timeCounts.get(time) ?? 0) || (count === timeCounts.get(time) && t < time)) {
      time = t;
    }
  }

  // Meetings hopping weekdays → a real but irregular schedule: label it Custom
  // (the snapshot's actual dates drive scheduling; this string is display-only).
  if (all.length >= 3 && consistency < 0.6) {
    return { day, time, frequency: 'Custom', meetingStartDate: null };
  }
  // Never derive a cadence from a single on-day date.
  if (onDay.length < 2) return { day, time, frequency: null, meetingStartDate: null };

  const gaps: number[] = [];
  for (let i = 1; i < onDay.length; i++) gaps.push(dayDiff(onDay[i - 1], onDay[i]));
  const minGap = Math.min(...gaps);
  const weeklyShare = gaps.filter((g) => g === 7).length / gaps.length;

  let frequency: string;
  let meetingStartDate: string | null = null;

  // Weekly = 7-day gaps dominate; long holiday breaks don't disqualify.
  const isWeekly = minGap === 7 && weeklyShare >= 0.6;
  // Bi-weekly keeps 14-day parity across month boundaries; "1st, 3rd" breaks it
  // in every 5-week month, so with a 12-month window the two are unambiguous.
  const isBiWeekly = !isWeekly &&
    minGap >= 14 &&
    onDay.every((d) => dayDiff(onDay[0], d) % 14 === 0);
  const nthSet = new Set(onDay.map(weekOfMonth));

  if (isWeekly) {
    frequency = 'Weekly';
  } else if (isBiWeekly) {
    frequency = 'Bi-weekly';
    meetingStartDate = onDay.find((d) => d >= todayISO) ?? onDay[onDay.length - 1];
  } else if (!nthSet.has(2) && !nthSet.has(4) && nthSet.has(1) && nthSet.has(3)) {
    frequency = nthSet.has(5) ? '1st, 3rd, 5th' : '1st, 3rd';
  } else if (nthSet.size === 2 && nthSet.has(2) && nthSet.has(4)) {
    frequency = '2nd, 4th';
  } else if (nthSet.size === 1 && gaps.every((g) => g >= 26 && g <= 36)) {
    frequency = 'Monthly';
  } else if (gaps.every((g) => g >= 76 && g <= 104)) {
    frequency = 'Quarterly';
  } else {
    frequency = 'Custom';
  }

  return { day, time, frequency, meetingStartDate };
}

export interface CalendarSyncResult {
  status: 'ok' | 'no_events' | 'error';
  error?: string;
  occurrenceCount: number;
  futureCount: number;
  dominantEventId: string | null;
  dominantEventName: string | null;
  derived: DerivedSchedule;
}

const EMPTY_DERIVED: DerivedSchedule = { day: null, time: null, frequency: null, meetingStartDate: null };

/**
 * Fetch the group's calendar and replace this circle's snapshot with it.
 * On success (occurrences found) the derived schedule is written onto
 * circle_leaders and schedule_source flips to 'ccb_calendar'; when the
 * calendar has no events the leader's fields are left untouched and
 * schedule_source reverts to 'manual' so hand-editing stays available.
 * A fetch error never destroys an existing good snapshot.
 */
export async function syncCircleCalendar(
  supabase: SupabaseClient,
  ccb: CCBv2Client,
  leader: { id: number; ccb_group_id: string },
): Promise<CalendarSyncResult> {
  const window = calendarSyncWindow();
  const groupId = String(leader.ccb_group_id);
  const nowIso = new Date().toISOString();

  let fetched: Awaited<ReturnType<CCBv2Client['getGroupCalendar']>>;
  try {
    fetched = await ccb.getGroupCalendar(groupId, window.start, window.end);
  } catch (error: any) {
    const message = (error?.message || 'CCB calendar fetch failed').slice(0, 500);
    await upsertSyncState(supabase, leader.id, groupId, window, nowIso, {
      status: 'error', error: message,
    });
    return {
      status: 'error', error: message, occurrenceCount: 0, futureCount: 0,
      dominantEventId: null, dominantEventName: null, derived: EMPTY_DERIVED,
    };
  }

  if (fetched.rawCount > 0 && fetched.parsedCount === 0) {
    // Payload came back non-empty but nothing normalized — treat as an error,
    // not an empty calendar, so we never destroy a good snapshot on a shape drift.
    const message = 'unrecognized calendar payload shape';
    await upsertSyncState(supabase, leader.id, groupId, window, nowIso, {
      status: 'error', error: message,
    });
    return {
      status: 'error', error: message, occurrenceCount: 0, futureCount: 0,
      dominantEventId: null, dominantEventName: null, derived: EMPTY_DERIVED,
    };
  }

  // Dedupe on (eventId, occurrenceDate); prefer the row that carries a time.
  const byKey = new Map<string, GroupCalendarOccurrenceV2>();
  for (const occ of fetched.occurrences) {
    const key = `${occ.eventId}|${occ.occurrenceDate}`;
    const existing = byKey.get(key);
    if (!existing || (!existing.startTime && occ.startTime)) byKey.set(key, occ);
  }
  const occurrences = Array.from(byKey.values());
  const dominantEventId = pickDominantEventId(occurrences, window.today);
  const dominantRows = occurrences.filter((o) => o.eventId === dominantEventId);
  const dominantEventName = dominantRows.find((o) => o.eventName)?.eventName ?? null;

  // Replace wholesale: occurrences deleted in CCB must disappear here too.
  // The table's invariant is "current CCB calendar state" — history lives in
  // event_summary_snapshots / circle_meeting_occurrences.
  const { error: deleteError } = await supabase
    .from('circle_calendar_occurrences')
    .delete()
    .eq('leader_id', leader.id);
  if (deleteError) {
    const message = `snapshot write failed: ${deleteError.message}`.slice(0, 500);
    await upsertSyncState(supabase, leader.id, groupId, window, nowIso, { status: 'error', error: message });
    return {
      status: 'error', error: message, occurrenceCount: 0, futureCount: 0,
      dominantEventId, dominantEventName, derived: EMPTY_DERIVED,
    };
  }

  if (occurrences.length > 0) {
    const rows = occurrences.map((occ) => ({
      leader_id: leader.id,
      ccb_group_id: groupId,
      ccb_event_id: occ.eventId,
      event_name: occ.eventName,
      occurrence_date: occ.occurrenceDate,
      start_time: occ.startTime,
      starts_at: occ.start,
      ends_at: occ.end,
      is_dominant: occ.eventId === dominantEventId,
      synced_at: nowIso,
    }));
    const { error: insertError } = await supabase.from('circle_calendar_occurrences').insert(rows);
    if (insertError) {
      const message = `snapshot write failed: ${insertError.message}`.slice(0, 500);
      await upsertSyncState(supabase, leader.id, groupId, window, nowIso, { status: 'error', error: message });
      return {
        status: 'error', error: message, occurrenceCount: 0, futureCount: 0,
        dominantEventId, dominantEventName, derived: EMPTY_DERIVED,
      };
    }
  }

  const dominantDates = dominantRows.map((o) => o.occurrenceDate);
  const timesByDate: Record<string, string | null> = {};
  for (const o of dominantRows) timesByDate[o.occurrenceDate] = o.startTime;
  const derived = occurrences.length > 0
    ? deriveScheduleFromOccurrences(dominantDates, timesByDate, window.today)
    : EMPTY_DERIVED;
  const futureCount = dominantDates.filter((d) => d >= window.today).length;
  const sortedDominant = [...dominantDates].sort();

  if (occurrences.length > 0) {
    // CCB owns the schedule now. Only non-null derived values are written so a
    // sparse calendar never blanks hand-entered data.
    const updates: Record<string, any> = { schedule_source: 'ccb_calendar' };
    if (derived.day) updates.day = derived.day;
    if (derived.time) updates.time = derived.time;
    if (derived.frequency) updates.frequency = derived.frequency;
    if (derived.frequency === 'Bi-weekly' && derived.meetingStartDate) {
      updates.meeting_start_date = derived.meetingStartDate;
    }
    const { data: leaderRow } = await supabase
      .from('circle_leaders')
      .select('ccb_event_ids')
      .eq('id', leader.id)
      .maybeSingle();
    const eventIds = new Set<string>((leaderRow?.ccb_event_ids as string[] | null) ?? []);
    for (const occ of occurrences) eventIds.add(occ.eventId);
    updates.ccb_event_ids = Array.from(eventIds);
    await supabase.from('circle_leaders').update(updates).eq('id', leader.id);
  } else {
    // No calendar events: unlock manual editing (that IS the safety net) but
    // keep the last known day/time/frequency for legacy fallback scheduling.
    await supabase
      .from('circle_leaders')
      .update({ schedule_source: 'manual' })
      .eq('id', leader.id);
  }

  const seriesSummary: Record<string, { name: string | null; count: number; future: number }> = {};
  for (const occ of occurrences) {
    const entry = seriesSummary[occ.eventId] ?? { name: occ.eventName, count: 0, future: 0 };
    entry.count += 1;
    if (occ.occurrenceDate >= window.today) entry.future += 1;
    if (!entry.name && occ.eventName) entry.name = occ.eventName;
    seriesSummary[occ.eventId] = entry;
  }

  const status: CalendarSyncResult['status'] = occurrences.length > 0 ? 'ok' : 'no_events';
  await upsertSyncState(supabase, leader.id, groupId, window, nowIso, {
    status,
    error: null,
    occurrence_count: occurrences.length,
    future_count: futureCount,
    first_occurrence_date: sortedDominant[0] ?? null,
    last_occurrence_date: sortedDominant[sortedDominant.length - 1] ?? null,
    dominant_event_id: dominantEventId,
    dominant_event_name: dominantEventName,
    derived_day: derived.day,
    derived_time: derived.time,
    derived_frequency: derived.frequency,
    derived_meeting_start_date: derived.meetingStartDate,
    last_sync_summary: {
      series: Object.entries(seriesSummary).map(([event_id, s]) => ({ event_id, ...s })),
    },
  });

  return {
    status,
    occurrenceCount: occurrences.length,
    futureCount,
    dominantEventId,
    dominantEventName,
    derived,
  };
}

async function upsertSyncState(
  supabase: SupabaseClient,
  leaderId: number,
  groupId: string,
  window: CalendarSyncWindow,
  nowIso: string,
  fields: Record<string, any>,
): Promise<void> {
  const { error } = await supabase.from('circle_calendar_sync_state').upsert(
    {
      leader_id: leaderId,
      ccb_group_id: groupId,
      last_synced_at: nowIso,
      window_start: window.start,
      window_end: window.end,
      ...fields,
    },
    { onConflict: 'leader_id' },
  );
  if (error) console.error('❌ circle_calendar_sync_state upsert failed:', error.message);
}
