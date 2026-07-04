import { DateTime } from 'luxon';

/**
 * Canonical week helpers. RADIUS treats weeks as **Sunday-start**
 * (Sunday → Saturday) everywhere the event-summary domain is concerned —
 * `submit`, `leader-week-summary`, and `circle-reporting` all key weeks by the
 * Sunday that starts them. Use these so anything that reasons about "this week"
 * agrees with that convention instead of Luxon's ISO/Monday default.
 */

/** The Sunday that starts the week containing `dt`, at 00:00 in dt's zone. */
export function sundayWeekStart(dt: DateTime): DateTime {
  // Luxon weekday: 1=Mon..7=Sun. Sunday-start ⇒ subtract (weekday % 7) days
  // (Sun→0, Mon→1, … Sat→6).
  return dt.minus({ days: dt.weekday % 7 }).startOf('day');
}

/** The Saturday that ends the week containing `dt`, at 23:59:59.999. */
export function sundayWeekEnd(dt: DateTime): DateTime {
  return sundayWeekStart(dt).plus({ days: 6 }).endOf('day');
}

/**
 * Stable per-week dedup key — the Sunday date as `YYYY-MM-DD`. Replaces
 * Luxon ISO-week keys (`kkkk-'W'WW`), which start on Monday.
 */
export function sundayWeekKey(dt: DateTime): string {
  return sundayWeekStart(dt).toISODate() ?? '';
}
