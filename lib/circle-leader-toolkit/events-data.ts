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

export type AttendanceStatus = { has: boolean; dnm: boolean; headCount: number | null };

/**
 * Parse a bulk `attendance_profiles` CCB response into a lookup map keyed by
 * "eventId|YYYY-MM-DD" → whether attendance exists, did-not-meet, head count.
 * Shared by the events loader and the nightly health-check cron (which reads
 * the same XML from `ccb_group_events_cache`).
 */
export function parseAttendanceMap(bulkXml: unknown): Map<string, AttendanceStatus> {
  const attendanceMap = new Map<string, AttendanceStatus>();
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
  opts: { forceRefresh?: boolean } = {}
): Promise<LoadEventsResult> {
  if (!leader.ccb_group_id) {
    return {
      events: [],
      message: 'No CCB group is linked to your profile yet. Please contact your ACPD.',
    };
  }

  const forceRefresh = !!opts.forceRefresh;
  const timer = createTimer('loadLeaderEvents');

  const end = DateTime.now().setZone('America/Chicago');
  const start = end.minus({ weeks: 12 });
  const startStr = start.toFormat('yyyy-LL-dd');
  const endStr = end.toFormat('yyyy-LL-dd');
  const cacheKey = `${leader.ccb_group_id}|${startStr}|${endStr}`;
  if (forceRefresh) {
    ccbCalCache.delete(cacheKey);
    ccbAttendanceCache.delete(cacheKey);
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
    const attCached = cacheGet(ccbAttendanceCache, cacheKey);

    // Only consult shared cache when in-memory misses AND the caller didn't
    // ask for a forced refresh (post-submit invalidation must hit CCB).
    let sharedCache: { calendar_events?: CalendarEvent[]; attendance_xml?: unknown } | null = null;
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
          sharedCache.calendar_events = Array.isArray(cacheRow.calendar_events)
            ? (cacheRow.calendar_events as CalendarEvent[])
            : [];
        }
        if (ageMs < SHARED_ATTENDANCE_CACHE_FRESH_MS && cacheRow.attendance_xml) {
          sharedCache.attendance_xml = cacheRow.attendance_xml;
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
            cacheSet(ccbAttendanceCache, cacheKey, v, CCB_ATTENDANCE_TTL_MS);
            return v;
          })
        : ccb
            .getXml<unknown>({ srv: 'attendance_profiles', start_date: startStr, end_date: endStr })
            .then((v) => {
              attFromCcb = true;
              cacheSet(ccbAttendanceCache, cacheKey, v, CCB_ATTENDANCE_TTL_MS);
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
    const attSource = attCached !== undefined ? 'mem' : sharedCache?.attendance_xml !== undefined ? 'shared' : attendanceFetchFailed ? 'failed' : 'ccb';
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
    if ((calFromCcb || attFromCcb) && bulkXml != null && Array.isArray(calEvents)) {
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
    let bulkXmlResolved = bulkXml;
    if (bulkXmlResolved == null && attendanceFetchFailed) {
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

    const attendanceMap = parseAttendanceMap(bulkXmlResolved);

    const ignoredSet = new Set(
      ignoredEvents.map((row) => `${row.ccb_event_id}|${String(row.occurrence_date).slice(0, 10)}`)
    );

    events = calEvents
      .filter((e) => !ignoredSet.has(`${e.eventId}|${e.startDate}`))
      .filter((e) =>
        doesMeetingFrequencyIncludeDate({
          date: e.startDate,
          frequency: leader.frequency,
          meetingStartDate: leader.meeting_start_date,
        })
      )
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
 * Ownership guard for the submit / draft endpoints. `eventId` and `occurrence`
 * arrive from the request body, so without this check a signed-in leader could
 * pass another Circle's eventId and read or overwrite that Circle's attendance
 * (CCB's create_event_attendance *overwrites*). Validates against the same
 * cached 12-week calendar the leader's own events list is built from.
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
  const occurrenceDate = String(occurrence).slice(0, 10);
  const { events } = await loadLeaderEvents(leader);
  return events.some(
    (e) => String(e.eventId) === String(eventId) && e.occurrenceDate === occurrenceDate
  );
}
