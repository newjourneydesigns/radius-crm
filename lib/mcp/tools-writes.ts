import { DateTime } from 'luxon';
import { MCP_SCOPE_CONNECTIONS_WRITE, MCP_SCOPE_NOTES_WRITE } from './config';
import { authorizeLeader } from './access';
import { sha256Hex } from './crypto';
import { WriteError, type WriteContext } from './repo-write';
import { InputError } from './schema';
import type { JsonSchema } from './schema';
import {
  DATE_PATTERN, TIMEZONE, leaderIdProp, nullableString, radiusUrl,
  type ToolContext, type ToolDefinition,
} from './tool-kit';

export const NOTE_MAX_CHARS = 5000;
const CONNECTION_NOTE_MAX_CHARS = 2000;

const idempotencyKeyProp: JsonSchema = {
  type: 'string',
  pattern: '^[A-Za-z0-9_-]{8,64}$',
  description:
    'A unique id you create for THIS save (8–64 letters, digits, _ or -). Reuse the same key only to retry the same save after an error or timeout: ' +
    'a retry then returns the first result instead of saving twice. Use a new key for anything different.',
};

const CONFIRM =
  'Before calling, show the user exactly what will be saved and the leader it is for, and wait for them to say yes. ';

function writeContext(ctx: ToolContext, tool: string, key: unknown, payload: unknown): WriteContext {
  return {
    userId: ctx.principal.userId,
    grantId: ctx.principal.grantId,
    idempotencyKey: String(key),
    requestHash: sha256Hex(JSON.stringify([tool, payload])),
  };
}

/** The same key reused for a different save, a leader that vanished, and so on: things the caller can act on. */
function explain(err: unknown): never {
  if (err instanceof WriteError) {
    if (err.code === 'idempotency_conflict') {
      throw new InputError(
        'That idempotency_key was already used for a different save, so nothing was saved. Use a new key for a new save, or repeat the original arguments to retry the original.'
      );
    }
    if (err.code === 'leader_not_found') throw new InputError('That Circle Leader no longer exists. Nothing was saved.');
    if (err.code === 'connection_type_invalid') throw new InputError('That connection type is not active. Nothing was saved.');
  }
  throw err;
}

const readbackFailed = (what: string, id: string) =>
  new InputError(
    `The ${what} was saved as record ${id}, but reading it back did not match what was sent. Do not retry. Ask the user to open the leader in Radius and check it.`
  );

// ── add_leader_note ──────────────────────────────────────────────────────

const addLeaderNote: ToolDefinition = {
  name: 'add_leader_note',
  title: 'Add a note to a leader',
  description:
    CONFIRM +
    "Appends ONE note to a leader's profile, exactly as written, in the signed-in user's name with the time Radius records. " +
    'It cannot edit or delete notes, and it does not touch the leader’s follow-up or count as contacting them (use log_connection for that). ' +
    'Returns the saved note, read back from Radius.',
  requiredScope: MCP_SCOPE_NOTES_WRITE,
  writes: true,
  requiresAcpd: true,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['leader_id', 'content', 'idempotency_key'],
    properties: {
      leader_id: leaderIdProp,
      content: { type: 'string', minLength: 1, maxLength: NOTE_MAX_CHARS, description: `The note, saved exactly as given. Up to ${NOTE_MAX_CHARS} characters.` },
      idempotency_key: idempotencyKeyProp,
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      replayed: { type: 'boolean', description: 'true when this key had already saved this note; nothing new was written.' },
      verified: { type: 'boolean', description: 'true when the saved note was read back and matched.' },
      note: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          leader_id: { type: 'integer' },
          content: { type: 'string' },
          created_at: { type: 'string' },
          created_by_name: nullableString,
        },
        required: ['id', 'leader_id', 'content', 'created_at'],
      },
      radius_url: { type: 'string' },
    },
    required: ['replayed', 'verified', 'note', 'radius_url'],
  },
  // The note text is pastoral: the audit log records that a note was written, never what it said.
  redactArgs: (args) => ({
    leader_id: args.leader_id,
    idempotency_key: args.idempotency_key,
    content_length: typeof args.content === 'string' ? args.content.length : null,
    content_sha256_prefix: typeof args.content === 'string' ? sha256Hex(args.content).slice(0, 12) : null,
  }),
  async run(args, ctx) {
    const id = args.leader_id as number;
    const content = args.content as string;
    if (!content.trim()) throw new InputError('"content" is empty. There is nothing to save.');
    authorizeLeader(ctx.principal, await ctx.repo.getLeader(id), id);

    let result;
    try {
      result = await ctx.writes.addNote(writeContext(ctx, 'add_leader_note', args.idempotency_key, { id, content }), { leaderId: id, content });
    } catch (err) {
      explain(err);
    }

    const saved = await ctx.writes.readNote(Number(result.recordId));
    const authored = saved?.created_by === ctx.principal.userId;
    // On a replay the note may legitimately have been edited in the app since; only a fresh save must match byte for byte.
    if (!saved || saved.circle_leader_id !== id || (!result.replayed && (saved.content !== content || !authored))) {
      throw readbackFailed('note', result.recordId);
    }
    const names = await ctx.repo.authorNames(saved.created_by ? [saved.created_by] : []);

    return {
      structured: {
        replayed: result.replayed,
        verified: true,
        note: {
          id: saved.id,
          leader_id: saved.circle_leader_id,
          content: saved.content,
          created_at: saved.created_at,
          created_by_name: saved.created_by ? names.get(saved.created_by) ?? null : null,
        },
        radius_url: radiusUrl(ctx.config, id),
      },
      count: 1,
    };
  },
};

// ── log_connection ───────────────────────────────────────────────────────

