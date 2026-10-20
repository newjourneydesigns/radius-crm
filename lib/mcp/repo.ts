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
  limit: number;
  offset: number;
}

/**
 * Everything the tools may read. Contact details (phone, email, birthdays), prayer
 * points and every write path are intentionally absent from this interface.
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
