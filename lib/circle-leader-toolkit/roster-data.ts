/**
 * Shared data loaders for the Circle Summary roster tab.
 *
 * Both the API routes (used for client-side revalidation and mutations) and the
 * server-rendered roster page call these, so the cache logic lives in one place.
 *
 *   - loadLeaderRoster: CCB group participants merged with cached profile data.
 *   - loadLeaderAttendance: per-person "last attended" map for the group.
 *
 * Tier 3: loadLeaderAttendance prefers a small precomputed `last_attended` map
 * stored on the cache row over re-parsing the large global attendance XML on
 * every request. `computeLastAttended` is exported so the prewarm job can
 * populate that column proactively.
 */

import { DateTime } from 'luxon';
import type { SessionLeader } from './session';
import { createCCBClient } from '../ccb/ccb-client';
import { createServiceSupabaseClient } from '../server-supabase';
import { createTimer } from './timing';
import { isDidNotMeetEvent } from './did-not-meet-reasons';

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

const PROFILE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const ROSTER_TTL_MS = 15 * 60 * 1000; // 15m

export type RosterParticipant = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  birthday: string;
  detailsLoaded: boolean;
  status?: string;
  statusId?: string;
  isActive?: boolean;
};

export type LoadRosterResult = {
  participants: RosterParticipant[];
  staleIds: string[];
  source: 'cache' | 'ccb';
  needsRosterRefresh: boolean;
  error?: string;
};

type ProfileCacheEntry = {
  phone: string;
  email: string;
  birthday: string;
  syncedAt: string;
  status?: string;
  statusId?: string;
  isActive?: boolean | null;
};

type ProfileCacheRow = {
  ccb_individual_id: string | number;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  synced_at: string;
  status?: string | null;
  status_id?: string | null;
  is_active?: boolean | null;
};

type RosterCacheRow = {
  ccb_individual_id: string | number;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  birthday?: string | null;
  fetched_at?: string | null;
  status?: string | null;
  status_id?: string | null;
  is_active?: boolean | null;
};

type CcbParticipant = {
  id: string | number;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  status?: string | null;
  statusId?: string | null;
  isActive?: boolean | null;
};

function rowToParticipant(row: RosterCacheRow): RosterParticipant {
  return {
    id: String(row.ccb_individual_id),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    fullName: row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    email: row.email || '',
    phone: row.phone || row.mobile_phone || '',
    birthday: row.birthday || '',
    detailsLoaded: !!(row.email || row.phone || row.mobile_phone || row.birthday),
    status: row.status || '',
    statusId: row.status_id || '',
    isActive: row.is_active ?? undefined,
  };
}

async function loadActiveCachedRows(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  leader: SessionLeader
): Promise<RosterCacheRow[]> {
  const withStatus = await supabase
    .from('circle_roster_cache')
    .select('ccb_individual_id, first_name, last_name, full_name, email, phone, mobile_phone, birthday, fetched_at, status, status_id, is_active')
    .eq('circle_leader_id', leader.id)
    .eq('ccb_group_id', String(leader.ccb_group_id))
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (!withStatus.error) return (withStatus.data || []) as RosterCacheRow[];

  const legacy = await supabase
    .from('circle_roster_cache')
    .select('ccb_individual_id, first_name, last_name, full_name, email, phone, mobile_phone, birthday, fetched_at')
    .eq('circle_leader_id', leader.id)
    .eq('ccb_group_id', String(leader.ccb_group_id))
    .order('full_name', { ascending: true });

  return (legacy.data || []) as RosterCacheRow[];
}

async function upsertRosterRows(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  rows: Array<Record<string, unknown>>
) {
  if (rows.length === 0) return;

  const { error } = await supabase
    .from('circle_roster_cache')
    .upsert(rows, { onConflict: 'circle_leader_id,ccb_individual_id' });

  if (!error) return;

  const fallbackRows = rows.map((row) => {
    const copy = { ...row };
    delete copy.status;
    delete copy.status_id;
    delete copy.is_active;
    return copy;
  });
  await supabase
    .from('circle_roster_cache')
    .upsert(fallbackRows, { onConflict: 'circle_leader_id,ccb_individual_id' });
}

