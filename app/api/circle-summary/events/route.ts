/**
 * GET /api/circle-summary/events
 *
 * Returns the current leader's circle events for the last 8 weeks, each tagged
 * with whether a summary has already been submitted (so the UI can show
 * "needs submission" vs "submitted").
 *
 * Sources:
 *   - CCB: group iCal for event occurrences + bulk attendance_profiles for status
 *   - Supabase: circle_event_summaries audit log
 */

import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-summary/session';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

// In-memory TTL cache for CCB calls. The same (groupId, start, end) tuple is
// requested repeatedly as leaders bounce between the events list and a detail
// page, so caching avoids 1–3s round trips to CCB on every hit.
// Process-local; serverless cold starts will repopulate on first request.
// Calendar entries are cached longer than attendance because the calendar
// itself rarely changes mid-week, while attendance/notes get edited often.
// Clients can force a hard bypass with `?refresh=1` (used after a submit and
// on manual refresh).
type CacheEntry<T> = { value: T; expiresAt: number };
const CCB_CAL_TTL_MS = 5 * 60_000;        // 5 minutes
const CCB_ATTENDANCE_TTL_MS = 60_000;     // 1 minute
const ccbCalCache = new Map<string, CacheEntry<any[]>>();
const ccbAttendanceCache = new Map<string, CacheEntry<any>>();

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

export async function GET(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  if (!leader.ccb_group_id) {
    return NextResponse.json({
      leader,
      events: [],
      message: 'No CCB group is linked to your profile yet. Please contact your ACPD.',
    });
  }

  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get('refresh') === '1';

  const end = DateTime.now().setZone('America/Chicago');
  const start = end.minus({ weeks: 8 });
  const startStr = start.toFormat('yyyy-LL-dd');
  const endStr = end.toFormat('yyyy-LL-dd');
  const cacheKey = `${leader.ccb_group_id}|${startStr}|${endStr}`;
  if (forceRefresh) {
    ccbCalCache.delete(cacheKey);
    ccbAttendanceCache.delete(cacheKey);
  }

  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'list_events' })
  );

  const supabase = createServiceSupabaseClient();

  let events: Array<{
    eventId: string;
    occurrenceDate: string;
    occurrenceDateTime: string;
    title: string;
    hasExistingAttendance: boolean;
    didNotMeet: boolean;
  }> = [];
  let submissions: any[] | null = null;

  try {
    // Three-tier cache: in-memory (per instance) → Supabase ccb_group_events_cache
    // (shared across all instances, populated by the daily bulk sync) → CCB.
    // The bulk sync runs once a day; 24h freshness gives the cache one full
    // cycle before falling back to a live CCB pull. Post-submit invalidation
    // (?refresh=1) still forces CCB.
    const SHARED_CACHE_FRESH_MS = 24 * 60 * 60_000;

    const calCached = cacheGet(ccbCalCache, cacheKey);
    const attCached = cacheGet(ccbAttendanceCache, cacheKey);

    // Only consult shared cache when in-memory misses AND the client didn't
    // ask for a forced refresh (post-submit invalidation must hit CCB).
    let sharedCache: { calendar_events: any[]; attendance_xml: any } | null = null;
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
        if (ageMs < SHARED_CACHE_FRESH_MS) {
          sharedCache = {
            calendar_events: Array.isArray(cacheRow.calendar_events) ? cacheRow.calendar_events : [],
            attendance_xml: cacheRow.attendance_xml ?? null,
          };
        }
      }
    }

    const [calEvents, bulkXml, submissionsRes] = await Promise.all([
      calCached
        ? Promise.resolve(calCached)
        : sharedCache
        ? Promise.resolve(sharedCache.calendar_events).then((v) => {
            cacheSet(ccbCalCache, cacheKey, v, CCB_CAL_TTL_MS);
            return v;
          })
        : ccb
            .getGroupCalendarEvents(String(leader.ccb_group_id), startStr, endStr)
            .then((v) => {
              cacheSet(ccbCalCache, cacheKey, v, CCB_CAL_TTL_MS);
              return v;
            }),
      attCached !== undefined
        ? Promise.resolve(attCached)
        : sharedCache
        ? Promise.resolve(sharedCache.attendance_xml).then((v) => {
            cacheSet(ccbAttendanceCache, cacheKey, v, CCB_ATTENDANCE_TTL_MS);
            return v;
          })
        : (ccb as any)
            .getXml({ srv: 'attendance_profiles', start_date: startStr, end_date: endStr })
            .then((v: any) => {
              cacheSet(ccbAttendanceCache, cacheKey, v, CCB_ATTENDANCE_TTL_MS);
              return v;
            })
            .catch(() => null),
      supabase
        .from('circle_event_summaries')
        .select('ccb_event_id, occurrence, status, did_not_meet, submitted_via, created_at')
        .eq('leader_id', leader.id)
        .gte('occurrence', start.toISO()!),
    ]);

    submissions = submissionsRes.data ?? [];

    // Build a lookup map: "eventId|YYYY-MM-DD" → { has, dnm }
    const textVal = (v: any) =>
      v == null ? '' : typeof v === 'string' ? v : String(v?.['#text'] ?? '');

    const attendanceMap = new Map<string, { has: boolean; dnm: boolean }>();
    if (bulkXml) {
      const eventsRoot = bulkXml?.ccb_api?.response?.events ?? null;
      const rawEvents: any[] = Array.isArray(eventsRoot?.event)
        ? eventsRoot.event
        : eventsRoot?.event
        ? [eventsRoot.event]
        : [];

      for (const ev of rawEvents) {
        const evId = String(ev?.['@_id'] ?? ev?.id ?? '').trim();
        const occurrence = String(ev?.['@_occurrence'] ?? ev?.occurrence ?? '').trim();
        if (!evId || !occurrence) continue;

        const occurDate = occurrence.slice(0, 10); // "YYYY-MM-DD"
        const has =
          !!textVal(ev?.notes) ||
          !!textVal(ev?.topic) ||
          Number(ev?.head_count) > 0 ||
          !!(ev?.attendees?.attendee &&
            (Array.isArray(ev.attendees.attendee) ? ev.attendees.attendee.length : 1));
        const dnm = String(ev?.did_not_meet ?? '').toLowerCase() === 'true';

        attendanceMap.set(`${evId}|${occurDate}`, { has, dnm });
      }
    }

    events = calEvents.map((e) => {
      const att = attendanceMap.get(`${e.eventId}|${e.startDate}`);
      return {
        eventId: e.eventId,
        occurrenceDate: e.startDate,
        occurrenceDateTime: e.startDateTime,
        title: e.title,
        hasExistingAttendance: att?.has ?? false,
        didNotMeet: att?.dnm ?? false,
      };
    });
  } catch (e: any) {
    console.error('CCB fetch failed for circle-summary events:', e);
    return NextResponse.json({ leader, events: [], error: 'Could not load events from CCB.' });
  }

  const submittedSet = new Map<string, any>();
  for (const s of submissions || []) {
    const key = `${s.ccb_event_id}|${DateTime.fromISO(s.occurrence as any).toFormat('yyyy-LL-dd')}`;
    submittedSet.set(key, s);
  }

  const enriched = events
    .map((e) => {
      const key = `${e.eventId}|${e.occurrenceDate}`;
      const sub = submittedSet.get(key);
      return {
        ...e,
        submittedAt: sub?.created_at ?? null,
        submittedStatus: sub?.status ?? null,
      };
    })
    .sort((a, b) => (a.occurrenceDate < b.occurrenceDate ? 1 : -1));

  return NextResponse.json({ leader, events: enriched });
}
