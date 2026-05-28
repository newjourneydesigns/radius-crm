/**
 * GET /api/circle-summary/roster/attendance
 * Returns the most recent attendance date per individual for the current
 * leader's CCB group, sourced from CCB attendance_profiles for the last
 * ~12 weeks. Used by the roster page to surface "last attended" and to flag
 * members who haven't shown up in the last 15 days.
 *
 * Reads from the shared `ccb_group_events_cache` table (same row the events
 * route and daily prewarm job populate). On miss, falls back to a live CCB
 * call. The 12-week window must match the events route so we share the row.
 */

import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { getSessionLeader, unauthorized } from '../../../../../lib/circle-summary/session';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

const LOOKBACK_WEEKS = 12;
// Match events route freshness: a cache row newer than this is trusted; older
// rows fall through to live CCB so we don't show stale "last attended" dates.
const SHARED_CACHE_FRESH_MS = 24 * 60 * 60_000;

function textVal(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const rec = v as Record<string, unknown>;
  return String(rec?.['#text'] ?? '');
}

type CalendarEvent = {
  eventId?: string | number | null;
  startDate?: string | null;
};

type SummaryAttendanceRow = {
  occurrence?: string | null;
  attendee_ccb_ids?: string[] | null;
};

function occurrenceDate(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  return (
    DateTime.fromISO(value, { zone: 'America/Chicago' }).toISODate()
    ?? DateTime.fromSQL(value, { zone: 'America/Chicago' }).toISODate()
    ?? value.slice(0, 10)
  );
}

function calendarEventKeySet(calendarEvents: unknown): Set<string> {
  const rows = Array.isArray(calendarEvents) ? (calendarEvents as CalendarEvent[]) : [];
  const keys = new Set<string>();

  for (const event of rows) {
    const eventId = String(event?.eventId ?? '').trim();
    const startDate = occurrenceDate(event?.startDate);
    if (eventId && startDate) {
      keys.add(`${eventId}|${startDate}`);
    }
  }

  return keys;
}

function eventBelongsToGroup(ev: Record<string, unknown>, groupId: string, calendarKeys: Set<string>): boolean {
  const eventId = String(ev?.['@_id'] ?? ev?.id ?? '').trim();
  const occurDate = occurrenceDate(ev?.['@_occurrence'] ?? ev?.occurrence);

  if (eventId && occurDate && calendarKeys.has(`${eventId}|${occurDate}`)) {
    return true;
  }

  if (calendarKeys.size > 0) return false;

  // Fallback for any older CCB payload shape that includes group metadata.
  const evGroup = ev?.group as Record<string, unknown> | undefined;
  const evGroupId = String(
    evGroup?.['@_id'] ?? evGroup?.id ?? ev?.group_id ?? ev?.['@_group_id'] ?? ''
  ).trim();
  return evGroupId === groupId;
}

function parseAttendanceXml(
  xml: unknown,
  groupId: string,
  calendarEvents: unknown
): Record<string, string> {
  const root = (xml as Record<string, Record<string, Record<string, unknown>>>)?.ccb_api
    ?.response?.events as { event?: unknown } | undefined;
  const rawEvents: Array<Record<string, unknown>> = Array.isArray(root?.event)
    ? (root!.event as Array<Record<string, unknown>>)
    : root?.event
    ? [root.event as Record<string, unknown>]
    : [];

  const calendarKeys = calendarEventKeySet(calendarEvents);
  const lastAttended: Record<string, string> = {};

  for (const ev of rawEvents) {
    if (!eventBelongsToGroup(ev, groupId, calendarKeys)) continue;

    const occurDate = occurrenceDate(ev?.['@_occurrence'] ?? ev?.occurrence);
    if (!occurDate) continue;

    const dnm = textVal(ev?.did_not_meet).toLowerCase() === 'true';
    if (dnm) continue;

    const attRoot = (ev?.attendees ?? ev?.attendee) as Record<string, unknown> | undefined;
    const list: Array<Record<string, unknown>> = Array.isArray(attRoot?.attendee)
      ? (attRoot!.attendee as Array<Record<string, unknown>>)
      : attRoot?.attendee
      ? [attRoot.attendee as Record<string, unknown>]
      : Array.isArray(attRoot)
      ? (attRoot as unknown as Array<Record<string, unknown>>)
      : [];

    for (const a of list) {
      const id = String(a?.['@_id'] ?? a?.id ?? '').trim();
      if (!id) continue;
      const status = textVal(a?.status).toLowerCase();
      if (status === 'absent' || status === 'no') continue;
      const existing = lastAttended[id];
      if (!existing || occurDate > existing) {
        lastAttended[id] = occurDate;
      }
    }
  }

  return lastAttended;
}