function mergeProfileCache(participants: CcbParticipant[], cacheByID: Map<string, ProfileCacheEntry>) {
  const now = Date.now();
  const staleIds: string[] = [];

  const activeParticipants = participants.filter((p) => {
    if (p.isActive === false) return false;
    const cached = cacheByID.get(String(p.id));
    return cached?.isActive !== false;
  });

  const merged = activeParticipants.map((p) => {
    const id = String(p.id);
    const cached = cacheByID.get(id);
    const rosterPhone = p.phone || p.mobilePhone || '';
    const rosterEmail = p.email || '';

    let phone = rosterPhone;
    let email = rosterEmail;
    let birthday = '';
    let detailsLoaded = false;

    if (cached) {
      phone = cached.phone || rosterPhone;
      email = cached.email || rosterEmail;
      birthday = cached.birthday || '';
      const ageMs = now - new Date(cached.syncedAt).getTime();
      detailsLoaded = true;
      if (ageMs > PROFILE_TTL_MS) staleIds.push(id);
    } else {
      staleIds.push(id);
    }

    return {
      id,
      firstName: p.firstName || '',
      lastName: p.lastName || '',
      fullName: p.fullName || '',
      email,
      phone,
      birthday,
      detailsLoaded,
      status: p.status || cached?.status || '',
      statusId: p.statusId || cached?.statusId || '',
      isActive: p.isActive ?? cached?.isActive ?? true,
    };
  });

  return { merged, staleIds };
}

export async function loadLeaderRoster(
  leader: SessionLeader,
  opts: { forceRefresh?: boolean } = {}
): Promise<LoadRosterResult> {
  if (!leader.ccb_group_id) {
    return { participants: [], staleIds: [], source: 'cache', needsRosterRefresh: false };
  }

  const forceRefresh = !!opts.forceRefresh;
  const supabase = createServiceSupabaseClient();
  const timer = createTimer('loadLeaderRoster');

  if (!forceRefresh) {
    const cachedRows = await loadActiveCachedRows(supabase, leader);
    timer.mark('cacheRead');

    if (cachedRows && cachedRows.length > 0) {
      const rows = cachedRows as RosterCacheRow[];
      const oldestFetchedAt = rows.reduce((oldest: number, row) => {
        const fetchedAt = row.fetched_at ? new Date(row.fetched_at).getTime() : 0;
        return oldest === 0 ? fetchedAt : Math.min(oldest, fetchedAt);
      }, 0);
      const needsRosterRefresh = !oldestFetchedAt || Date.now() - oldestFetchedAt > ROSTER_TTL_MS;

      timer.end({ source: 'cache', count: rows.length, needsRosterRefresh });
      return {
        participants: rows.map(rowToParticipant),
        staleIds: rows
          .filter((row) => !row.email && !row.phone && !row.mobile_phone && !row.birthday)
          .map((row) => String(row.ccb_individual_id)),
        source: 'cache',
        needsRosterRefresh,
      };
    }
  }

  const ccb = createCCBClient({ module: 'circle-summary', action: 'group_roster' });

  try {
    const participants = (await ccb.getGroupParticipants(leader.ccb_group_id)) as CcbParticipant[];
    timer.mark('ccbParticipants');
    const ids = participants.map((p) => String(p.id));

    const cacheByID = new Map<string, ProfileCacheEntry>();
    if (ids.length > 0) {
      const primary = await supabase
        .from('ccb_individual_profiles')
        .select('ccb_individual_id, phone, email, birthday, synced_at, status, status_id, is_active')
        .in('ccb_individual_id', ids);
      let data = (primary.data || null) as ProfileCacheRow[] | null;

      if (primary.error) {
        const fallback = await supabase
          .from('ccb_individual_profiles')
          .select('ccb_individual_id, phone, email, birthday, synced_at')
          .in('ccb_individual_id', ids);
        data = (fallback.data || null) as ProfileCacheRow[] | null;
      }

      for (const row of data || []) {
        cacheByID.set(String(row.ccb_individual_id), {
          phone: row.phone || '',
          email: row.email || '',
          birthday: row.birthday || '',
          syncedAt: row.synced_at,
          status: row.status || '',
          statusId: row.status_id || '',
          isActive: row.is_active ?? null,
        });
      }
    }

    const { merged, staleIds } = mergeProfileCache(participants, cacheByID);
    const nowIso = new Date().toISOString();

    const staleCacheDelete = supabase
      .from('circle_roster_cache')
      .delete()
      .eq('circle_leader_id', leader.id)
      .eq('ccb_group_id', String(leader.ccb_group_id));

    if (merged.length > 0) {
      await staleCacheDelete.not('ccb_individual_id', 'in', `(${merged.map((p) => `"${p.id}"`).join(',')})`);

      await upsertRosterRows(
        supabase,
        merged.map((p) => ({
          circle_leader_id: leader.id,
          ccb_group_id: String(leader.ccb_group_id),
          ccb_individual_id: p.id,
          first_name: p.firstName,
          last_name: p.lastName,
          full_name: p.fullName,
          email: p.email,
          phone: p.phone,
          mobile_phone: p.phone,
          birthday: p.birthday,
          status: p.status || '',
          status_id: p.statusId || '',
          is_active: p.isActive !== false,
          fetched_at: nowIso,
        }))
      );
    } else {
      await staleCacheDelete;
    }

    timer.end({ source: 'ccb', count: merged.length });
    return { participants: merged, staleIds, source: 'ccb', needsRosterRefresh: false };
  } catch (e: unknown) {
    return {
      participants: [],
      staleIds: [],
      source: 'ccb',
      needsRosterRefresh: false,
      error: e instanceof Error ? e.message : 'Failed to load roster.',
    };
  }
}

