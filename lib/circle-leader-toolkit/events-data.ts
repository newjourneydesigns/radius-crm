/**
 * Shared data loaders for the Circle Summary events tab.
 *
 * Both the API route (`/api/circle-leader-toolkit/events`, used for client-side
 * background revalidation) and the server-rendered events page call these, so
 * the three-tier cache logic lives in exactly one place.
 *
 * Sources:
 *   - CCB: group iCal for event occurrences + bulk attendance_profiles for status
 *   - Supabase: ccb_group_events_cache (shared cache) + circle_event_summaries
 */

import { DateTime } from 'luxon';
import type { SessionLeader } from './session';
import { createCCBClient } from '../ccb/ccb-client';
import { createServiceSupabaseClient } from '../server-supabase';
import { computeLastAttended, storeDerivedLastAttended } from './roster-data';
import { createTimer } from './timing';
import { isDidNotMeetEvent } from './did-not-meet-reasons';
import { doesMeetingFrequencyIncludeDate } from '../meetingFrequency';

export type CircleEventRow = {
  eventId: string;
  occurrenceDate: string;
  occurrenceDateTime: string;
  title: string;
  hasExistingAttendance: boolean;
  didNotMeet: boolean;
  headCount: number | null;
  submittedAt: string | null;
  submittedStatus: 'submitted' | 'failed' | 'retrying' | null;
};

export type CircleMessage = {
  id: string;
  header: string;
  body_html: string;
  url: string | null;
  url_label: string | null;
};

export type LoadEventsResult = {
  events: CircleEventRow[];
  error?: string;
  message?: string;
  /**
   * Set when CCB attendance couldn't be fetched live (e.g. CCB's daily quota
   * was reached). `'stale'` means we fell back to cached attendance, so status
   * is still accurate; `'unavailable'` means we have no attendance to show, so
   * already-reported summaries may render as "Pending" until CCB recovers.
   */
  ccbAttendanceDegraded?: 'stale' | 'unavailable';
};

// In-memory TTL cache for CCB calls. The same (groupId, start, end) tuple is
// requested repeatedly as leaders bounce between the events list and a detail
// page, so caching avoids 1–3s round trips to CCB on every hit.
// Process-local; serverless cold starts will repopulate on first request.
// Calendar entries are cached longer than attendance because the calendar
// itself rarely changes mid-week, while attendance/notes get edited often.
// Callers can force a hard bypass with `forceRefresh` (used after a submit and
// on manual refresh).
type CacheEntry<T> = { value: T; expiresAt: number };
type CalendarEvent = {
  eventId: string;
  title: string;
  startDateTime: string;
  startDate: string;
  startTime?: string;
  /**
   * Cadence of the CCB series this occurrence was expanded from, in days
   * between occurrences — see `GroupCalendarOccurrence` in the CCB client.
   * `null` = one-off or individually moved date. `undefined` = row written
   * before this field existed; `isLegacyCalendarShape` refetches those, so
   * this is defensive only.
   */
  seriesGapDays?: number | null;
};
type SubmittedSummaryRow = {
  ccb_event_id: string;
  occurrence: string;
  status: string;
  did_not_meet: boolean;
  submitted_via: string | null;
  created_at: string;
};
type IgnoredEventRow = {
  ccb_event_id: string;
  occurrence_date: string;
};
type MessageRow = {
  id: string;
  header: string;
  body_html: string;
  url: string | null;
  url_label: string | null;
  campus_filter: unknown;
};
const CCB_CAL_TTL_MS = 5 * 60_000; // 5 minutes
const CCB_ATTENDANCE_TTL_MS = 60_000; // 1 minute
const ccbCalCache = new Map<string, CacheEntry<CalendarEvent[]>>();
const ccbAttendanceCache = new Map<string, CacheEntry<unknown>>();