async function mergeSubmittedSummaryAttendance(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  leaderId: string | number,
  groupId: string,
  startStr: string,
  endStr: string,
  baseLastAttended: Record<string, string>
): Promise<Record<string, string>> {
  const merged = { ...baseLastAttended };
  const startIso = DateTime.fromISO(startStr, { zone: 'America/Chicago' }).startOf('day').toISO();
  const endIso = DateTime.fromISO(endStr, { zone: 'America/Chicago' }).endOf('day').toISO();
  if (!startIso || !endIso) return merged;

  const { data, error } = await supabase
    .from('circle_event_summaries')
    .select('occurrence, attendee_ccb_ids')
    .eq('leader_id', leaderId)
    .eq('ccb_group_id', groupId)
    .eq('status', 'submitted')
    .eq('did_not_meet', false)
    .gte('occurrence', startIso)
    .lte('occurrence', endIso);

  if (error) {
    console.warn('[roster/attendance] submitted-summary read failed:', error.message);
    return merged;
  }

  for (const row of (data || []) as SummaryAttendanceRow[]) {
    const attendedDate = occurrenceDate(row.occurrence);
    if (!attendedDate || !Array.isArray(row.attendee_ccb_ids)) continue;

    for (const rawId of row.attendee_ccb_ids) {
      const id = String(rawId ?? '').trim();
      if (!id) continue;
      const existing = merged[id];
      if (!existing || attendedDate > existing) {
        merged[id] = attendedDate;
      }
    }
  }

  return merged;
}

export async function GET(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  if (!leader.ccb_group_id) {
    return NextResponse.json({ lastAttended: {} });
  }

  const groupId = String(leader.ccb_group_id);
  const url = new URL(req.url);
  const requestedGroupId = url.searchParams.get('group_id')?.trim();
  if (requestedGroupId && requestedGroupId !== groupId) {
    return NextResponse.json({ lastAttended: {}, error: 'Group mismatch.' }, { status: 403 });
  }

  const end = DateTime.now().setZone('America/Chicago');
  const start = end.minus({ weeks: LOOKBACK_WEEKS });
  const startStr = start.toFormat('yyyy-LL-dd');
  const endStr = end.toFormat('yyyy-LL-dd');

  const supabase = createServiceSupabaseClient();

  // Try the shared cache first. The prewarm job populates this daily for every
  // active group and the events route also writes to it on live fetch, so most
  // hits will be served entirely from Supabase with zero CCB traffic.
  try {
    const { data: cacheRow } = await supabase
      .from('ccb_group_events_cache')
      .select('calendar_events, attendance_xml, synced_at')
      .eq('group_id', groupId)
      .eq('start_date', startStr)
      .eq('end_date', endStr)
      .maybeSingle();

    if (cacheRow?.attendance_xml && cacheRow.synced_at) {
      const ageMs = Date.now() - new Date(cacheRow.synced_at).getTime();
      if (ageMs < SHARED_CACHE_FRESH_MS) {
        const lastAttended = parseAttendanceXml(cacheRow.attendance_xml, groupId, cacheRow.calendar_events);
        const mergedLastAttended = await mergeSubmittedSummaryAttendance(
          supabase,
          leader.id,
          groupId,
          startStr,
          endStr,
          lastAttended
        );
        return NextResponse.json({ lastAttended: mergedLastAttended, source: 'cache' });
      }
    }
  } catch (e) {
    // Non-fatal — fall through to CCB.
    console.warn('[roster/attendance] cache read failed:', e);
  }

  // Cache miss or stale — go to CCB.
  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'roster_attendance' })
  );

  try {
    const [calendarEvents, xml] = await Promise.all([
      ccb.getGroupCalendarEvents(groupId, startStr, endStr),
      (ccb as unknown as {
        getXml: (p: Record<string, string>) => Promise<unknown>;
      }).getXml({ srv: 'attendance_profiles', start_date: startStr, end_date: endStr }),
    ]);

    const lastAttended = parseAttendanceXml(xml, groupId, calendarEvents);
    const mergedLastAttended = await mergeSubmittedSummaryAttendance(
      supabase,
      leader.id,
      groupId,
      startStr,
      endStr,
      lastAttended
    );
    return NextResponse.json({ lastAttended: mergedLastAttended, source: 'ccb' });
  } catch (e: unknown) {
    return NextResponse.json(
      { lastAttended: {}, error: e instanceof Error ? e.message : 'Failed to load attendance.' },
      { status: 500 }
    );
  }
}