// ---------------------------------------------------------------------------
// Attendance ("last attended" per person)
// ---------------------------------------------------------------------------

const LOOKBACK_WEEKS = 12;
// A cache row newer than this is trusted; older rows fall through to live CCB so
// we don't show stale "last attended" dates.
const SHARED_CACHE_FRESH_MS = 24 * 60 * 60_000;

export type LoadAttendanceResult = {
  lastAttended: Record<string, string>;
  source: 'cache' | 'cache-derived' | 'ccb';
  error?: string;
};

function textVal(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const rec = v as Record<string, unknown>;
  return String(rec?.['#text'] ?? '');
}

type CalendarEvent = { eventId?: string | number | null; startDate?: string | null };
type SummaryAttendanceRow = { occurrence?: string | null; attendee_ccb_ids?: string[] | null };

function occurrenceDate(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  return (
    DateTime.fromISO(value, { zone: 'America/Chicago' }).toISODate() ??
    DateTime.fromSQL(value, { zone: 'America/Chicago' }).toISODate() ??
    value.slice(0, 10)
  );
}

function calendarEventKeySet(calendarEvents: unknown): Set<string> {
  const rows = Array.isArray(calendarEvents) ? (calendarEvents as CalendarEvent[]) : [];
  const keys = new Set<string>();
  for (const event of rows) {
    const eventId = String(event?.eventId ?? '').trim();
    const startDate = occurrenceDate(event?.startDate);
    if (eventId && startDate) keys.add(`${eventId}|${startDate}`);
  }
  return keys;
}

function eventBelongsToGroup(ev: Record<string, unknown>, groupId: string, calendarKeys: Set<string>): boolean {
  const eventId = String(ev?.['@_id'] ?? ev?.id ?? '').trim();
  const occurDate = occurrenceDate(ev?.['@_occurrence'] ?? ev?.occurrence);

  if (eventId && occurDate && calendarKeys.has(`${eventId}|${occurDate}`)) return true;
  if (calendarKeys.size > 0) return false;

  // Fallback for any older CCB payload shape that includes group metadata.
  const evGroup = ev?.group as Record<string, unknown> | undefined;
  const evGroupId = String(
    evGroup?.['@_id'] ?? evGroup?.id ?? ev?.group_id ?? ev?.['@_group_id'] ?? ''
  ).trim();
  return evGroupId === groupId;
}

/**
 * Pure parse: given a bulk `attendance_profiles` XML payload, the group id, and
 * that group's calendar events, return { ccb_individual_id → last attended
 * YYYY-MM-DD }. Exported so the prewarm job can precompute and store it.
 */
export function computeLastAttended(
  xml: unknown,
  groupId: string,
  calendarEvents: unknown
): Record<string, string> {
  const root = (xml as Record<string, Record<string, Record<string, unknown>>>)?.ccb_api?.response
    ?.events as { event?: unknown } | undefined;
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

    // Skip did-not-meet weeks — matches the events list's detection (explicit
    // flag OR the notes-prefix marker) so a did-not-meet meeting is never
    // counted as attendance here but not there.
    if (isDidNotMeetEvent({ didNotMeet: ev?.did_not_meet, notes: textVal(ev?.notes) })) continue;

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
      if (!existing || occurDate > existing) lastAttended[id] = occurDate;
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
      if (!existing || attendedDate > existing) merged[id] = attendedDate;
    }
  }

  return merged;
}

type EventsCacheRow = {
  calendar_events?: unknown;
  attendance_xml?: unknown;
  last_attended?: Record<string, string> | null;
  synced_at?: string | null;
};