// CCB's `attendance_profiles` is a GLOBAL, date-windowed service — it takes no
// group id and returns every group's attendance for the window (see the note at
// ccb-client.ts: "Index by event @_id (NOT group ID — attendance_profiles
// doesn't include group)"). So the payload is identical for every leader, and
// the cache key must be the WINDOW ALONE. Keying it per group (as the calendar
// legitimately is) made each group re-fetch the same multi-megabyte blob, so a
// warm instance serving N leaders paid for N identical CCB calls. Sharing the
// entry costs nothing in freshness — same window, same bytes.
function attendanceCacheKey(startStr: string, endStr: string) {
  return `${startStr}|${endStr}`;
}

// Single-flight: leaders open the toolkit in bursts (right after a reminder
// goes out), and without this every concurrent request on an instance starts
// its own copy of that same global fetch. Callers that arrive while one is in
// flight await the same promise instead.
const ccbAttendanceInFlight = new Map<string, Promise<unknown>>();

function fetchAttendanceOnce(
  ccb: ReturnType<typeof createCCBClient>,
  startStr: string,
  endStr: string,
  { bypassInFlight = false }: { bypassInFlight?: boolean } = {}
): Promise<unknown> {
  const key = attendanceCacheKey(startStr, endStr);
  // A forced refresh (post-submit) must not join a request that started BEFORE
  // the submit reached CCB — it would come back without the summary the leader
  // just filed and show it as still pending. Those pay for their own call.
  const existing = bypassInFlight ? undefined : ccbAttendanceInFlight.get(key);
  if (existing) return existing;

  const request = ccb
    .getXml<unknown>({ srv: 'attendance_profiles', start_date: startStr, end_date: endStr })
    .finally(() => {
      // Only clear the slot if it's still ours — a bypassing refresh may have
      // replaced it in the meantime.
      if (ccbAttendanceInFlight.get(key) === request) ccbAttendanceInFlight.delete(key);
    });

  // A bypassing refresh still publishes its (fresher) request for others to
  // join, replacing the older in-flight one.
  ccbAttendanceInFlight.set(key, request);
  return request;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value
      .map(asRecord)
      .filter((item): item is Record<string, unknown> => item !== null);
  }
  const single = asRecord(value);
  return single ? [single] : [];
}

function textVal(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return String(asRecord(value)?.['#text'] ?? '');
}

function isMissingIgnoredEventsTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybe = err as { code?: string; message?: string; details?: string };
  const text = `${maybe.code || ''} ${maybe.message || ''} ${maybe.details || ''}`.toLowerCase();
  return (
    text.includes('circle_summary_ignored_events') ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('could not find')
  );
}

/**
 * Parse a bulk `attendance_profiles` XML blob into a lookup map:
 * "eventId|YYYY-MM-DD" → { has, dnm, headCount }.
 */
function buildAttendanceMap(
  bulkXml: unknown
): Map<string, { has: boolean; dnm: boolean; headCount: number | null }> {
  const attendanceMap = new Map<string, { has: boolean; dnm: boolean; headCount: number | null }>();
  if (!bulkXml) return attendanceMap;

  const ccbRoot = asRecord(bulkXml)?.ccb_api;
  const response = asRecord(asRecord(ccbRoot)?.response);
  const eventsRoot = asRecord(response?.events);
  const rawEvents = recordList(eventsRoot?.event);

  for (const ev of rawEvents) {
    const evId = String(ev?.['@_id'] ?? ev?.id ?? '').trim();
    const occurrence = String(ev?.['@_occurrence'] ?? ev?.occurrence ?? '').trim();
    if (!evId || !occurrence) continue;

    const occurDate = occurrence.slice(0, 10); // "YYYY-MM-DD"
    const notes = textVal(ev?.notes);
    const dnm = isDidNotMeetEvent({ didNotMeet: ev?.did_not_meet, notes });
    // Prefer the explicit head_count; fall back to counting attendee rows.
    const rawHeadCount = Number(textVal(ev?.head_count));
    const attendees = asRecord(ev.attendees);
    const attendeeNode = attendees?.attendee;
    const attendeeCount = attendeeNode
      ? Array.isArray(attendeeNode)
        ? attendeeNode.length
        : 1
      : 0;
    const headCount = rawHeadCount > 0 ? rawHeadCount : attendeeCount > 0 ? attendeeCount : null;
    const has =
      dnm ||
      !!notes ||
      !!textVal(ev?.topic) ||
      (headCount ?? 0) > 0 ||
      attendeeCount > 0;

    attendanceMap.set(`${evId}|${occurDate}`, { has, dnm, headCount });
  }

  return attendanceMap;
}

