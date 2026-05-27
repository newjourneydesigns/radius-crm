/**
 * GET /api/circle-summary/roster/attendance
 * Returns the most recent attendance date per individual for the current
 * leader's CCB group, sourced from CCB attendance_profiles for the last
 * ~12 weeks. Used by the roster page to surface "last attended" and to flag
 * members who haven't shown up in the last 14 days.
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

function parseAttendanceXml(xml: unknown, groupId: string): Record<string, string> {
  const root = (xml as Record<string, Record<string, Record<string, unknown>>>)?.ccb_api
    ?.response?.events as { event?: unknown } | undefined;
  const rawEvents: Array<Record<string, unknown>> = Array.isArray(root?.event)
    ? (root!.event as Array<Record<string, unknown>>)
    : root?.event
    ? [root.event as Record<string, unknown>]
    : [];

  const lastAttended: Record<string, string> = {};

  for (const ev of rawEvents) {
    const evGroup = ev?.group as Record<string, unknown> | undefined;
    const evGroupId = String(
      evGroup?.['@_id'] ?? evGroup?.id ?? ev?.group_id ?? ''
    ).trim();
    if (evGroupId !== groupId) continue;

    const occurrence = String(ev?.['@_occurrence'] ?? ev?.occurrence ?? '').trim();
    if (!occurrence) continue;
    const occurDate = occurrence.slice(0, 10);

    const dnm = String(ev?.did_not_meet ?? '').toLowerCase() === 'true';
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

export async function GET(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  if (!leader.ccb_group_id) {
    return NextResponse.json({ lastAttended: {} });
  }

  const groupId = String(leader.ccb_group_id);
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
      .select('attendance_xml, synced_at')
      .eq('group_id', groupId)
      .eq('start_date', startStr)
      .eq('end_date', endStr)
      .maybeSingle();

    if (cacheRow?.attendance_xml && cacheRow.synced_at) {
      const ageMs = Date.now() - new Date(cacheRow.synced_at).getTime();
      if (ageMs < SHARED_CACHE_FRESH_MS) {
        const lastAttended = parseAttendanceXml(cacheRow.attendance_xml, groupId);
        return NextResponse.json({ lastAttended, source: 'cache' });
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
    const xml = await (ccb as unknown as {
      getXml: (p: Record<string, string>) => Promise<unknown>;
    }).getXml({ srv: 'attendance_profiles', start_date: startStr, end_date: endStr });

    const lastAttended = parseAttendanceXml(xml, groupId);
    return NextResponse.json({ lastAttended, source: 'ccb' });
  } catch (e: unknown) {
    return NextResponse.json(
      { lastAttended: {}, error: e instanceof Error ? e.message : 'Failed to load attendance.' },
      { status: 500 }
    );
  }
}