// Read the cache row, tolerating the `last_attended` column not existing yet
// (pre-migration deploy ordering). Falls back to a select without it.
async function readEventsCacheRow(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  groupId: string,
  startStr: string,
  endStr: string
): Promise<EventsCacheRow | null> {
  const query = (columns: string) =>
    supabase
      .from('ccb_group_events_cache')
      .select(columns)
      .eq('group_id', groupId)
      .eq('start_date', startStr)
      .eq('end_date', endStr)
      .maybeSingle();

  const withDerived = await query('calendar_events, attendance_xml, last_attended, synced_at');
  if (!withDerived.error) return (withDerived.data as unknown as EventsCacheRow) ?? null;

  // Most likely the `last_attended` column doesn't exist yet (deploy ordered
  // ahead of the migration) — retry without it.
  const legacy = await query('calendar_events, attendance_xml, synced_at');
  if (legacy.error) {
    console.warn('[roster/attendance] cache read failed:', legacy.error.message);
    return null;
  }
  return (legacy.data as unknown as EventsCacheRow) ?? null;
}

// Best-effort write of just the derived map onto an existing row. Never throws;
// never touches synced_at / attendance_xml so it can't make stale data look
// fresh. Tolerates the `last_attended` column not existing yet (pre-migration),
// so callers can prime the cache without risking their core write.
export function storeDerivedLastAttended(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  groupId: string,
  startStr: string,
  endStr: string,
  lastAttended: Record<string, string>
): void {
  void (async () => {
    try {
      const { error } = await supabase
        .from('ccb_group_events_cache')
        .update({ last_attended: lastAttended })
        .eq('group_id', groupId)
        .eq('start_date', startStr)
        .eq('end_date', endStr);
      if (error && !/last_attended|column/i.test(error.message)) {
        console.warn('[roster/attendance] last_attended write-back failed:', error.message);
      }
    } catch {
      // Non-fatal cache priming.
    }
  })();
}

export async function loadLeaderAttendance(leader: SessionLeader): Promise<LoadAttendanceResult> {
  if (!leader.ccb_group_id) return { lastAttended: {}, source: 'cache' };

  const groupId = String(leader.ccb_group_id);
  const end = DateTime.now().setZone('America/Chicago');
  const start = end.minus({ weeks: LOOKBACK_WEEKS });
  const startStr = start.toFormat('yyyy-LL-dd');
  const endStr = end.toFormat('yyyy-LL-dd');

  const supabase = createServiceSupabaseClient();
  const timer = createTimer('loadLeaderAttendance');

  // Shared cache first. Most hits are served entirely from Supabase.
  try {
    const cacheRow = await readEventsCacheRow(supabase, groupId, startStr, endStr);
    timer.mark('cacheRead');
    if (cacheRow?.synced_at) {
      const ageMs = Date.now() - new Date(cacheRow.synced_at).getTime();
      if (ageMs < SHARED_CACHE_FRESH_MS) {
        // Tier 3: prefer the precomputed per-group map and skip the XML parse.
        if (cacheRow.last_attended && typeof cacheRow.last_attended === 'object') {
          const merged = await mergeSubmittedSummaryAttendance(
            supabase, leader.id, groupId, startStr, endStr, cacheRow.last_attended
          );
          timer.end({ source: 'cache-derived', groupId });
          return { lastAttended: merged, source: 'cache-derived' };
        }
        if (cacheRow.attendance_xml) {
          const base = computeLastAttended(cacheRow.attendance_xml, groupId, cacheRow.calendar_events);
          // Self-heal: store the derived map so the next read skips the parse.
          storeDerivedLastAttended(supabase, groupId, startStr, endStr, base);
          const merged = await mergeSubmittedSummaryAttendance(
            supabase, leader.id, groupId, startStr, endStr, base
          );
          timer.end({ source: 'cache', groupId });
          return { lastAttended: merged, source: 'cache' };
        }
      }
    }
  } catch (e) {
    console.warn('[roster/attendance] cache path failed:', e);
  }

  // Cache miss or stale — go to CCB.
  const ccb = createCCBClient({ module: 'circle-summary', action: 'roster_attendance' });
  try {
    const [calendarEvents, xml] = await Promise.all([
      ccb.getGroupCalendarEvents(groupId, startStr, endStr),
      (ccb as unknown as { getXml: (p: Record<string, string>) => Promise<unknown> }).getXml({
        srv: 'attendance_profiles',
        start_date: startStr,
        end_date: endStr,
      }),
    ]);
    timer.mark('ccbFetch');

    const base = computeLastAttended(xml, groupId, calendarEvents);
    storeDerivedLastAttended(supabase, groupId, startStr, endStr, base);
    const merged = await mergeSubmittedSummaryAttendance(
      supabase, leader.id, groupId, startStr, endStr, base
    );
    timer.end({ source: 'ccb', groupId });
    return { lastAttended: merged, source: 'ccb' };
  } catch (e: unknown) {
    return {
      lastAttended: {},
      source: 'ccb',
      error: e instanceof Error ? e.message : 'Failed to load attendance.',
    };
  }
}