/**
 * Whether the RADIUS-side meeting-frequency filter is allowed to hide this
 * occurrence. That filter exists for ONE case: CCB lists the circle on a
 * dense (weekly-or-tighter) recurring event but the circle actually meets
 * less often, so the off-week dates are noise. When the CCB calendar itself
 * is already bi-weekly-or-sparser — or the date is a one-off / individually
 * moved occurrence — the calendar reflects deliberate scheduling and must
 * win over RADIUS's `frequency`/`meeting_start_date`, which can carry a
 * stale anchor (e.g. a bi-weekly circle whose real schedule shifted a week:
 * the stale anchor would hide every REAL meeting and pass every off week).
 *
 * `undefined` means a pre-field cache row (≤24h old): keep filtering, as the
 * legacy behavior did, until the row is rewritten.
 */
function isCadenceFilterable(event: Pick<CalendarEvent, 'seriesGapDays'>): boolean {
  if (event.seriesGapDays === null) return false;
  if (event.seriesGapDays === undefined) return true;
  return event.seriesGapDays < 14;
}

/**
 * Cache rows written before the parser learned about rescheduled occurrences
 * (marked by the absence of `seriesGapDays`) can carry ghost dates of moved or
 * replaced series, so a non-empty pre-field row is treated as a calendar miss
 * and refetched live once — the write-back upgrades the row for everyone.
 * Empty rows carry nothing wrong and are trusted as-is (refetching them every
 * request would burn a CCB call per view on event-less groups forever).
 */
function isLegacyCalendarShape(events: CalendarEvent[]): boolean {
  return events.length > 0 && events.some((e) => !('seriesGapDays' in e));
}

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    map.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Active Message Center messages for the leader's campus. */
export async function loadLeaderMessages(leader: SessionLeader): Promise<CircleMessage[]> {
  const supabase = createServiceSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('circle_summary_messages')
    .select('id, header, body_html, url, url_label, campus_filter, priority')
    .eq('audience', leader.leader_type === 'host_team' ? 'host_team' : 'circle')
    .or(`start_date.is.null,start_date.lte.${today}`)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[circle-summary] loadLeaderMessages failed:', error.message);
    return [];
  }

  const leaderCampus = leader.campus || null;
  return ((data || []) as MessageRow[])
    .filter((m) => {
      const filter = Array.isArray(m.campus_filter)
        ? m.campus_filter.filter((value): value is string => typeof value === 'string')
        : [];
      if (filter.length === 0) return true;
      return leaderCampus ? filter.includes(leaderCampus) : false;
    })
    .map((m) => ({
      id: m.id,
      header: m.header,
      body_html: m.body_html,
      url: m.url ?? null,
      url_label: m.url_label ?? null,
    }));
}

/**
 * The leader's circle events for the last 12 weeks, each tagged with whether a
 * summary has already been submitted. Returns an empty list (with `error`) on
 * CCB failure rather than throwing, so the UI can degrade gracefully.
 */
