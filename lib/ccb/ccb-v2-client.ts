/**
 * CCB API v2 (Pushpay REST/JSON) client — request layer.
 *
 * Field-mapped endpoint methods (getIndividualProfile, getGroupParticipants, …)
 * are added in the per-endpoint cutover once we've confirmed v2's JSON shapes
 * against live data. This layer handles everything that does NOT depend on
 * response field names: OAuth bearer auth (auto-refresh), the required Accept
 * header, telemetry, the daily-budget tripwire, and 429/retry-after handling.
 */

import { forceRefreshAccessToken, getValidAccessToken } from './ccb-v2-auth';
import { CCB_V2_API_BASE_URL, CCB_V2_ACCEPT_HEADER } from './ccb-v2-config';
import {
  recordCCBApiTelemetry,
  reserveCCBDailyBudget,
  type CCBApiRequestContext,
} from './ccb-api-gateway';

export class CCBv2RateLimitError extends Error {
  constructor(message: string, public readonly retryAfterSeconds: number | null) {
    super(message);
    this.name = 'CCBv2RateLimitError';
  }
}

export class CCBv2RequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly body: string) {
    super(message);
    this.name = 'CCBv2RequestError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export interface CCBv2Response<T = any> {
  data: T;
  status: number;
}

export class CCBv2Client {
  constructor(private readonly telemetryContext?: CCBApiRequestContext) {}