const logConnection: ToolDefinition = {
  name: 'log_connection',
  title: 'Log a connection with a leader',
  description:
    CONFIRM +
    'Records ONE interaction with a leader (a call, text, coffee and so on) that already happened. `date_of_connection` is the day it happened (Central time, not in the future); ' +
    'Radius also records separately when it was entered, and by whom. Radius stores a date for connections, not a time of day. ' +
    'Side effects, the same as the Log Connection button in Radius: it adds a matching line to the leader’s notes timeline, moves their "last check-in" date forward (never back), ' +
    'resets their check-in cadence clock, and counts toward the Touchpoint Tracker. It does not clear or change any follow-up. ' +
    'To record a note WITHOUT counting it as contact, use add_leader_note instead. Returns the saved connection, read back from Radius.',
  requiredScope: MCP_SCOPE_CONNECTIONS_WRITE,
  writes: true,
  requiresAcpd: true,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['leader_id', 'connection_type', 'date_of_connection', 'idempotency_key'],
    properties: {
      leader_id: leaderIdProp,
      connection_type: { type: 'string', maxLength: 100, description: 'The name of an active connection type in Radius, such as "Text" or "Coffee". If it does not match, the error lists the valid names.' },
      date_of_connection: { type: 'string', pattern: DATE_PATTERN, description: 'The day the interaction happened (YYYY-MM-DD, Central time). Not in the future.' },
      note: { type: 'string', maxLength: CONNECTION_NOTE_MAX_CHARS, description: 'Optional detail, saved exactly as given.' },
      idempotency_key: idempotencyKeyProp,
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      replayed: { type: 'boolean' },
      verified: { type: 'boolean' },
      connection: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          leader_id: { type: 'integer' },
          connection_type: { type: 'string' },
          date_of_connection: { type: 'string', description: 'When the interaction happened.' },
          note: nullableString,
          entered_at: { type: 'string', description: 'When it was recorded in Radius.' },
          entered_by_name: nullableString,
        },
        required: ['id', 'leader_id', 'connection_type', 'date_of_connection', 'entered_at'],
      },
      effects: { type: 'array', items: { type: 'string' } },
      radius_url: { type: 'string' },
    },
    required: ['replayed', 'verified', 'connection', 'effects', 'radius_url'],
  },
  redactArgs: (args) => ({
    leader_id: args.leader_id,
    connection_type: args.connection_type,
    date_of_connection: args.date_of_connection,
    idempotency_key: args.idempotency_key,
    note_length: typeof args.note === 'string' ? args.note.length : 0,
    note_sha256_prefix: typeof args.note === 'string' && args.note ? sha256Hex(args.note).slice(0, 12) : null,
  }),
  async run(args, ctx) {
    const id = args.leader_id as number;
    const dateText = args.date_of_connection as string;
    const date = DateTime.fromISO(dateText, { zone: TIMEZONE });
    if (!date.isValid || date.toISODate() !== dateText) throw new InputError('"date_of_connection" is not a real date.');
    const today = DateTime.fromJSDate(ctx.now()).setZone(TIMEZONE).toISODate()!;
    if (dateText > today) throw new InputError(`"date_of_connection" is in the future. Today is ${today} (Central time).`);
    const note = typeof args.note === 'string' && args.note.trim() ? (args.note as string) : null;

    authorizeLeader(ctx.principal, await ctx.repo.getLeader(id), id);

    const types = await ctx.writes.activeConnectionTypes();
    const wanted = (args.connection_type as string).trim().toLowerCase();
    const type = types.find((t) => t.name.trim().toLowerCase() === wanted);
    if (!type) {
      throw new InputError(`"${args.connection_type}" is not an active connection type. Valid types: ${types.map((t) => t.name).join(', ') || '(none)'}.`);
    }

    const mirrorNote = `Connection on ${date.toFormat('LLL d, yyyy')} via ${type.name}${note ? `: ${note}` : ''}`;
    let result;
    try {
      result = await ctx.writes.logConnection(
        writeContext(ctx, 'log_connection', args.idempotency_key, { id, type: type.id, dateText, note }),
        { leaderId: id, typeId: type.id, date: dateText, note, mirrorNote }
      );
    } catch (err) {
      explain(err);
    }

    const saved = await ctx.writes.readConnection(Number(result.recordId));
    if (
      !saved ||
      saved.circle_leader_id !== id ||
      saved.connection_type_id !== type.id ||
      String(saved.date_of_connection).slice(0, 10) !== dateText ||
      (saved.note ?? null) !== note ||
      saved.created_by !== ctx.principal.userId
    ) {
      throw readbackFailed('connection', result.recordId);
    }
    const names = await ctx.repo.authorNames(saved.created_by ? [saved.created_by] : []);

    return {
      structured: {
        replayed: result.replayed,
        verified: true,
        connection: {
          id: saved.id,
          leader_id: saved.circle_leader_id,
          connection_type: type.name,
          date_of_connection: String(saved.date_of_connection).slice(0, 10),
          note: saved.note ?? null,
          entered_at: saved.created_at,
          entered_by_name: saved.created_by ? names.get(saved.created_by) ?? null : null,
        },
        effects: result.replayed
          ? ['No change: this save had already been made.']
          : [
              'Added a matching line to the leader’s notes timeline.',
              'Moved the leader’s last check-in date forward if this is more recent than the one on file.',
              'Counts toward the Touchpoint Tracker.',
              'Follow-ups were not changed.',
            ],
        radius_url: radiusUrl(ctx.config, id),
      },
      count: 1,
    };
  },
};

export const WRITE_TOOLS: readonly ToolDefinition[] = [addLeaderNote, logConnection];