/**
 * Batch attendance loader for the daily coaching job. Reads every relevant
 * `ccb_group_events_cache` row and every leader's submitted summaries in two
 * queries (instead of per leader) and returns leaderId → { ccb_individual_id →
 * last attended YYYY-MM-DD }. Cache-only by design: it never calls CCB live, so
 * it relies on the daily prewarm having warmed the cache earlier in the day.
 */
export async function loadLeaderAttendanceBatch(
  leaders: Array<{ id: number | string; ccb_group_id: string | number | null }>
): Promise<Map<string, Record<string, string>>> {
  const result = new Map<string, Record<string, string>>();
  const supabase = createServiceSupabaseClient();
  const end = DateTime.now().setZone('America/Chicago');
  const start = end.minus({ weeks: LOOKBACK_WEEKS });
  const startStr = start.toFormat('yyyy-LL-dd');
  const endStr = end.toFormat('yyyy-LL-dd');

  const groupIds = Array.from(
    new Set(leaders.map((l) => l.ccb_group_id).filter(Boolean).map((g) => String(g)))
  );
  if (groupIds.length === 0) return result;

  // 1. Precomputed (or XML-derived) attendance per group, from the warm cache.
  const baseByGroup = new Map<string, Record<string, string>>();
  const { data: cacheRows } = await supabase
    .from('ccb_group_events_cache')
    .select('group_id, calendar_events, attendance_xml, last_attended')
    .in('group_id', groupIds)
    .eq('start_date', startStr)
    .eq('end_date', endStr);
  for (const row of (cacheRows || []) as Array<Record<string, unknown>>) {
    const gid = String(row.group_id);
    if (row.last_attended && typeof row.last_attended === 'object') {
      baseByGroup.set(gid, row.last_attended as Record<string, string>);
    } else if (row.attendance_xml) {
      baseByGroup.set(gid, computeLastAttended(row.attendance_xml, gid, row.calendar_events));
    } else {
      baseByGroup.set(gid, {});
    }
  }

  // 2. Leader-submitted attendance, merged on top of the CCB-derived map.
  const submittedByLeader = new Map<string, Record<string, string>>();
  const startIso = start.startOf('day').toISO();
  const endIso = end.endOf('day').toISO();
  if (startIso && endIso) {
    const { data: sums } = await supabase
      .from('circle_event_summaries')
      .select('leader_id, occurrence, attendee_ccb_ids')
      .in('leader_id', leaders.map((l) => l.id))
      .eq('status', 'submitted')
      .eq('did_not_meet', false)
      .gte('occurrence', startIso)
      .lte('occurrence', endIso);
    for (const row of (sums || []) as Array<Record<string, unknown>>) {
      const lid = String(row.leader_id);
      const occ = String(row.occurrence ?? '');
      const attendedDate =
        DateTime.fromISO(occ, { zone: 'America/Chicago' }).toISODate() || occ.slice(0, 10);
      const ids = Array.isArray(row.attendee_ccb_ids) ? (row.attendee_ccb_ids as unknown[]) : [];
      if (!attendedDate || ids.length === 0) continue;
      const map = submittedByLeader.get(lid) || {};
      ids.forEach((raw) => {
        const idv = String(raw ?? '').trim();
        if (!idv) return;
        if (!map[idv] || attendedDate > map[idv]) map[idv] = attendedDate;
      });
      submittedByLeader.set(lid, map);
    }
  }

  // 3. Merge per leader.
  for (const l of leaders) {
    const gid = l.ccb_group_id ? String(l.ccb_group_id) : '';
    const merged: Record<string, string> = { ...((gid && baseByGroup.get(gid)) || {}) };
    const sub = submittedByLeader.get(String(l.id));
    if (sub) {
      Object.keys(sub).forEach((k) => {
        if (!merged[k] || sub[k] > merged[k]) merged[k] = sub[k];
      });
    }
    result.set(String(l.id), merged);
  }

  return result;
}
