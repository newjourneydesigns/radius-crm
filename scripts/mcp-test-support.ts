// In-memory stand-ins for the Supabase-backed store and read repo, used only by scripts/test-mcp.ts.
import type { LeaderBasics, LeaderRow, ReadRepo, ConnectionRow, NoteRow, SummaryDetailRow, SummaryFilters, TodoRow } from '../lib/mcp/repo';
import {
  WriteError, type ConnectionType, type ContactRepo, type ContactRow, type SavedConnection, type SavedNote,
  type WriteContext, type WriteRepo, type WriteResult,
} from '../lib/mcp/repo-write';
import type {
  AccessRow, ActivityRow, AuditEntry, ClaimResult, CodeRow, GrantRow, McpStore, TokenRow,
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
  async listGrantsForUser(userId: string, now: Date) {
    return Array.from(this.grants.values())
      .filter((g) => g.user_id === userId && !g.revoked_at && new Date(g.expires_at) > now)
      .map((g) => ({ ...g, created_at: g.created_at ?? now.toISOString(), last_used_at: g.last_used_at ?? null }));
  }
  async revokeGrantForUser(userId: string, grantId: string) {
    const g = this.grants.get(grantId);
    if (!g || g.user_id !== userId || g.revoked_at) return false;
    g.revoked_at = new Date(0).toISOString();
    return true;
  }
  async revokeAllGrantsForUser(userId: string) {
    let n = 0;
    for (const g of Array.from(this.grants.values())) {
      if (g.user_id === userId && !g.revoked_at) { g.revoked_at = new Date(0).toISOString(); n++; }
    }
    return n;
  }
  async recentToolCalls(userId: string, limit: number): Promise<ActivityRow[]> {
    return this.auditLog
      .filter((e) => e.event === 'tool_call' && e.user_id === userId)
      .slice(-limit).reverse()
      .map((e) => ({ at: '2026-10-20T15:00:00Z', tool: e.tool ?? null, ok: e.ok ?? null, result_count: e.result_count ?? null }));
  }
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

export const CONNECTION_TYPES: ConnectionType[] = [
  { id: 1, name: 'Text' },
  { id: 2, name: 'Coffee' },
  { id: 3, name: 'Call' },
];

const sid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const summary = (n: number, over: Partial<SummaryDetailRow> & Pick<SummaryDetailRow, 'leader_id' | 'occurrence' | 'created_at'>): SummaryDetailRow => ({
  id: sid(n), ccb_event_id: `evt-${n}`, did_not_meet: false, status: 'submitted', reviewed_at: null, reviewed_by: null,
  did_not_meet_reason: null, topic: `Topic ${n}`, notes: `Notes ${n}`, prayer_requests: `Prayer ${n}`, info: null,
  attendee_ccb_ids: ['1', '2', '3'], manual_attendees: [{ first_name: 'Pat', phone: '555-0199' }],
  dynamic_responses: { q1: { label: 'How did it go?', value: 'Well' } }, info_update_requested: null,
  ccb_submitted_at: over.created_at, ccb_error: null, submitted_via: 'public_link', updated_at: over.created_at, ...over,
});

// Times are all in one format, as the database returns them, so ordering by string equals ordering by time.
export const SUMMARIES: SummaryDetailRow[] = [
  summary(1, { leader_id: 1, occurrence: '2026-10-13T23:30:00+00:00', created_at: '2026-10-14T15:00:00+00:00', reviewed_at: '2026-10-15T12:00:00+00:00', reviewed_by: 'user-a' }),
  summary(2, { leader_id: 1, occurrence: '2026-10-06T23:30:00+00:00', created_at: '2026-10-07T15:00:00+00:00', reviewed_at: '2026-10-08T12:00:00+00:00', reviewed_by: 'user-b' }),
  summary(3, { leader_id: 2, occurrence: '2026-10-14T23:30:00+00:00', created_at: '2026-10-15T15:00:00+00:00' }),
  summary(4, { leader_id: 3, occurrence: '2026-10-13T23:30:00+00:00', created_at: '2026-10-14T16:00:00+00:00' }),
  summary(5, { leader_id: 4, occurrence: '2026-10-13T23:30:00+00:00', created_at: '2026-10-14T16:00:00+00:00', reviewed_at: '2026-10-15T09:00:00+00:00', reviewed_by: null }),
  summary(6, { leader_id: 2, occurrence: '2026-09-29T23:30:00+00:00', created_at: '2026-09-30T15:00:00+00:00', status: 'failed', ccb_error: 'CCB refused the report', ccb_submitted_at: null }),
  // Sunday 2026-10-11 00:30 UTC is still Saturday evening in Central: belongs to the week starting 2026-10-04.
  summary(7, { leader_id: 4, occurrence: '2026-10-11T00:30:00+00:00', created_at: '2026-10-11T15:00:00+00:00', did_not_meet: true, did_not_meet_reason: 'Sick' }),
];

export const CONTACTS: Record<number, ContactRow> = {
  1: { id: 1, name: 'Jordan Avery', email: 'jordan@example.org', phone: '555-0101', additional_leader_name: 'Casey Avery', additional_leader_email: null, additional_leader_phone: '555-0102' },
  2: { id: 2, name: 'Sam and Riley Brooks', email: null, phone: '  ', additional_leader_name: null, additional_leader_email: null, additional_leader_phone: null },
  3: { id: 3, name: 'Dana Whitfield', email: 'dana@example.org', phone: null, additional_leader_name: ' ', additional_leader_email: '', additional_leader_phone: null },
  4: { id: 4, name: "Marcus O'Hale", email: null, phone: '555-0104', additional_leader_name: null, additional_leader_email: null, additional_leader_phone: '555-0105' },
};

export class MemoryRepo implements ReadRepo {
  calls: string[] = [];
  // Per-instance copies: the write tools change these, and one test must never see another's changes.
  leaders: LeaderRow[] = LEADERS.map((l) => ({ ...l }));
  notes = NOTES.map((n) => ({ ...n }));
  connections = CONNECTIONS.map((c) => ({ ...c }));
  summaries: SummaryDetailRow[] = SUMMARIES.map((x) => ({ ...x }));
  roles = new Map<string, string>([['user-a', 'ACPD'], ['user-b', 'ACPD'], ['user-v', 'viewer']]);
  userNames = new Map([['user-a', 'Alex Morgan'], ['user-b', 'Pat Rivera']]);

  async searchLeaders(f: Parameters<ReadRepo['searchLeaders']>[0]) {
    this.calls.push('searchLeaders');
    const has = (v: string | null, needle?: string) => !needle || (v || '').toLowerCase().includes(needle.toLowerCase());
    const rows = LEADERS
      .filter((l) => has(l.name, f.query) || has(l.circle_name, f.query))
      .filter((l) => has(l.campus, f.campus) && has(l.acpd, f.acpd) && has(l.day, f.day) && has(l.circle_type, f.circleType))
      .filter((l) => !f.allowedCampuses || f.allowedCampuses.some((c) => (l.campus || '').toLowerCase() === c.toLowerCase()))
      .filter((l) => !f.status?.length || f.status.includes(l.status || ''))
      .filter((l) => !f.leaderType || l.leader_type === f.leaderType)
      .filter((l) => f.followUpRequired === undefined || !!l.follow_up_required === f.followUpRequired)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    return { rows: rows.slice(f.offset, f.offset + f.limit), total: rows.length };
  }
  async getLeader(id: number) { return this.leaders.find((l) => l.id === id) ?? null; }
  async latestNote(id: number) {
    return this.notes.filter((n) => n.circle_leader_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  }
  async listNotes(id: number, f: { since?: string; limit: number; offset: number }) {
    const rows = this.notes.filter((n) => n.circle_leader_id === id && (!f.since || n.created_at >= f.since))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { rows: rows.slice(f.offset, f.offset + f.limit), total: rows.length };
  }
  async latestConnection(id: number) {
    return this.connections.filter((c) => c.circle_leader_id === id).sort((a, b) => b.date_of_connection.localeCompare(a.date_of_connection))[0] ?? null;
  }
  async listConnections(id: number, f: { since?: string; limit: number; offset: number }) {
    const rows = this.connections.filter((c) => c.circle_leader_id === id && (!f.since || c.date_of_connection >= f.since))
      .sort((a, b) => b.date_of_connection.localeCompare(a.date_of_connection));
    return { rows: rows.slice(f.offset, f.offset + f.limit), total: rows.length };
  }
  async connectionTypeNames(ids: number[]) {
    const all = new Map(CONNECTION_TYPES.map((t) => [t.id, t.name] as [number, string]));
    return new Map(ids.filter((i) => all.has(i)).map((i) => [i, all.get(i)!] as [number, string]));
  }
  async authorNames(ids: string[]) {
    const all = this.userNames;
    return new Map(ids.filter((i) => all.has(i)).map((i) => [i, all.get(i)!] as [string, string]));
  }
  async leaderNames(ids: number[]) {
    return new Map(this.leaders.filter((l) => ids.includes(l.id)).map((l) => [l.id, l.name] as [number, string]));
  }
  capped = false;
  async leaderFollowUps(f: { leaderId?: number }) {
    return {
      rows: this.leaders.filter((l) => l.follow_up_required && (f.leaderId === undefined || l.id === f.leaderId)),
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

  async leaderBasics(ids: number[]) {
    return new Map(this.leaders.filter((l) => ids.includes(l.id)).map((l) => [l.id, { name: l.name, circle_name: l.circle_name, campus: l.campus }] as [number, LeaderBasics]));
  }
  async leaderCampuses(ids: number[]) {
    return new Map(this.leaders.filter((l) => ids.includes(l.id)).map((l) => [l.id, l.campus] as [number, string | null]));
  }
  async userRole(userId: string) { this.calls.push(`userRole:${userId}`); return this.roles.get(userId) ?? null; }
  async leaderIdsMatching(f: { allowedCampuses?: string[] | null; campus?: string; circle?: string; leaderId?: number }) {
    this.calls.push('leaderIdsMatching');
    if (!f.allowedCampuses && !f.campus && !f.circle && f.leaderId === undefined) return null;
    const has = (v: string | null, needle: string) => (v || '').toLowerCase().includes(needle.toLowerCase());
    const ids = this.leaders
      .filter((l) => f.leaderId === undefined || l.id === f.leaderId)
      .filter((l) => !f.allowedCampuses || f.allowedCampuses.some((c) => (l.campus || '').toLowerCase() === c.toLowerCase()))
      .filter((l) => !f.campus || has(l.campus, f.campus))
      .filter((l) => !f.circle || has(l.circle_name, f.circle) || has(l.name, f.circle))
      .map((l) => l.id);
    return { ids, capped: this.leaderIdCapped };
  }
  leaderIdCapped = false;

  private matchingSummaries(f: SummaryFilters) {
    return this.summaries.filter((s) => {
      if (f.leaderIds && !f.leaderIds.includes(s.leader_id)) return false;
      if (f.occurrenceFrom && !(Date.parse(s.occurrence) >= Date.parse(f.occurrenceFrom))) return false;
      if (f.occurrenceToExclusive && !(Date.parse(s.occurrence) < Date.parse(f.occurrenceToExclusive))) return false;
      if (f.review === 'unreviewed') return !s.reviewed_at;
      if (f.review === 'reviewed_by_anyone') return !!s.reviewed_at;
      if (f.review === 'reviewed_by_me') return !!s.reviewed_at && s.reviewed_by === f.userId;
      if (f.review === 'reviewed_by_other') return !!s.reviewed_at && s.reviewed_by !== f.userId;
      return true;
    });
  }
  async listEventSummaries(f: SummaryFilters) {
    this.calls.push('listEventSummaries');
    const key = (s: { occurrence: string; created_at: string; id: string }) => [s.occurrence, s.created_at, s.id];
    const cmp = (a: string[], b: string[]) => { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; } return 0; };
    return this.matchingSummaries(f)
      .sort((a, b) => cmp(key(b), key(a)))
      .filter((s) => !f.after || cmp(key(s), key(f.after)) < 0)
      .slice(0, f.limit)
      .map((s) => ({ ...s }));
  }
  async countEventSummaries(f: SummaryFilters) { return this.matchingSummaries(f).length; }
  async getEventSummary(id: string) { this.calls.push('getEventSummary'); return this.summaries.find((s) => s.id === id) ?? null; }
}


export class MemoryContactRepo implements ContactRepo {
  reads: number[] = [];
  async getLeaderContact(id: number) { this.reads.push(id); return CONTACTS[id] ? { ...CONTACTS[id] } : null; }
}

/**
 * Models the SQL functions: claim the idempotency key and write in one step, so a failure leaves neither
 * a record nor a used key. Nothing here can update or delete a record.
 */
export class MemoryWriteRepo implements WriteRepo {
  log = new Map<string, { hash: string; recordId: string; tool: string; contentLength: number }>();
  /** 'before': the write fails and nothing changes. 'after': it commits but the reply is lost. */
  failNext: 'before' | 'after' | null = null;
  /** Lets a test alter the stored record to prove the read-back catches it. */
  tamperNote: ((n: SavedNote) => void) | null = null;
  tamperConnection: ((c: SavedConnection) => void) | null = null;
  writeCalls = 0;
  types: ConnectionType[] = CONNECTION_TYPES.map((t) => ({ ...t }));

  constructor(private repo: MemoryRepo, private nowIso: () => string) {}

  private claim(ctx: WriteContext, tool: string, contentLength: number): WriteResult | null {
    const key = `${ctx.userId}|${tool}|${ctx.idempotencyKey}`;
    const existing = this.log.get(key);
    if (!existing) return null;
    if (existing.hash !== ctx.requestHash) throw new WriteError('idempotency_conflict');
    return { recordId: existing.recordId, replayed: true };
  }
  private commit(ctx: WriteContext, tool: string, recordId: string, contentLength: number): WriteResult {
    this.log.set(`${ctx.userId}|${tool}|${ctx.idempotencyKey}`, { hash: ctx.requestHash, recordId, tool, contentLength });
    if (this.failNext === 'after') { this.failNext = null; throw new Error('connection lost after commit'); }
    return { recordId, replayed: false };
  }
  private maybeFail() {
    if (this.failNext === 'before') { this.failNext = null; throw new Error('database unavailable'); }
  }
  private nextId(rows: { id: number }[]) { return rows.reduce((m, r) => Math.max(m, r.id), 0) + 1; }

  async addNote(ctx: WriteContext, input: { leaderId: number; content: string }) {
    this.writeCalls++;
    const replay = this.claim(ctx, 'add_leader_note', input.content.length);
    if (replay) return replay;
    this.maybeFail();
    if (!this.repo.leaders.some((l) => l.id === input.leaderId)) throw new WriteError('leader_not_found');
    const id = this.nextId(this.repo.notes);
    this.repo.notes.push({ id, circle_leader_id: input.leaderId, content: input.content, created_at: this.nowIso(), created_by: ctx.userId });
    return this.commit(ctx, 'add_leader_note', String(id), input.content.length);
  }

  async logConnection(ctx: WriteContext, input: { leaderId: number; typeId: number; date: string; note: string | null; mirrorNote: string }) {
    this.writeCalls++;
    const replay = this.claim(ctx, 'log_connection', (input.note ?? '').length);
    if (replay) return replay;
    this.maybeFail();
    const leader = this.repo.leaders.find((l) => l.id === input.leaderId);
    if (!leader) throw new WriteError('leader_not_found');
    if (!this.types.some((t) => t.id === input.typeId)) throw new WriteError('connection_type_invalid');
    const id = this.nextId(this.repo.connections);
    this.repo.connections.push({
      id, circle_leader_id: input.leaderId, date_of_connection: input.date, connection_type_id: input.typeId,
      note: input.note, created_at: this.nowIso(), created_by: ctx.userId,
    } as never);
    this.repo.notes.push({ id: this.nextId(this.repo.notes), circle_leader_id: input.leaderId, content: input.mirrorNote, created_at: this.nowIso(), created_by: ctx.userId });
    if (!leader.last_check_in_date || leader.last_check_in_date < input.date) leader.last_check_in_date = input.date;
    return this.commit(ctx, 'log_connection', String(id), (input.note ?? '').length);
  }

  async readNote(id: number): Promise<SavedNote | null> {
    const n = this.repo.notes.find((x) => x.id === id);
    if (!n) return null;
    const out: SavedNote = { id: n.id, circle_leader_id: n.circle_leader_id, content: n.content ?? '', created_at: n.created_at, created_by: n.created_by };
    this.tamperNote?.(out);
    return out;
  }
  async readConnection(id: number): Promise<SavedConnection | null> {
    const c = this.repo.connections.find((x) => x.id === id) as (ConnectionRow & { circle_leader_id: number; created_by?: string | null }) | undefined;
    if (!c) return null;
    const out: SavedConnection = {
      id: c.id, circle_leader_id: c.circle_leader_id, date_of_connection: c.date_of_connection,
      connection_type_id: c.connection_type_id, note: c.note, created_at: c.created_at, created_by: c.created_by ?? null,
    };
    this.tamperConnection?.(out);
    return out;
  }
  async activeConnectionTypes() { return this.types.map((t) => ({ ...t })); }
}