export async function loadLeaderEvents(
  leader: SessionLeader,
  opts: { forceRefresh?: boolean; allowStaleAttendance?: boolean } = {}
): Promise<LoadEventsResult> {
  if (!leader.ccb_group_id) {
    return {
      events: [],
      message: 'No CCB group is linked to your profile yet. Please contact your ACPD.',
    };
  }

  const forceRefresh = !!opts.forceRefresh;
  // Callers that only need a count (the alert badge) opt out of the live CCB
  // attendance call: any cached attendance is accepted regardless of age and
  // CCB is never contacted for it. Locally-submitted summaries are still read
  // live from Supabase, so a leader's own submissions clear immediately — the
  // only thing that can lag is a summary entered directly in CCB.
  const allowStaleAttendance = !!opts.allowStaleAttendance;
  const timer = createTimer('loadLeaderEvents');

  const end = DateTime.now().setZone('America/Chicago');
  const start = end.minus({ weeks: 12 });
  const startStr = start.toFormat('yyyy-LL-dd');
  const endStr = end.toFormat('yyyy-LL-dd');
  // The calendar IS per group; the attendance payload is not (see
  // attendanceCacheKey). Two keys, two scopes.
  const cacheKey = `${leader.ccb_group_id}|${startStr}|${endStr}`;
  const attKey = attendanceCacheKey(startStr, endStr);
  if (forceRefresh) {
    ccbCalCache.delete(cacheKey);
    ccbAttendanceCache.delete(attKey);
  }

  const ccb = createCCBClient({ module: 'circle-summary', action: 'list_events' });
  const supabase = createServiceSupabaseClient();

  let events: Array<{
    eventId: string;
    occurrenceDate: string;
    occurrenceDateTime: string;
    title: string;
    hasExistingAttendance: boolean;
    didNotMeet: boolean;
    headCount: number | null;
  }> = [];
  let submissions: SubmittedSummaryRow[] = [];
  let ignoredEvents: IgnoredEventRow[] = [];
  // Tracks whether the live CCB attendance call failed (vs. simply returned no
  // rows) so we can fall back to cached attendance instead of silently showing
  // every reported summary as "Pending".
  let attendanceFetchFailed = false;
  let ccbAttendanceDegraded: 'stale' | 'unavailable' | null = null;

  try {
    // Three-tier cache: in-memory (per instance) → Supabase ccb_group_events_cache
    // (shared across all instances, populated by the daily bulk sync) → CCB.
    // Calendar data is stable enough to share for a day. Attendance is not:
    // leaders can submit in CCB after the daily prewarm, and this page must
    // reflect that quickly because CCB is the source of truth for received
    // status.
    const SHARED_CAL_CACHE_FRESH_MS = 24 * 60 * 60_000;
    const SHARED_ATTENDANCE_CACHE_FRESH_MS = 5 * 60_000;

    const calCached = cacheGet(ccbCalCache, cacheKey);
    const attCached = cacheGet(ccbAttendanceCache, attKey);

    // Only consult shared cache when in-memory misses AND the caller didn't
    // ask for a forced refresh (post-submit invalidation must hit CCB).
    let sharedCache: { calendar_events?: CalendarEvent[]; attendance_xml?: unknown } | null = null;
    // Whether the shared row's attendance met the normal freshness bar. The
    // stale-attendance path accepts older data, but it must not seed the
    // process-wide in-memory cache with it — the events page reads that same
    // cache and is entitled to attendance no older than the window above.
    let sharedAttendanceIsFresh = false;
    if (!forceRefresh && (calCached === undefined || attCached === undefined)) {
      const { data: cacheRow } = await supabase
        .from('ccb_group_events_cache')
        .select('calendar_events, attendance_xml, synced_at')
        .eq('group_id', String(leader.ccb_group_id))
        .eq('start_date', startStr)
        .eq('end_date', endStr)
        .maybeSingle();

      if (cacheRow?.synced_at) {
        const ageMs = Date.now() - new Date(cacheRow.synced_at).getTime();
        sharedCache = {};
        if (ageMs < SHARED_CAL_CACHE_FRESH_MS) {
          const cachedCalendar = Array.isArray(cacheRow.calendar_events)
            ? (cacheRow.calendar_events as CalendarEvent[])
            : [];
          if (!isLegacyCalendarShape(cachedCalendar)) {
            sharedCache.calendar_events = cachedCalendar;
          }
        }
        if (
          (allowStaleAttendance || ageMs < SHARED_ATTENDANCE_CACHE_FRESH_MS) &&
          cacheRow.attendance_xml
        ) {
          sharedCache.attendance_xml = cacheRow.attendance_xml;
          sharedAttendanceIsFresh = ageMs < SHARED_ATTENDANCE_CACHE_FRESH_MS;
        }
      }
    }
    timer.mark('sharedCacheRead');

    // Track whether either fetch went all the way to CCB so we can write the
    // result back to the shared cache. Closes the gap where prewarm skipped a
    // group: today's first request hits CCB, but the second is served from cache.
    let calFromCcb = false;
    let attFromCcb = false;

    const [calEvents, bulkXml, submissionsRes, ignoredRes] = await Promise.all([
      calCached
        ? Promise.resolve(calCached)
        : sharedCache?.calendar_events !== undefined
        ? Promise.resolve(sharedCache.calendar_events).then((v) => {
            cacheSet(ccbCalCache, cacheKey, v, CCB_CAL_TTL_MS);
            return v;
          })
        : ccb
            .getGroupCalendarEvents(String(leader.ccb_group_id), startStr, endStr)
            .then((v) => {
              calFromCcb = true;
              cacheSet(ccbCalCache, cacheKey, v, CCB_CAL_TTL_MS);
              return v;
            }),
      attCached !== undefined
        ? Promise.resolve(attCached)
        : sharedCache?.attendance_xml !== undefined
        ? Promise.resolve(sharedCache.attendance_xml).then((v) => {
            if (sharedAttendanceIsFresh) {
              cacheSet(ccbAttendanceCache, attKey, v, CCB_ATTENDANCE_TTL_MS);
            }
            return v;
          })
        : allowStaleAttendance
        ? // Nothing cached for this exact window. Don't reach for CCB — fall
          // through to the any-age lookup below instead.
          Promise.resolve(null)
        : fetchAttendanceOnce(ccb, startStr, endStr, { bypassInFlight: forceRefresh })
            .then((v) => {
              attFromCcb = true;
              cacheSet(ccbAttendanceCache, attKey, v, CCB_ATTENDANCE_TTL_MS);
              return v;
            })
            .catch((e) => {
              attendanceFetchFailed = true;
              console.warn(
                '[circle-summary/events] attendance fetch failed:',
                e instanceof Error ? e.message : e
              );
              return null;
            }),
      supabase
        .from('circle_event_summaries')
        .select('ccb_event_id, occurrence, status, did_not_meet, submitted_via, created_at')
        .eq('leader_id', leader.id)
        .gte('occurrence', start.toISO()!),
      supabase
        .from('circle_summary_ignored_events')
        .select('ccb_event_id, occurrence_date')
        .eq('leader_id', leader.id)
        .gte('occurrence_date', startStr)
        .lte('occurrence_date', endStr),
    ]);
    timer.mark('fetch');

    const calSource = calCached !== undefined ? 'mem' : sharedCache?.calendar_events !== undefined ? 'shared' : 'ccb';
    const attSource = attCached !== undefined ? 'mem' : sharedCache?.attendance_xml !== undefined ? 'shared' : allowStaleAttendance ? 'skipped' : attendanceFetchFailed ? 'failed' : 'ccb';
    timer.end({ groupId: String(leader.ccb_group_id), calSource, attSource, calFromCcb, attFromCcb });

    if (ignoredRes.error) {
      if (!isMissingIgnoredEventsTableError(ignoredRes.error)) {
        console.warn('[circle-summary/events] ignored events lookup failed:', ignoredRes.error.message);
      }
    } else {
      ignoredEvents = (ignoredRes.data ?? []) as IgnoredEventRow[];
    }

    // Fire-and-forget write-back: when we just paid for a CCB call AND we have
    // both pieces (calendar + attendance), persist the row so every other
    // route/page (notably roster/attendance) sees the fresh data without
    // re-hitting CCB. Skip if attendance is missing — we don't want to clobber
    // a potentially-good existing row with null. Not awaited — the response
    // can ship while the upsert lands.
    // Never write back on the stale-attendance path: `bulkXml` there may be
    // attendance of any age, and stamping it with a fresh `synced_at` would
    // make it look current to the events page's 5-minute freshness check.
    if (!allowStaleAttendance && (calFromCcb || attFromCcb) && bulkXml != null && Array.isArray(calEvents)) {
      const groupId = String(leader.ccb_group_id);
      supabase
        .from('ccb_group_events_cache')
        .upsert(
          {
            group_id: groupId,
            start_date: startStr,
            end_date: endStr,
            calendar_events: calEvents,
            attendance_xml: bulkXml,
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'group_id,start_date,end_date' }
        )
        .then(({ error }) => {
          if (error) {
            console.warn('[circle-summary/events] cache write-back failed:', error.message);
            return;
          }
          // Prime the roster page's Tier 3 fast path with the derived per-group
          // map. Separate, column-error-tolerant write so it can never break the
          // core cache row above.
          storeDerivedLastAttended(
            supabase,
            groupId,
            startStr,
            endStr,
            computeLastAttended(bulkXml, groupId, calEvents)
          );
        });
    }

    submissions = (submissionsRes.data ?? []) as SubmittedSummaryRow[];

    // If the live attendance call failed (e.g. CCB daily quota reached), fall
    // back to the most recent cached attendance for this group — even if it's
    // older than the normal freshness window. Showing slightly stale "received"
    // status beats flipping every already-reported summary to "Pending".
    // Also covers the deliberate skip above: when no attendance is cached for
    // this exact 12-week window, take the group's most recent cached
    // attendance at any age rather than paying for a live CCB call.
    let bulkXmlResolved = bulkXml;
    if (bulkXmlResolved == null && (attendanceFetchFailed || allowStaleAttendance)) {
      const { data: fallbackRow } = await supabase
        .from('ccb_group_events_cache')
        .select('attendance_xml')
        .eq('group_id', String(leader.ccb_group_id))
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallbackRow?.attendance_xml) {
        bulkXmlResolved = fallbackRow.attendance_xml;
        ccbAttendanceDegraded = 'stale';
      } else {
        ccbAttendanceDegraded = 'unavailable';
      }
    }

    const attendanceMap = buildAttendanceMap(bulkXmlResolved);

    const ignoredSet = new Set(
      ignoredEvents.map((row) => `${row.ccb_event_id}|${String(row.occurrence_date).slice(0, 10)}`)
    );

    // Keys of events the leader already submitted a summary for here. Used
    // below to keep off-cadence meetings visible even if CCB attendance is
    // temporarily unavailable.
    const submittedKeys = new Set(
      submissions
        .filter((s) => s.status === 'submitted')
        .map((s) => `${s.ccb_event_id}|${DateTime.fromISO(s.occurrence).toFormat('yyyy-LL-dd')}`)
    );

    events = calEvents
      .filter((e) => !ignoredSet.has(`${e.eventId}|${e.startDate}`))
      .filter((e) => {
        // The frequency filter exists to hide blank non-meeting dates (e.g. the
        // off weeks of a bi-weekly circle listed weekly in CCB), not meetings
        // that actually happened. If CCB has attendance for the occurrence —
        // or a summary was submitted here — the circle demonstrably met, so
        // always show it. And when the CCB calendar itself already carries the
        // real cadence (sparse series, one-off, or moved occurrence), it is
        // authoritative — never let a stale RADIUS anchor hide it.
        const key = `${e.eventId}|${e.startDate}`;
        if (attendanceMap.get(key)?.has || submittedKeys.has(key)) return true;
        if (!isCadenceFilterable(e)) return true;
        return doesMeetingFrequencyIncludeDate({
          date: e.startDate,
          frequency: leader.frequency,
          meetingStartDate: leader.meeting_start_date,
        });
      })
      .map((e) => {
        const att = attendanceMap.get(`${e.eventId}|${e.startDate}`);
        return {
          eventId: e.eventId,
          occurrenceDate: e.startDate,
          occurrenceDateTime: e.startDateTime,
          title: e.title,
          hasExistingAttendance: att?.has ?? false,
          didNotMeet: att?.dnm ?? false,
          headCount: att?.headCount ?? null,
        };
      });
  } catch (e: unknown) {
    console.error('CCB fetch failed for circle-summary events:', e);
    return { events: [], error: 'Could not load events from CCB.' };
  }

  const submittedSet = new Map<string, SubmittedSummaryRow>();
  for (const s of submissions) {
    const key = `${s.ccb_event_id}|${DateTime.fromISO(s.occurrence).toFormat('yyyy-LL-dd')}`;
    submittedSet.set(key, s);
  }

  const enriched: CircleEventRow[] = events
    .map((e) => {
      const key = `${e.eventId}|${e.occurrenceDate}`;
      const sub = submittedSet.get(key);
      const localSubmitted = sub?.status === 'submitted';
      const localDidNotMeet = localSubmitted && sub?.did_not_meet === true;
      return {
        ...e,
        didNotMeet: localDidNotMeet || e.didNotMeet,
        submittedAt: localSubmitted ? sub.created_at : null,
        submittedStatus: (sub?.status ?? null) as CircleEventRow['submittedStatus'],
      };
    })
    .sort((a, b) => (a.occurrenceDate < b.occurrenceDate ? 1 : -1));

  return {
    events: enriched,
    ...(ccbAttendanceDegraded ? { ccbAttendanceDegraded } : {}),
  };
}