  /**
   * Low-level authenticated request. Reused by every endpoint method. Returns
   * parsed JSON (or null on 204). Records telemetry and honors 429/retry-after.
   */
  async request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.requestWithResponse<T>(path, options);
    return response.data;
  }

  /**
   * Same request layer as request(), but preserves the HTTP status for audit
   * trails on destructive operations.
   */
  async requestWithResponse<T = any>(path: string, options: RequestOptions = {}): Promise<CCBv2Response<T>> {
    return this.requestWithResponseAttempt<T>(path, options, false);
  }

  private async requestWithResponseAttempt<T = any>(
    path: string,
    options: RequestOptions = {},
    retriedAfterUnauthorized: boolean,
  ): Promise<CCBv2Response<T>> {
    // Shared daily ceiling across all serverless instances (tripwire, not a CCB
    // cap — v2 has no daily limit). Throws CCBDailyBudgetError once reached.
    await reserveCCBDailyBudget();

    const method = options.method ?? 'GET';
    const url = new URL(`${CCB_V2_API_BASE_URL}${path}`);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const token = retriedAfterUnauthorized
      ? await forceRefreshAccessToken()
      : await getValidAccessToken();
    const startedAt = Date.now();
    // `service` groups telemetry per endpoint family (v2 rate limits are per-endpoint).
    const service = `v2:${method} ${path.replace(/\/\d+/g, '/{id}')}`;

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: CCB_V2_ACCEPT_HEADER,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const durationMs = Date.now() - startedAt;
    // recordCCBApiTelemetry reads headers via bracket access, so flatten the
    // fetch Headers object into a plain map first.
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });

    const text = await res.text();

    await recordCCBApiTelemetry({
      context: this.telemetryContext,
      service,
      method,
      statusCode: res.status,
      success: res.ok,
      durationMs,
      response: { headers } as any,
      errorMessage: res.ok ? undefined : text.slice(0, 500),
    });

    if (res.status === 429) {
      const retryAfter = headers['retry-after'] ? Number(headers['retry-after']) : null;
      throw new CCBv2RateLimitError(
        `CCB v2 rate limited (429) on ${service}${retryAfter ? `; retry after ${retryAfter}s` : ''}`,
        Number.isFinite(retryAfter as number) ? (retryAfter as number) : null,
      );
    }
    if (res.status === 401 && !retriedAfterUnauthorized) {
      return this.requestWithResponseAttempt<T>(path, options, true);
    }
    if (!res.ok) {
      throw new CCBv2RequestError(`CCB v2 ${method} ${path} failed: HTTP ${res.status}`, res.status, text.slice(0, 500));
    }

    if (res.status === 204 || text.length === 0) {
      return { data: null as T, status: res.status };
    }
    try {
      return { data: JSON.parse(text) as T, status: res.status };
    } catch {
      throw new CCBv2RequestError(`CCB v2 ${method} ${path} returned non-JSON`, res.status, text.slice(0, 500));
    }
  }

  /** Convenience GET. */
  get<T = any>(path: string, query?: RequestOptions['query']): Promise<T> {
    return this.request<T>(path, { method: 'GET', query });
  }

  // ---- Endpoint methods (mirror v1 CCBClient shapes) ----
  //
  // Field mapping is defensive (snake_case/camelCase/nested variants) because
  // v2's exact JSON field names aren't pinned by static docs yet. Verified and
  // tightened against live data via /api/ccb/v2-verify during cutover.

  /** GET /individuals/{id} → same shape as v1 CCBClient.getIndividualProfile. */
  async getIndividualProfile(individualId: string): Promise<{
    id: string; firstName: string; lastName: string; fullName: string;
    email: string; phone: string; mobilePhone: string; birthday: string;
    status: string; statusId: string; isActive: boolean;
  } | null> {
    if (!individualId) return null;
    const ind = unwrap(await this.get(`/individuals/${encodeURIComponent(individualId)}`));
    if (!ind) return null;
    return mapIndividual(ind, individualId);
  }

  /** GET /groups/{id}/members → same shape as v1 CCBClient.getGroupParticipants. */
  async getGroupParticipants(groupId: string): Promise<Array<{
    id: string; firstName: string; lastName: string; fullName: string;
    email: string; phone: string; mobilePhone: string;
    status: string; statusId: string; isActive: boolean;
  }>> {
    if (!groupId) throw new Error('Group ID is required');
    const raw = await this.get(`/groups/${encodeURIComponent(groupId)}/members`);
    const members = asArray(raw);
    return members.map((m: any) => {
      const nested = m.individual ?? m;
      const id = String(m.individual_id ?? nested.id ?? m.id ?? '').trim();
      const memberStatus = m.is_main_leader ? 'Leader' : (m.status ?? nested.status);
      return mapIndividual(nested, id, memberStatus);
    });
  }

  /**
   * GET /groups/{id}/attendance → AttendanceSummary[] (v1-compatible), optionally
   * filtered to a YYYY-MM-DD range. One call per group replaces v1's global
   * attendance_profiles pull + per-event fetches.
   */
  async getGroupAttendanceInRange(groupId: string, startDate?: string, endDate?: string): Promise<AttendanceSummaryV2[]> {
    if (!groupId) throw new Error('Group ID is required');
    const raw = await this.get(`/groups/${encodeURIComponent(groupId)}/attendance`);
    return asArray(raw)
      .map(mapAttendance)
      .filter((a) => !startDate || !endDate || (a.occurrence >= startDate && a.occurrence <= endDate));
  }

  /**
   * GET /groups/{id} → Full group details with all settings, leader info, meeting details, etc.
   * Used for syncing circle data from CCB to RADIUS.
   */
  async getGroupDetail(groupId: string): Promise<GroupDetailV2 | null> {
    if (!groupId) return null;
    const raw = await this.get(`/groups/${encodeURIComponent(groupId)}`);
    return mapGroupDetail(raw);
  }

  /**
   * GET /groups/{id}/events → the group's calendar. Returns the distinct CCB
   * event IDs backing this circle, used to seed circle_leaders.ccb_event_ids so
   * the attendance/event-summary sync can run immediately after import.
   */
  async getGroupEventIds(groupId: string): Promise<string[]> {
    if (!groupId) return [];
    const raw = await this.get(`/groups/${encodeURIComponent(groupId)}/events`);
    const ids = new Set<string>();
    for (const e of asArray(raw)) {
      const id = firstString(e?.event_id, e?.event?.id, e?.id);
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }

  /**
   * Derive the real meeting schedule from a circle's CCB calendar event — its
   * exact start time, weekday, recurrence-based frequency, and location. This is
   * more authoritative than the group's coarse meet_day / meet_time labels
   * (e.g. "Evening"), which don't carry a real clock time. Returns the event IDs
   * too so callers can seed ccb_event_ids in the same pass.
   */
  async getGroupMeetingDetails(groupId: string): Promise<{
    eventIds: string[];
    time: string | null;       // "HH:mm"
    day: string | null;        // "Monday".."Sunday"
    frequency: string | null;  // "Weekly" | "Bi-weekly" | "Monthly" | "Quarterly"
    location: string | null;
  }> {
    const empty = { eventIds: [] as string[], time: null, day: null, frequency: null, location: null };
    if (!groupId) return empty;

    const listRaw = await this.get(`/groups/${encodeURIComponent(groupId)}/events`);
    const list = asArray(listRaw);
    const eventIds = Array.from(new Set(
      list.map((e: any) => firstString(e?.event_id, e?.event?.id, e?.id)).filter(Boolean)
    ));
    if (eventIds.length === 0) return empty;

    // Fetch the full detail of the first event for its recurrence + address.
    let detail: any = null;
    try {
      detail = await this.get(`/events/${encodeURIComponent(eventIds[0])}`);
    } catch { /* fall back to list row below */ }
    const ev = detail ?? list[0] ?? {};

    const start = firstString(ev?.start, ev?.event?.start, list[0]?.start);
    let time: string | null = null;
    let day: string | null = null;
    if (start) {
      // Keep the event's own wall-clock time/zone (don't shift to server tz).
      const m = start.match(/T(\d{2}):(\d{2})/);
      if (m) time = `${m[1]}:${m[2]}`;
      const dateMatch = start.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        const [, y, mo, d] = dateMatch;
        const dow = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay();
        day = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow] ?? null;
      }
    }

    // Recurrence → RADIUS frequency label.
    const rec = ev?.recurrence ?? {};
    const freqCode = firstString(rec?.frequency).toUpperCase();
    const interval = Number(firstString(rec?.interval)) || 1;
    let frequency: string | null = null;
    if (freqCode === 'W') frequency = interval >= 2 ? 'Bi-weekly' : 'Weekly';
    else if (freqCode === 'M') frequency = interval >= 3 ? 'Quarterly' : 'Monthly';
    else if (freqCode === 'Q') frequency = 'Quarterly';

    // Location → prefer the event address (more specific than the group's).
    const addr = ev?.address ?? {};
    const location = firstString(
      addr?.name,
      [addr?.street, addr?.city, addr?.state, addr?.zip].map((s: any) => firstString(s)).filter(Boolean).join(', '),
    ) || null;

    return { eventIds, time, day, frequency, location };
  }

  /**
   * GET /groups → List groups, one page at a time. NOTE: CCB v2's /groups endpoint
   * does NOT support server-side filtering (campus_id/department_id/type_id are all
   * silently ignored, and campus_ids returns 412). Callers must filter the returned
   * items themselves on group_type / campus / department.
   */
  async listGroups(options?: { page?: number; perPage?: number }): Promise<{ items: GroupDetailV2[]; totalCount?: number }> {
    const query: Record<string, any> = {};
    if (options?.page) query.page = options.page;
    if (options?.perPage) query.per_page = options.perPage;

    const raw = await this.get('/groups', query);
    const items = asArray(raw).map(mapGroupDetail).filter((g): g is GroupDetailV2 => g !== null);
    return { items, totalCount: raw?.meta?.pagination?.total_count };
  }

  /**
   * GET /scheduling/categories → all categories, paged through to the end.
   * Returns a lightweight shape (id, name, campus, archived) for pickers. The
   * endpoint returns a bare array per page with no total_count, so we page until
   * a short page comes back.
   */
  async listSchedulingCategories(): Promise<Array<{ id: number; name: string; campus?: { id: number; name: string }; archived: boolean }>> {
    const perPage = 100;
    const all: Array<{ id: number; name: string; campus?: { id: number; name: string }; archived: boolean }> = [];
    for (let page = 1; page <= 20; page++) {
      const raw = await this.get<any>('/scheduling/categories', { page, per_page: perPage });
      const items = asArray(raw);
      for (const c of items) {
        all.push({
          id: c.id,
          name: c.name ?? '',
          campus: c.campus ? { id: c.campus.id, name: c.campus.name } : undefined,
          archived: c.archived ?? false,
        });
      }
      if (items.length < perPage) break;
    }
    return all;
  }

  async getSchedulingCategory(categoryId: string | number): Promise<SchedulingCategoryV2 | null> {
    const raw = await this.get<any>(`/scheduling/categories/${categoryId}`);
    if (!raw || !raw.id) return null;
    return {
      id: raw.id,
      name: raw.name ?? '',
      campus: raw.campus ? { id: raw.campus.id, name: raw.campus.name } : undefined,
      organizer: raw.organizer
        ? { id: raw.organizer.id, name: raw.organizer.name ?? `${raw.organizer.first_name ?? ''} ${raw.organizer.last_name ?? ''}`.trim(), email: raw.organizer.email }
        : undefined,
      recurrence_pattern: raw.recurrence_pattern,
      archived: raw.archived ?? false,
      teams: asArray(raw.teams).map((t: any) => ({
        id: t.id,
        name: t.name,
        positions: asArray(t.positions).map((p: any) => ({ id: p.id, name: p.name })),
      })),
      metrics: raw.metrics ? { total_active_volunteers: raw.metrics.total_active_volunteers ?? 0 } : undefined,
    };
  }

  async getCategoryVolunteers(categoryId: string | number): Promise<SchedulingVolunteerV2[]> {
    const raw = await this.get<any>(`/scheduling/categories/${categoryId}/volunteers`);
    return asArray(raw).map((v: any) => ({
      id: v.id,
      positionId: v.position_id,
      status: v.status ?? 'ACTIVE',
      individual: v.individual
        ? {
            id: v.individual.id,
            name: v.individual.name ?? `${v.individual.first_name ?? ''} ${v.individual.last_name ?? ''}`.trim(),
            email: v.individual.email ?? '',
            mobile: v.individual.phone?.mobile ?? '',
            birthday: v.individual.birthday ?? '',
          }
        : null,
    })).filter((v: SchedulingVolunteerV2) => v.individual !== null);
  }
}

