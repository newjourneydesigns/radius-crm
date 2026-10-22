import type { SupabaseClient } from '@supabase/supabase-js';

/** The only contact columns any tool may read. Birthdays, CCB links and roster contacts are never selected. */
export interface ContactRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  additional_leader_name: string | null;
  additional_leader_email: string | null;
  additional_leader_phone: string | null;
}

export interface ContactRepo {
  getLeaderContact(id: number): Promise<ContactRow | null>;
}

export interface SavedNote {
  id: number;
  circle_leader_id: number;
  content: string;
  created_at: string;
  created_by: string | null;
}

export interface SavedConnection {
  id: number;
  circle_leader_id: number;
  date_of_connection: string;
  connection_type_id: number | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ConnectionType {
  id: number;
  name: string;
}

/** A write the database refused for a reason the caller can act on. Anything else is an unexpected failure. */
export type WriteErrorCode = 'leader_not_found' | 'idempotency_conflict' | 'connection_type_invalid';

export class WriteError extends Error {
  constructor(public code: WriteErrorCode) {
    super(code);
    this.name = 'WriteError';
    Object.setPrototypeOf(this, WriteError.prototype);
  }
}

export interface WriteContext {
  userId: string;
  grantId: string;
  idempotencyKey: string;
  /** Hash of the canonical request; the same key with a different hash is a conflict. */
  requestHash: string;
}

export interface WriteResult {
  recordId: string;
  /** true when this key had already been used with the same request and nothing new was written. */
  replayed: boolean;
}

/**
 * Every way a tool may change Radius: append one note, log one connection. There is no update, delete or
 * bulk method on purpose. Each write is one database transaction that also claims the idempotency key.
 */
export interface WriteRepo {
  addNote(ctx: WriteContext, input: { leaderId: number; content: string }): Promise<WriteResult>;
  logConnection(
    ctx: WriteContext,
    input: { leaderId: number; typeId: number; date: string; note: string | null; mirrorNote: string }
  ): Promise<WriteResult>;
  /** Independent reads used to verify a write after it returns. */
  readNote(id: number): Promise<SavedNote | null>;
  readConnection(id: number): Promise<SavedConnection | null>;
  activeConnectionTypes(): Promise<ConnectionType[]>;
}

function must<T>(result: { data: T; error: { message: string } | null }, what: string) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

const CODES: WriteErrorCode[] = ['leader_not_found', 'idempotency_conflict', 'connection_type_invalid'];

function rpcFailure(error: { message: string }): Error {
  const code = CODES.find((c) => error.message.includes(`mcp:${c}`));
  return code ? new WriteError(code) : new Error(`write failed: ${error.message}`);
}

export function createSupabaseContactRepo(db: SupabaseClient): ContactRepo {
  return {
    async getLeaderContact(id) {
      const res = must(
        await db
          .from('circle_leaders')
          .select('id, name, email, phone, additional_leader_name, additional_leader_email, additional_leader_phone')
          .eq('id', id)
          .maybeSingle(),
        'leader contact'
      );
      return (res as unknown as ContactRow | null) ?? null;
    },
  };
}

export function createSupabaseWriteRepo(db: SupabaseClient): WriteRepo {
  const parse = (data: unknown): WriteResult => {
    const row = data as { replayed?: boolean; record_id?: string } | null;
    if (!row?.record_id) throw new Error('write returned no record id');
    return { recordId: row.record_id, replayed: !!row.replayed };
  };

  return {
    async addNote(ctx, input) {
      const { data, error } = await db.rpc('mcp_add_note', {
        p_user_id: ctx.userId,
        p_grant_id: ctx.grantId,
        p_key: ctx.idempotencyKey,
        p_hash: ctx.requestHash,
        p_leader_id: input.leaderId,
        p_content: input.content,
      });
      if (error) throw rpcFailure(error);
      return parse(data);
    },

    async logConnection(ctx, input) {
      const { data, error } = await db.rpc('mcp_log_connection', {
        p_user_id: ctx.userId,
        p_grant_id: ctx.grantId,
        p_key: ctx.idempotencyKey,
        p_hash: ctx.requestHash,
        p_leader_id: input.leaderId,
        p_type_id: input.typeId,
        p_date: input.date,
        p_note: input.note,
        p_mirror_note: input.mirrorNote,
      });
      if (error) throw rpcFailure(error);
      return parse(data);
    },

    async readNote(id) {
      const res = must(
        await db.from('notes').select('id, circle_leader_id, content, created_at, created_by').eq('id', id).maybeSingle(),
        'read back note'
      );
      return (res as unknown as SavedNote | null) ?? null;
    },

    async readConnection(id) {
      const res = must(
        await db
          .from('connections')
          .select('id, circle_leader_id, date_of_connection, connection_type_id, note, created_at, created_by')
          .eq('id', id)
          .maybeSingle(),
        'read back connection'
      );
      return (res as unknown as SavedConnection | null) ?? null;
    },

    async activeConnectionTypes() {
      const res = must(await db.from('connection_types').select('id, name, active').order('id'), 'connection types');
      return ((res || []) as unknown as (ConnectionType & { active: boolean | null })[])
        .filter((t) => t.active !== false)
        .map((t) => ({ id: t.id, name: t.name }));
    },
  };
}