/**
 * The leader's 12-week calendar, straight from the same three-tier cache
 * `loadLeaderEvents` uses (in-memory → shared Supabase row → CCB) but without
 * the attendance half.
 */
async function loadLeaderCalendar(leader: SessionLeader): Promise<CalendarEvent[]> {
  const end = DateTime.now().setZone('America/Chicago');
  const start = end.minus({ weeks: 12 });
  const startStr = start.toFormat('yyyy-LL-dd');
  const endStr = end.toFormat('yyyy-LL-dd');
  const cacheKey = `${leader.ccb_group_id}|${startStr}|${endStr}`;

  const cached = cacheGet(ccbCalCache, cacheKey);
  if (cached) return cached;

  const supabase = createServiceSupabaseClient();
  const { data: cacheRow } = await supabase
    .from('ccb_group_events_cache')
    .select('calendar_events, synced_at')
    .eq('group_id', String(leader.ccb_group_id))
    .eq('start_date', startStr)
    .eq('end_date', endStr)
    .maybeSingle();

  if (
    cacheRow?.synced_at &&
    Date.now() - new Date(cacheRow.synced_at).getTime() < 24 * 60 * 60_000 &&
    Array.isArray(cacheRow.calendar_events)
  ) {
    const events = cacheRow.calendar_events as CalendarEvent[];
    if (!isLegacyCalendarShape(events)) {
      cacheSet(ccbCalCache, cacheKey, events, CCB_CAL_TTL_MS);
      return events;
    }
  }

  const ccb = createCCBClient({ module: 'circle-summary', action: 'list_events' });
  const events = await ccb.getGroupCalendarEvents(String(leader.ccb_group_id), startStr, endStr);
  cacheSet(ccbCalCache, cacheKey, events, CCB_CAL_TTL_MS);
  return events;
}