export interface SchedulingCategoryV2 {
  id: number;
  name: string;
  campus?: { id: number; name: string };
  organizer?: { id: number; name: string; email?: string };
  recurrence_pattern?: string;
  archived?: boolean;
  teams?: Array<{
    id: number;
    name: string;
    positions?: Array<{ id: number; name: string }>;
  }>;
  metrics?: { total_active_volunteers: number };
}

export interface SchedulingVolunteerV2 {
  id: number;
  positionId: number;
  status: 'ACTIVE' | 'INACTIVE' | string;
  individual: {
    id: number;
    name: string;
    email: string;
    mobile: string;
    birthday: string;
  } | null;
}

export interface AttendanceSummaryV2 {
  eventId: string;
  occurrence: string; // YYYY-MM-DD
  title?: string;
  didNotMeet?: boolean;
  headCount?: number;
  topic?: string;
  notes?: string;
  prayerRequests?: string;
  attendees?: Array<{ id?: string; name?: string; status?: string }>;
}

export interface GroupDetailV2 {
  id: string;
  name: string;
  description?: string;
  type?: { id?: string; name?: string };
  campus?: { id?: string; name?: string };
  department?: { id?: string; name?: string };
  area?: { id?: string; name?: string };
  address?: { street?: string; city?: string; state?: string; zip?: string };
  mainLeader?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    mobilePhone?: string;
  };
  meetDay?: { id?: string; name?: string };
  meetTime?: { id?: string; name?: string };
  interactionType?: string;
  membershipType?: string;
  childcare?: boolean;
  inactive?: boolean;
  listed?: boolean;
  groupingId?: string;
}

