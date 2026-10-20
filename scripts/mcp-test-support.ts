// In-memory stand-ins for the Supabase-backed store and read repo, used only by scripts/test-mcp.ts.
import type { LeaderRow, ReadRepo, ConnectionRow, NoteRow, TodoRow } from '../lib/mcp/repo';
import type {
  AccessRow, AuditEntry, ClaimResult, CodeRow, GrantRow, McpStore, TokenRow,
} from '../lib/mcp/types';

export class MemoryStore implements McpStore {
  access = new Map<string, AccessRow>();
  users = new Set<string>();
  grants = new Map<string, GrantRow>();
  codes = new Map<string, CodeRow>();
  tokens = new Map<string, TokenRow>();
  auditLog: AuditEntry[] = [];
  private seq = 0;

  allowedRedirects: string[] = [];
  async listAllowedRedirectUris() { return [...this.allowedRedirects]; }
  async getAccess(userId: string) { return this.access.get(userId) ?? null; }
  async userExists(userId: string) { return this.users.has(userId); }
  async createGrant(g: Omit<GrantRow, 'id' | 'revoked_at'>) {
    const row: GrantRow = { ...g, id: `grant-${++this.seq}`, revoked_at: null };
    this.grants.set(row.id, row);
    return row;
  }
  async getGrant(id: string) { return this.grants.get(id) ?? null; }
  async revokeGrant(id: string) {
    const g = this.grants.get(id);
    if (g && !g.revoked_at) g.revoked_at = new Date(0).toISOString();
  }
  async touchGrant() {}
  async insertCode(c: CodeRow) { this.codes.set(c.code_hash, { ...c }); }
  async claimCode(hash: string, now: Date): Promise<ClaimResult<CodeRow>> {
    const row = this.codes.get(hash);
    if (!row) return { status: 'missing' };
    if (row.used_at) return { status: 'reused', row };
    row.used_at = now.toISOString();
    return new Date(row.expires_at) <= now ? { status: 'expired', row } : { status: 'claimed', row };
  }
  async insertToken(t: TokenRow) { this.tokens.set(t.token_hash, { ...t }); }
  async getToken(hash: string) { return this.tokens.get(hash) ?? null; }
  async claimRefreshToken(hash: string, now: Date): Promise<ClaimResult<TokenRow>> {
    const row = this.tokens.get(hash);
    if (!row || row.kind !== 'refresh') return { status: 'missing' };
    if (row.used_at) return { status: 'reused', row };
    row.used_at = now.toISOString();
    return new Date(row.expires_at) <= now ? { status: 'expired', row } : { status: 'claimed', row };
  }
  async audit(entry: AuditEntry) { this.auditLog.push(entry); }
}

const leader = (over: Partial<LeaderRow> & Pick<LeaderRow, 'id' | 'name'>): LeaderRow => ({
  campus: null, acpd: null, status: 'active', circle_name: null, circle_type: null, circle_location: null,
  day: null, time: null, frequency: null, meeting_start_date: null, leader_type: 'circle', team_name: null,
  director: null, check_in_cadence: null, last_check_in_date: null, event_summary_state: null,
  additional_leader_name: null, follow_up_required: false, follow_up_date: null, follow_up_time: null,
  follow_up_note: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z', ...over,
});

export const LEADERS: LeaderRow[] = [
  leader({ id: 1, name: 'Jordan Avery', campus: 'Lake Highlands', acpd: 'Alex Morgan', circle_name: 'LVT | S1 | Jordan Avery', circle_type: "Women's", day: 'Tuesday', status: 'active', follow_up_required: true, follow_up_date: '2026-10-10', follow_up_note: 'Check on her family situation' }),
  leader({ id: 2, name: 'Sam and Riley Brooks', campus: 'Flower Mound', acpd: 'Alex Morgan', circle_type: 'Young Adult | Coed', day: 'Wednesday', status: 'active', follow_up_required: true, follow_up_date: '2026-11-05' }),
  leader({ id: 3, name: 'Dana Whitfield', campus: 'Denton', acpd: 'Pat Rivera', day: 'Tuesday', status: 'paused' }),
  leader({ id: 4, name: "Marcus O'Hale", campus: 'Denton', acpd: 'Pat Rivera', status: 'on-boarding', follow_up_required: true }),
];

export const NOTES: (NoteRow & { circle_leader_id: number })[] = [
  { id: 11, circle_leader_id: 1, content: 'Great conversation about her new job.', created_at: '2026-10-05T15:00:00Z', created_by: 'user-a' },
  { id: 12, circle_leader_id: 1, content: 'Follow-up cleared.', created_at: '2026-09-01T15:00:00Z', created_by: 'user-b' },
  { id: 13, circle_leader_id: 1, content: 'x'.repeat(6000), created_at: '2026-08-01T15:00:00Z', created_by: null },
  { id: 21, circle_leader_id: 2, content: 'Met for coffee.', created_at: '2026-10-01T15:00:00Z', created_by: 'user-a' },
];