/**
 * Ownership guard for the submit / draft endpoints. `eventId` and `occurrence`
 * arrive from the request body, so without this check a signed-in leader could
 * pass another Circle's eventId and read that Circle's attendance, rewrite its
 * summary, or inflate its head count (create_event_attendance replaces notes,
 * merges attendees by individual ID, and *adds* head counts). Validates against
 * the same cached 12-week calendar the leader's own events list is built from.
 *
 * Membership in that list is decided by the calendar, the ignored-events
 * table, and the meeting-frequency filter — all checked here. An off-cadence
 * occurrence that the circle actually held (CCB attendance exists, or a
 * summary was submitted here) is shown in the list despite failing the
 * frequency filter, so the same exemption applies here — but only via cached
 * attendance / local submissions, never a live CCB `attendance_profiles` call,
 * which would put multi-second latency in front of every summary submission.
 * The cadence-matching common case still never loads attendance at all.
 *
 * Fails closed: if the event isn't on the leader's calendar — or the calendar
 * can't be loaded — ownership is denied.
 */
export async function leaderOwnsEvent(
  leader: SessionLeader,
  eventId: string | undefined | null,
  occurrence: string | undefined | null
): Promise<boolean> {
  if (!eventId || !occurrence) return false;
  if (!leader.ccb_group_id) return false;
  const occurrenceDate = String(occurrence).slice(0, 10);

  try {
    const supabase = createServiceSupabaseClient();
    const [calEvents, ignoredRes] = await Promise.all([
      loadLeaderCalendar(leader),
      supabase
        .from('circle_summary_ignored_events')
        .select('ccb_event_id, occurrence_date')
        .eq('leader_id', leader.id)
        .eq('ccb_event_id', String(eventId)),
    ]);

    const calendarEvent = calEvents.find(
      (e) => String(e.eventId) === String(eventId) && e.startDate === occurrenceDate
    );
    if (!calendarEvent) return false;

    if (!ignoredRes.error) {
      const isIgnored = (ignoredRes.data ?? []).some(
        (row: IgnoredEventRow) => String(row.occurrence_date).slice(0, 10) === occurrenceDate
      );
      if (isIgnored) return false;
    } else if (!isMissingIgnoredEventsTableError(ignoredRes.error)) {
      console.warn('[circle-summary/events] ownership ignored-events lookup failed:', ignoredRes.error.message);
    }

    // Same cadence rule as the events list: a sparse/one-off/moved CCB date is
    // shown unconditionally there, so it must be submittable here too.
    if (!isCadenceFilterable(calendarEvent)) return true;

    if (
      doesMeetingFrequencyIncludeDate({
        date: occurrenceDate,
        frequency: leader.frequency,
        meetingStartDate: leader.meeting_start_date,
      })
    ) {
      return true;
    }

    // Off-cadence date: allow it anyway if the circle demonstrably met — same
    // exemption the events list applies. Calendar ownership is already proven
    // above, so attendance here only answers "did this meeting happen".
    return await eventHasEvidenceOfMeeting(supabase, leader, String(eventId), occurrenceDate);
  } catch (e: unknown) {
    console.error('[circle-summary/events] ownership check failed:', e);
    return false;
  }
}

