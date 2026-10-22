import type { SupabaseClient } from '@supabase/supabase-js';

export interface LeaderRow {
  id: number;
  name: string;
  campus: string | null;
  acpd: string | null;
  status: string | null;
  circle_name: string | null;
  circle_type: string | null;
  circle_location: string | null;
  day: string | null;
  time: string | null;
  frequency: string | null;
  meeting_start_date: string | null;
  leader_type: string | null;
  team_name: string | null;
  director: string | null;
  check_in_cadence: string | null;
  last_check_in_date: string | null;
  event_summary_state: string | null;
  additional_leader_name: string | null;
  follow_up_required: boolean | null;
  follow_up_date: string | null;
  follow_up_time: string | null;
  follow_up_note: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface NoteRow {
  id: number;
  content: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ConnectionRow {
  id: number;
  date_of_connection: string;
  connection_type_id: number | null;
  note: string | null;
  created_at: string;
}

export interface TodoRow {
  id: number;
  text: string;
  completed: boolean | null;
  completed_at: string | null;
  due_date: string | null;
  notes: string | null;
  linked_leader_id: number | null;
}

export interface SearchFilters {
  query?: string;
  campus?: string;
  acpd?: string;
  status?: string[];
  circleType?: string;
  day?: string;
  leaderType?: string;
  followUpRequired?: boolean;
  /** The caller's campus allow-list (exact, case-insensitive). null / absent = every campus. */
  allowedCampuses?: string[] | null;
  limit: number;
  offset: number;
}

export type ReviewFilter = 'any' | 'unreviewed' | 'reviewed_by_me' | 'reviewed_by_other' | 'reviewed_by_anyone';

/** A submitted event summary, without the response fields. */
export interface SummaryRow {
  id: string;
  leader_id: number;
  ccb_event_id: string;
  occurrence: string;
  did_not_meet: boolean;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface SummaryDetailRow extends SummaryRow {
  did_not_meet_reason: string | null;
  topic: string | null;
  notes: string | null;
  prayer_requests: string | null;
  info: string | null;
  attendee_ccb_ids: string[] | null;
  manual_attendees: unknown[] | null;
  dynamic_responses: Record<string, { label?: string; value?: unknown }> | null;
  info_update_requested: unknown;
  ccb_submitted_at: string | null;
  ccb_error: string | null;
  submitted_via: string | null;
  updated_at: string | null;
}

export interface SummaryKeyset {
  occurrence: string;
  created_at: string;
  id: string;
}

export interface SummaryFilters {
  /** null = no leader-level filter. An empty list matches nothing. */
  leaderIds: number[] | null;
  occurrenceFrom?: string;
  occurrenceToExclusive?: string;
  review: ReviewFilter;
  /** The caller, for the "reviewed by me" filters. */
  userId: string;
  after?: SummaryKeyset;
  limit: number;
}

export interface LeaderBasics {
  name: string;
  circle_name: string | null;
  campus: string | null;
}

/**
 * Everything the read tools may use. Contact details live in ContactRepo and every write path in
 * WriteRepo (lib/mcp/repo-write.ts), so a tool can only reach them by asking for them by name.
 */
export interface ReadRepo {
  searchLeaders(filters: SearchFilters): Promise<{ rows: LeaderRow[]; total: number }>;
  getLeader(id: number): Promise<LeaderRow | null>;
  latestNote(leaderId: number): Promise<NoteRow | null>;
  listNotes(leaderId: number, f: { since?: string; limit: number; offset: number }): Promise<{ rows: NoteRow[]; total: number }>;
  latestConnection(leaderId: number): Promise<ConnectionRow | null>;
  listConnections(leaderId: number, f: { since?: string; limit: number; offset: number }): Promise<{ rows: ConnectionRow[]; total: number }>;
  connectionTypeNames(ids: number[]): Promise<Map<number, string>>;
  authorNames(userIds: string[]): Promise<Map<string, string>>;
  leaderNames(ids: number[]): Promise<Map<number, string>>;
  leaderBasics(ids: number[]): Promise<Map<number, LeaderBasics>>;
  /** campus per leader id, for campus checks on records that only know a leader id. */
  leaderCampuses(ids: number[]): Promise<Map<number, string | null>>;
  /** The user's current role in Radius (`users.role`), looked up live. */
  userRole(userId: string): Promise<string | null>;
  /**
   * Leader ids matching leader-level filters, or null when no filter was given. `capped` means more than
   * `cap` leaders matched and the list was cut short.
   */
  leaderIdsMatching(f: {
    allowedCampuses?: string[] | null;
    campus?: string;
    circle?: string;
    leaderId?: number;
  }): Promise<{ ids: number[]; capped: boolean } | null>;
  listEventSummaries(f: SummaryFilters): Promise<SummaryRow[]>;
  countEventSummaries(f: SummaryFilters): Promise<number>;
  getEventSummary(id: string): Promise<SummaryDetailRow | null>;
  /** Leaders with an open follow-up flag. Shared data: any signed-in Radius user can see it. */
  leaderFollowUps(f: { leaderId?: number }): Promise<{ rows: LeaderRow[]; capped: boolean }>;
  /**
   * The caller's OWN follow-up todos, optionally only open (`completed: false`) or only done (`true`).
   * `userId` always comes from the verified token, never from a tool argument. `capped` means more rows
   * exist than were fetched.
   */
  personalFollowUps(userId: string, f: { leaderId?: number; completed?: boolean }): Promise<{ rows: TodoRow[]; capped: boolean }>;
}

export const LEADER_COLUMNS =
  'id, name, campus, acpd, status, circle_name, circle_type, circle_location, day, time, frequency, ' +
  'meeting_start_date, leader_type, team_name, director, check_in_cadence, last_check_in_date, ' +
  'event_summary_state, additional_leader_name, follow_up_required, follow_up_date, follow_up_time, ' +
  'follow_up_note, created_at, updated_at';

const FOLLOW_UP_FETCH_CAP = 500;
export const LEADER_ID_FILTER_CAP = 1000;

const SUMMARY_COLUMNS = 'id, leader_id, ccb_event_id, occurrence, did_not_meet, status, created_at, reviewed_at, reviewed_by';
// Deliberately omits client_ip, user_agent and ccb_response.
const SUMMARY_DETAIL_COLUMNS =
  `${SUMMARY_COLUMNS}, did_not_meet_reason, topic, notes, prayer_requests, info, attendee_ccb_ids, manual_attendees, ` +
  'dynamic_responses, info_update_requested, ccb_submitted_at, ccb_error, submitted_via, updated_at';

/** `campus.ilike.<exact>` clauses (no wildcards) for a PostgREST or(). */
const campusOrClause = (campuses: string[]) =>
  campuses.map((c) => `campus.ilike.${likeTerm(c)}`).join(',');

/**
 * Makes a value safe to splice into a LIKE pattern and a PostgREST `or()` filter: LIKE wildcards, filter
 * separators, quoting and control characters become spaces. Names in any alphabet pass through.
 */
export function likeTerm(raw: string): string {
  return raw.replace(/[,()*%_\\"\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function must<T>(result: { data: T; error: { message: string } | null; count?: number | null }, what: string) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result;
}

// Applies the filters shared by the page query and the count. `keyset` is false for the count, which must
// ignore the cursor so `total` stays the size of the whole result.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summaryQuery(q: any, f: SummaryFilters, keyset: boolean) {
  if (f.leaderIds) q = f.leaderIds.length ? q.in('leader_id', f.leaderIds) : q.eq('leader_id', -1);
  if (f.occurrenceFrom) q = q.gte('occurrence', f.occurrenceFrom);
  if (f.occurrenceToExclusive) q = q.lt('occurrence', f.occurrenceToExclusive);
  switch (f.review) {
    case 'unreviewed': q = q.is('reviewed_at', null); break;
    case 'reviewed_by_anyone': q = q.not('reviewed_at', 'is', null); break;
    case 'reviewed_by_me': q = q.not('reviewed_at', 'is', null).eq('reviewed_by', f.userId); break;
    // A reviewer whose account was later deleted has reviewed_by = null; that still counts as someone else.
    case 'reviewed_by_other': q = q.not('reviewed_at', 'is', null).or(`reviewed_by.is.null,reviewed_by.neq.${f.userId}`); break;
    default: break;
  }
  if (keyset && f.after) {
    // Values were validated against strict patterns when the cursor was decoded; they are never free text.
    const { occurrence: o, created_at: c, id } = f.after;
    q = q.and(`or(occurrence.lt.${o},and(occurrence.eq.${o},created_at.lt.${c}),and(occurrence.eq.${o},created_at.eq.${c},id.lt.${id}))`);
  }
  return q;
}

/** Service-role reads, narrowed to the columns above. Authorization happens before any of these run. */
export function createSupabaseReadRepo(db: SupabaseClient): ReadRepo {
  return {
    async searchLeaders(f) {
      let q = db.from('circle_leaders').select(LEADER_COLUMNS, { count: 'exact' });
      if (f.query) {
        const term = likeTerm(f.query);
        q = q.or(`name.ilike.%${term}%,circle_name.ilike.%${term}%`);
      }
      if (f.campus) q = q.ilike('campus', `%${likeTerm(f.campus)}%`);
      if (f.acpd) q = q.ilike('acpd', `%${likeTerm(f.acpd)}%`);
      if (f.status?.length) q = q.in('status', f.status);
      if (f.circleType) q = q.ilike('circle_type', `%${likeTerm(f.circleType)}%`);
      if (f.day) q = q.ilike('day', `%${likeTerm(f.day)}%`);
      if (f.leaderType) q = q.eq('leader_type', f.leaderType);
      if (f.followUpRequired !== undefined) q = q.eq('follow_up_required', f.followUpRequired);
      if (f.allowedCampuses) {
        // An empty allow-list means "no campus": match nothing rather than everything.
        q = f.allowedCampuses.length ? q.or(campusOrClause(f.allowedCampuses)) : q.eq('id', -1);
      }
      const res = must(await q.order('name').order('id').range(f.offset, f.offset + f.limit - 1), 'search leaders');
      return { rows: (res.data || []) as unknown as LeaderRow[], total: res.count ?? 0 };
    },

    async getLeader(id) {
      const res = must(await db.from('circle_leaders').select(LEADER_COLUMNS).eq('id', id).maybeSingle(), 'get leader');
      return (res.data as unknown as LeaderRow | null) ?? null;
    },

    async latestNote(leaderId) {
      const res = must(
        await db
          .from('notes')
          .select('id, content, created_at, created_by')
          .eq('circle_leader_id', leaderId)
          .order('created_at', { ascending: false })
          .limit(1),
        'latest note'
      );
      return ((res.data || [])[0] as NoteRow | undefined) ?? null;
    },

    async listNotes(leaderId, f) {
      let q = db
        .from('notes')
        .select('id, content, created_at, created_by', { count: 'exact' })
        .eq('circle_leader_id', leaderId);
      if (f.since) q = q.gte('created_at', f.since);
      const res = must(
        await q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(f.offset, f.offset + f.limit - 1),
        'list notes'
      );
      return { rows: (res.data || []) as NoteRow[], total: res.count ?? 0 };
    },

    async latestConnection(leaderId) {
      const res = must(
        await db
          .from('connections')
          .select('id, date_of_connection, connection_type_id, note, created_at')
          .eq('circle_leader_id', leaderId)
          .order('date_of_connection', { ascending: false })
          .order('id', { ascending: false })
          .limit(1),
        'latest connection'
      );
      return ((res.data || [])[0] as ConnectionRow | undefined) ?? null;
    },

    async listConnections(leaderId, f) {
      let q = db
        .from('connections')
        .select('id, date_of_connection, connection_type_id, note, created_at', { count: 'exact' })
        .eq('circle_leader_id', leaderId);
      if (f.since) q = q.gte('date_of_connection', f.since);
      const res = must(
        await q
          .order('date_of_connection', { ascending: false })
          .order('id', { ascending: false })
          .range(f.offset, f.offset + f.limit - 1),
        'list connections'
      );
      return { rows: (res.data || []) as ConnectionRow[], total: res.count ?? 0 };
    },

    async connectionTypeNames(ids) {
      const out = new Map<number, string>();
      if (!ids.length) return out;
      const res = must(await db.from('connection_types').select('id, name').in('id', ids), 'connection types');
      for (const row of (res.data || []) as { id: number; name: string }[]) out.set(row.id, row.name);
      return out;
    },

    async authorNames(userIds) {
      const out = new Map<string, string>();
      if (!userIds.length) return out;
      const res = must(await db.from('users').select('id, name').in('id', userIds), 'author names');
      for (const row of (res.data || []) as { id: string; name: string | null }[]) {
        if (row.name) out.set(row.id, row.name);
      }
      return out;
    },

    async leaderNames(ids) {
      const out = new Map<number, string>();
      if (!ids.length) return out;
      const res = must(await db.from('circle_leaders').select('id, name').in('id', ids), 'leader names');
      for (const row of (res.data || []) as { id: number; name: string }[]) out.set(row.id, row.name);
      return out;
    },

    async leaderBasics(ids) {
      const out = new Map<number, LeaderBasics>();
      if (!ids.length) return out;
      const res = must(await db.from('circle_leaders').select('id, name, circle_name, campus').in('id', ids), 'leader basics');
      for (const row of (res.data || []) as unknown as (LeaderBasics & { id: number })[]) {
        out.set(row.id, { name: row.name, circle_name: row.circle_name ?? null, campus: row.campus ?? null });
      }
      return out;
    },

    async leaderCampuses(ids) {
      const out = new Map<number, string | null>();
      if (!ids.length) return out;
      const res = must(await db.from('circle_leaders').select('id, campus').in('id', ids), 'leader campuses');
      for (const row of (res.data || []) as { id: number; campus: string | null }[]) out.set(row.id, row.campus ?? null);
      return out;
    },

    async userRole(userId) {
      const res = must(await db.from('users').select('role').eq('id', userId).maybeSingle(), 'user role');
      const role = (res.data as { role?: string | null } | null)?.role;
      return role ?? null;
    },

    async leaderIdsMatching(f) {
      const restricted = !!f.allowedCampuses;
      if (!restricted && !f.campus && !f.circle && f.leaderId === undefined) return null;
      if (f.allowedCampuses && !f.allowedCampuses.length) return { ids: [], capped: false };
      let q = db.from('circle_leaders').select('id');
      if (f.leaderId !== undefined) q = q.eq('id', f.leaderId);
      if (f.allowedCampuses) q = q.or(campusOrClause(f.allowedCampuses));
      if (f.campus) q = q.ilike('campus', `%${likeTerm(f.campus)}%`);
      if (f.circle) {
        const term = likeTerm(f.circle);
        q = q.or(`circle_name.ilike.%${term}%,name.ilike.%${term}%`);
      }
      const res = must(await q.order('id').limit(LEADER_ID_FILTER_CAP + 1), 'matching leaders');
      const ids = ((res.data || []) as { id: number }[]).map((r) => r.id);
      return { ids: ids.slice(0, LEADER_ID_FILTER_CAP), capped: ids.length > LEADER_ID_FILTER_CAP };
    },

    async listEventSummaries(f) {
      const q = summaryQuery(db.from('circle_event_summaries').select(SUMMARY_COLUMNS), f, true);
      const res = must(
        await q
          .order('occurrence', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(f.limit),
        'list event summaries'
      );
      return (res.data || []) as unknown as SummaryRow[];
    },

    async countEventSummaries(f) {
      const q = summaryQuery(db.from('circle_event_summaries').select('id', { count: 'exact', head: true }), f, false);
      const res = must(await q, 'count event summaries');
      return res.count ?? 0;
    },

    async getEventSummary(id) {
      const res = must(
        await db.from('circle_event_summaries').select(SUMMARY_DETAIL_COLUMNS).eq('id', id).maybeSingle(),
        'get event summary'
      );
      return (res.data as unknown as SummaryDetailRow | null) ?? null;
    },

    async leaderFollowUps(f) {
      let q = db.from('circle_leaders').select(LEADER_COLUMNS).eq('follow_up_required', true);
      if (f.leaderId !== undefined) q = q.eq('id', f.leaderId);
      const res = must(await q.order('follow_up_date', { ascending: true, nullsFirst: false }).limit(FOLLOW_UP_FETCH_CAP), 'leader follow-ups');
      const rows = (res.data || []) as unknown as LeaderRow[];
      return { rows, capped: rows.length >= FOLLOW_UP_FETCH_CAP };
    },

    async personalFollowUps(userId, f) {
      let q = db
        .from('todo_items')
        .select('id, text, completed, completed_at, due_date, notes, linked_leader_id')
        .eq('user_id', userId);
      q = f.leaderId !== undefined
        ? q.eq('linked_leader_id', f.leaderId)
        : q.or('todo_type.eq.follow_up,linked_leader_id.not.is.null');
      // Filtering on completion here, not after the fetch, so a long history of finished to-dos can't push
      // the open ones out of the capped page.
      if (f.completed !== undefined) q = q.eq('completed', f.completed);
      q = f.completed === true
        ? q.order('completed_at', { ascending: false, nullsFirst: false })
        : q.order('due_date', { ascending: true, nullsFirst: false });
      const res = must(await q.limit(FOLLOW_UP_FETCH_CAP), 'personal follow-ups');
      const rows = (res.data || []) as TodoRow[];
      return { rows, capped: rows.length >= FOLLOW_UP_FETCH_CAP };
    },
  };
}