// ---- shared mapping helpers ----

/** Single-resource responses may be the object itself or wrapped in {data}. */
function unwrap(json: any): any {
  if (!json) return null;
  return json.data ?? json.individual ?? json;
}

/** List responses may be a bare array or wrapped in {items}/{data}/{count,...}. */
function asArray(json: any): any[] {
  if (Array.isArray(json)) return json;
  return json?.items ?? json?.data ?? json?.results ?? [];
}

function firstString(...vals: any[]): string {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function resolveEmail(ind: any): string {
  if (ind?.email) return firstString(ind.email);
  const emails = ind?.emails;
  if (Array.isArray(emails) && emails.length) {
    return firstString(emails[0]?.address, emails[0]?.email, emails[0]);
  }
  return '';
}

function resolvePhone(ind: any, types: string[]): string {
  // Array shape: [{ number, type }]
  const arr = Array.isArray(ind?.phones) ? ind.phones : Array.isArray(ind?.phone) ? ind.phone : [];
  for (const t of types) {
    const entry = arr.find((p: any) => firstString(p?.type, p?.phone_type, p?.['@_type']).toLowerCase() === t);
    const val = firstString(entry?.number, entry?.value, entry?.phone, entry?.['#text']);
    if (val) return val;
  }
  // Object shape keyed by type: { mobile, home, work, ... } — v2 returns phone as an object.
  const obj = ind?.phone && typeof ind.phone === 'object' && !Array.isArray(ind.phone) ? ind.phone
    : ind?.phones && typeof ind.phones === 'object' && !Array.isArray(ind.phones) ? ind.phones
    : null;
  if (obj) {
    for (const t of types) {
      const v = obj[t] ?? obj[`${t}_phone`] ?? obj[`${t}Phone`];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (v && typeof v === 'object') {
        const n = firstString(v.number, v.value, v.phone);
        if (n) return n;
      }
    }
    // { number, type } single-entry object
    if (types.includes(firstString(obj.type, obj.phone_type).toLowerCase())) {
      const n = firstString(obj.number, obj.value);
      if (n) return n;
    }
  }
  // Flat string fallbacks (guard against objects → no more "[object Object]").
  const str = (v: any) => (typeof v === 'string' ? v : '');
  if (types.includes('mobile')) return firstString(str(ind?.mobile_phone), str(ind?.mobilePhone), str(ind?.cell_phone));
  return firstString(str(ind?.home_phone), str(ind?.homePhone), str(ind?.phone));
}

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

function resolveActive(ind: any, memberStatus?: string): { status: string; statusId: string; isActive: boolean } {
  const raw = firstString(memberStatus, ind?.status, ind?.membership_status);
  // A returned group member is active unless the status marks otherwise.
  const isActive = raw ? !/inactive|archiv|former|removed|deceased|prospect/i.test(raw) : ind?.active !== false;
  return { status: titleCase(raw), statusId: firstString(ind?.status_id), isActive };
}

/** Normalize any phone (E.164 like +19403154518, or pretty) to v1's "(XXX) XXX-XXXX". */
function formatPhone(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return String(raw || '').trim();
}

function mapIndividual(ind: any, fallbackId: string, memberStatus?: string) {
  const firstName = firstString(ind?.first_name, ind?.firstName, ind?.name?.first, ind?.first);
  const lastName = firstString(ind?.last_name, ind?.lastName, ind?.name?.last, ind?.last);
  const fullName = firstString(
    ind?.full_name, ind?.fullName,
    typeof ind?.name === 'string' ? ind.name : ind?.name?.full,
    `${firstName} ${lastName}`.trim(),
  );
  const mobilePhone = formatPhone(resolvePhone(ind, ['mobile', 'cell', 'contact']));
  // Match v1: fall back to the mobile number when there's no home/work line.
  const phone = formatPhone(resolvePhone(ind, ['home', 'work', 'contact'])) || mobilePhone;
  return {
    id: firstString(ind?.id, fallbackId),
    firstName,
    lastName,
    fullName,
    email: resolveEmail(ind),
    phone,
    mobilePhone,
    birthday: firstString(ind?.birthday, ind?.date_of_birth, ind?.birth_date),
    ...resolveActive(ind, memberStatus),
  };
}

// ---- attendance mapping (/groups/{id}/attendance) ----

/** Occurrence id "20250825" → "2025-08-25"; ISO datetime → its date part. */
function occToIso(occ: string): string {
  const s = String(occ ?? '');
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const d = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : s;
}

function strOrUndef(v: any): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function mapAttendees(pi: any): Array<{ id?: string; name?: string; status?: string }> {
  const list = Array.isArray(pi) ? pi : pi && typeof pi === 'object' ? Object.values(pi) : [];
  return list
    .filter((p: any) => p && typeof p === 'object')
    .map((p: any) => ({
      id: firstString(p.individual_id, p.id) || undefined,
      name: firstString(p.name, `${firstString(p.first_name)} ${firstString(p.last_name)}`.trim()) || undefined,
      status: firstString(p.status, p.attendance_status) || undefined,
    }));
}

function deriveDidNotMeet(r: any): boolean {
  const s = firstString(r?.status, r?.attendance_status).toLowerCase();
  return /not.?met|did.?not|didnt|cancel|no.?meet/.test(s);
}

function mapAttendance(r: any): AttendanceSummaryV2 {
  return {
    eventId: firstString(r?.event_id, r?.event?.id),
    occurrence: occToIso(String(r?.occurrence ?? r?.start ?? '')),
    title: strOrUndef(firstString(r?.event?.name, r?.name)),
    didNotMeet: deriveDidNotMeet(r),
    headCount: typeof r?.total_attendance === 'number' ? r.total_attendance : undefined,
    topic: strOrUndef(r?.topic),
    notes: strOrUndef(r?.notes),
    prayerRequests: strOrUndef(r?.prayer_requests),
    attendees: mapAttendees(r?.people_information),
  };
}

function mapGroupDetail(g: any): GroupDetailV2 | null {
  if (!g || !g.id) return null;
  return {
    id: String(g.id),
    name: firstString(g.name),
    description: strOrUndef(g.description),
    type: g.group_type ? { id: String(g.group_type.id), name: firstString(g.group_type.name) } : (g.type_id ? { id: String(g.type_id) } : undefined),
    campus: g.campus ? { id: String(g.campus.id), name: firstString(g.campus.name) } : (g.campus_id ? { id: String(g.campus_id) } : undefined),
    department: g.department ? { id: String(g.department.id), name: firstString(g.department.name) } : undefined,
    area: g.area ? { id: String(g.area.id), name: firstString(g.area.name) } : undefined,
    address: g.address ? {
      street: strOrUndef(g.address.street),
      city: strOrUndef(g.address.city),
      state: strOrUndef(g.address.state),
      zip: strOrUndef(g.address.zip),
    } : undefined,
    mainLeader: g.main_leader ? mapIndividual(g.main_leader, String(g.main_leader.id || '')) : undefined,
    meetDay: g.meet_day ? { id: String(g.meet_day.id), name: firstString(g.meet_day.name) } : undefined,
    meetTime: g.meet_time ? { id: String(g.meet_time.id), name: firstString(g.meet_time.name) } : undefined,
    interactionType: strOrUndef(g.interaction_type),
    membershipType: strOrUndef(g.membership_type),
    childcare: Boolean(g.childcare),
    inactive: Boolean(g.inactive),
    listed: Boolean(g.listed),
    groupingId: firstString(g.grouping_id),
  };
}

export function createCCBv2Client(context?: CCBApiRequestContext): CCBv2Client {
  return new CCBv2Client(context);
}