/**
 * Whether an occurrence on the leader's calendar actually happened: a summary
 * submitted through the toolkit, or CCB attendance from cache (in-memory →
 * most recent shared row at any age). Deliberately never calls CCB live — this
 * sits in the submit path, and by the time an off-cadence event is visible to
 * submit against, its attendance has already been cached by the events list.
 */
async function eventHasEvidenceOfMeeting(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  leader: SessionLeader,
  eventId: string,
  occurrenceDate: string
): Promise<boolean> {
  const key = `${eventId}|${occurrenceDate}`;

  const { data: submittedRows } = await supabase
    .from('circle_event_summaries')
    .select('occurrence')
    .eq('leader_id', leader.id)
    .eq('ccb_event_id', eventId)
    .eq('status', 'submitted');
  const hasLocalSubmission = (submittedRows ?? []).some(
    (row: { occurrence: string }) =>
      DateTime.fromISO(row.occurrence).toFormat('yyyy-LL-dd') === occurrenceDate
  );
  if (hasLocalSubmission) return true;

  const end = DateTime.now().setZone('America/Chicago');
  const start = end.minus({ weeks: 12 });
  const memHit = cacheGet(
    ccbAttendanceCache,
    attendanceCacheKey(start.toFormat('yyyy-LL-dd'), end.toFormat('yyyy-LL-dd'))
  );
  if (memHit !== undefined) {
    return buildAttendanceMap(memHit).get(key)?.has ?? false;
  }

  const { data: cacheRow } = await supabase
    .from('ccb_group_events_cache')
    .select('attendance_xml')
    .eq('group_id', String(leader.ccb_group_id))
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cacheRow?.attendance_xml) {
    return buildAttendanceMap(cacheRow.attendance_xml).get(key)?.has ?? false;
  }

  return false;
}