export const CONNECTIONS: (ConnectionRow & { circle_leader_id: number })[] = [
  { id: 31, circle_leader_id: 1, date_of_connection: '2026-10-04', connection_type_id: 1, note: 'Texted about Sunday', created_at: '2026-10-04T12:00:00Z' },
  { id: 32, circle_leader_id: 1, date_of_connection: '2026-09-20', connection_type_id: 2, note: null, created_at: '2026-09-20T12:00:00Z' },
];

export const TODOS: (TodoRow & { user_id: string })[] = [
  { id: 101, user_id: 'user-a', text: 'Call Mina', completed: false, completed_at: null, due_date: '2026-10-18', notes: null, linked_leader_id: 1 },
  { id: 102, user_id: 'user-a', text: 'Plan visit with Sam and Riley', completed: false, completed_at: null, due_date: '2026-10-25', notes: null, linked_leader_id: 2 },
  { id: 103, user_id: 'user-a', text: 'Thank Mina', completed: true, completed_at: '2026-10-02T10:00:00Z', due_date: '2026-10-01', notes: null, linked_leader_id: 1 },
  { id: 201, user_id: 'user-b', text: "SECRET: user B's private todo", completed: false, completed_at: null, due_date: '2026-10-19', notes: null, linked_leader_id: 3 },
];

export class MemoryRepo implements ReadRepo {
  calls: string[] = [];

  async searchLeaders(f: Parameters<ReadRepo['searchLeaders']>[0]) {
    this.calls.push('searchLeaders');
    const has = (v: string | null, needle?: string) => !needle || (v || '').toLowerCase().includes(needle.toLowerCase());
    const rows = LEADERS
      .filter((l) => has(l.name, f.query) || has(l.circle_name, f.query))
      .filter((l) => has(l.campus, f.campus) && has(l.acpd, f.acpd) && has(l.day, f.day) && has(l.circle_type, f.circleType))
      .filter((l) => !f.status?.length || f.status.includes(l.status || ''))
      .filter((l) => !f.leaderType || l.leader_type === f.leaderType)
      .filter((l) => f.followUpRequired === undefined || !!l.follow_up_required === f.followUpRequired)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    return { rows: rows.slice(f.offset, f.offset + f.limit), total: rows.length };
  }
  async getLeader(id: number) { return LEADERS.find((l) => l.id === id) ?? null; }
  async latestNote(id: number) {
    return NOTES.filter((n) => n.circle_leader_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  }
  async listNotes(id: number, f: { since?: string; limit: number; offset: number }) {
    const rows = NOTES.filter((n) => n.circle_leader_id === id && (!f.since || n.created_at >= f.since))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { rows: rows.slice(f.offset, f.offset + f.limit), total: rows.length };
  }
  async latestConnection(id: number) {
    return CONNECTIONS.filter((c) => c.circle_leader_id === id).sort((a, b) => b.date_of_connection.localeCompare(a.date_of_connection))[0] ?? null;
  }
  async listConnections(id: number, f: { since?: string; limit: number; offset: number }) {
    const rows = CONNECTIONS.filter((c) => c.circle_leader_id === id && (!f.since || c.date_of_connection >= f.since))
      .sort((a, b) => b.date_of_connection.localeCompare(a.date_of_connection));
    return { rows: rows.slice(f.offset, f.offset + f.limit), total: rows.length };
  }
  async connectionTypeNames(ids: number[]) {
    const all = new Map([[1, 'Text'], [2, 'Coffee']]);
    return new Map(ids.filter((i) => all.has(i)).map((i) => [i, all.get(i)!] as [number, string]));
  }
  async authorNames(ids: string[]) {
    const all = new Map([['user-a', 'Alex Morgan'], ['user-b', 'Pat Rivera']]);
    return new Map(ids.filter((i) => all.has(i)).map((i) => [i, all.get(i)!] as [string, string]));
  }
  async leaderNames(ids: number[]) {
    return new Map(LEADERS.filter((l) => ids.includes(l.id)).map((l) => [l.id, l.name] as [number, string]));
  }
  capped = false;
  async leaderFollowUps(f: { leaderId?: number }) {
    return {
      rows: LEADERS.filter((l) => l.follow_up_required && (f.leaderId === undefined || l.id === f.leaderId)),
      capped: this.capped,
    };
  }
  lastTodoFilter: { leaderId?: number; completed?: boolean } | null = null;
  async personalFollowUps(userId: string, f: { leaderId?: number; completed?: boolean }) {
    this.calls.push(`personalFollowUps:${userId}`);
    this.lastTodoFilter = f;
    return {
      rows: TODOS.filter((t) => t.user_id === userId
        && (f.leaderId === undefined || t.linked_leader_id === f.leaderId)
        && (f.completed === undefined || !!t.completed === f.completed)),
      capped: this.capped,
    };
  }
}
