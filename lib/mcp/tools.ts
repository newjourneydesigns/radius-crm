import { DateTime } from 'luxon';
import { MCP_SCOPE_READ, type McpConfig } from './config';
import type { Principal } from './oauth';
import { likeTerm, type ConnectionRow, type LeaderRow, type NoteRow, type ReadRepo, type TodoRow } from './repo';
import { InputError, parseArguments, type JsonSchema } from './schema';

export const TIMEZONE = 'America/Chicago';

export interface ToolContext {
  repo: ReadRepo;
  principal: Principal;
  config: McpConfig;
  now: () => Date;
}

export interface ToolResult {
  structured: Record<string, unknown>;
  /** How many records came back; recorded in the audit log, never their content. */
  count: number;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  requiredScope: string;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

// ── shared pieces ────────────────────────────────────────────────────────

const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';
const nullableString: JsonSchema = { anyOf: [{ type: 'string' }, { type: 'null' }] };

const limitProp = (max: number, fallback: number): JsonSchema => ({
  type: 'integer',
  minimum: 1,
  maximum: max,
  default: fallback,
  description: `Page size, 1–${max}. Defaults to ${fallback}.`,
});
const cursorProp: JsonSchema = {
  type: 'string',
  maxLength: 200,
  description: 'Pass the next_cursor from the previous response to get the next page.',
};
const leaderIdProp: JsonSchema = {
  type: 'integer',
  minimum: 1,
  description: 'The Radius Circle Leader id, as returned by search_leaders.',
};

const radiusUrl = (config: McpConfig, leaderId: number) => `${config.baseUrl}/circle/${leaderId}`;

const encodeCursor = (offset: number) => Buffer.from(JSON.stringify({ o: offset })).toString('base64url');

function decodeCursor(cursor: unknown): number {
  if (cursor === undefined) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (Number.isInteger(parsed?.o) && parsed.o >= 0 && parsed.o <= 100000) return parsed.o;
  } catch {
    // falls through to the error below
  }
  throw new InputError('cursor is not valid. Use the next_cursor from a previous response.');
}

const nextCursor = (offset: number, returned: number, total: number) =>
  offset + returned < total ? encodeCursor(offset + returned) : null;

function dateArg(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (!DateTime.fromISO(String(value)).isValid) throw new InputError(`"${name}" is not a real date.`);
  return String(value);
}

const trimText = (text: string | null, max: number) => (text && text.length > max ? `${text.slice(0, max)}…` : text);

function leaderSummary(row: LeaderRow, config: McpConfig) {
  return {
    id: row.id,
    name: row.name,
    campus: row.campus ?? null,
    acpd: row.acpd ?? null,
    status: row.status ?? null,
    leader_type: row.leader_type ?? null,
    circle_name: row.circle_name ?? null,
    circle_type: row.circle_type ?? null,
    circle_location: row.circle_location ?? null,
    day: row.day ?? null,
    time: row.time ?? null,
    frequency: row.frequency ?? null,
    check_in_cadence: row.check_in_cadence ?? null,
    last_check_in_date: row.last_check_in_date ?? null,
    follow_up_required: !!row.follow_up_required,
    follow_up_date: row.follow_up_date ?? null,
    radius_url: radiusUrl(config, row.id),
  };
}

const leaderSummarySchema: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    campus: nullableString,
    acpd: nullableString,
    status: nullableString,
    leader_type: nullableString,
    circle_name: nullableString,
    circle_type: nullableString,
    circle_location: nullableString,
    day: nullableString,
    time: nullableString,
    frequency: nullableString,
    check_in_cadence: nullableString,
    last_check_in_date: nullableString,
    follow_up_required: { type: 'boolean' },
    follow_up_date: nullableString,
    radius_url: { type: 'string' },
  },
  required: ['id', 'name', 'radius_url'],
};

const pageProps = {
  total: { type: 'integer', description: 'How many records match in all, across every page.' },
  next_cursor: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'null when there are no more pages.' },
} as const;

// ── search_leaders ───────────────────────────────────────────────────────

const searchLeaders: ToolDefinition = {
  name: 'search_leaders',
  title: 'Search Circle Leaders',
  description:
    'Search and list Circle Leaders and host-team leaders. All filters are optional and combine (AND); text filters match part of the value, ignoring case. ' +
    'Returns a page of leaders with stable ids and a Radius link. Contact details are never included.',
  requiredScope: MCP_SCOPE_READ,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: { type: 'string', maxLength: 100, description: "Part of the leader's name or circle name." },
      campus: { type: 'string', maxLength: 100 },
      acpd: { type: 'string', maxLength: 100, description: 'Name of the ACPD (director) assigned to the circle.' },
      status: {
        type: 'array',
        maxItems: 10,
        items: { type: 'string', maxLength: 40 },
        description: 'Exact status values, e.g. "active", "paused", "on-boarding", "off-boarding", "invited".',
      },
      circle_type: { type: 'string', maxLength: 100 },
      day: { type: 'string', maxLength: 20, description: 'Meeting day, e.g. "Tuesday".' },
      leader_type: { type: 'string', enum: ['circle', 'host_team'] },
      follow_up_required: { type: 'boolean', description: 'true = only leaders flagged for follow-up.' },
      limit: limitProp(50, 25),
      cursor: cursorProp,
    },
  },
  outputSchema: {
    type: 'object',
    properties: { items: { type: 'array', items: leaderSummarySchema }, ...pageProps },
    required: ['items', 'total', 'next_cursor'],
  },
  async run(args, ctx) {
    const offset = decodeCursor(args.cursor);
    const limit = args.limit as number;
    for (const key of ['query', 'campus', 'acpd', 'circle_type', 'day'] as const) {
      if (typeof args[key] === 'string' && !likeTerm(args[key] as string)) {
        throw new InputError(`"${key}" has no searchable letters or numbers.`);
      }
    }
    const { rows, total } = await ctx.repo.searchLeaders({
      query: args.query as string | undefined,
      campus: args.campus as string | undefined,
      acpd: args.acpd as string | undefined,
      status: args.status as string[] | undefined,
      circleType: args.circle_type as string | undefined,
      day: args.day as string | undefined,
      leaderType: args.leader_type as string | undefined,
      followUpRequired: args.follow_up_required as boolean | undefined,
      limit,
      offset,
    });
    return {
      structured: {
        items: rows.map((r) => leaderSummary(r, ctx.config)),
        total,
        next_cursor: nextCursor(offset, rows.length, total),
      },
      count: rows.length,
    };
  },
};

// ── get_leader ───────────────────────────────────────────────────────────

const getLeader: ToolDefinition = {
  name: 'get_leader',
  title: 'Get a Circle Leader',
  description:
    "Read one leader's profile and circle information: campus, ACPD, status, meeting day/time/frequency, check-in cadence, open follow-up, plus their most recent note and most recent connection. " +
    'Use list_leader_notes and list_leader_connections for the full history. Phone, email and birthdays are not included.',
  requiredScope: MCP_SCOPE_READ,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['leader_id'],
    properties: { leader_id: leaderIdProp },
  },
  outputSchema: {
    type: 'object',
    properties: {
      leader: {
        type: 'object',
        properties: {
          ...leaderSummarySchema.properties,
          meeting_start_date: nullableString,
          team_name: nullableString,
          director: nullableString,
          additional_leader_name: nullableString,
          event_summary_state: nullableString,
          follow_up_time: nullableString,
          follow_up_note: nullableString,
          created_at: nullableString,
          updated_at: nullableString,
        },
        required: ['id', 'name', 'radius_url'],
      },
      last_note: { type: 'object' },
      last_connection: { type: 'object' },
    },
    required: ['leader'],
  },
  async run(args, ctx) {
    const id = args.leader_id as number;
    const row = await ctx.repo.getLeader(id);
    if (!row) throw new InputError(`No Circle Leader with id ${id}.`);

    const [note, connection] = await Promise.all([ctx.repo.latestNote(id), ctx.repo.latestConnection(id)]);
    const authors = note?.created_by ? await ctx.repo.authorNames([note.created_by]) : new Map<string, string>();
    const types = connection?.connection_type_id
      ? await ctx.repo.connectionTypeNames([connection.connection_type_id])
      : new Map<number, string>();

    return {
      structured: {
        leader: {
          ...leaderSummary(row, ctx.config),
          meeting_start_date: row.meeting_start_date ?? null,
          team_name: row.team_name ?? null,
          director: row.director ?? null,
          additional_leader_name: row.additional_leader_name ?? null,
          event_summary_state: row.event_summary_state ?? null,
          follow_up_time: row.follow_up_time ?? null,
          follow_up_note: row.follow_up_note ?? null,
          created_at: row.created_at ?? null,
          updated_at: row.updated_at ?? null,
        },
        last_note: note ? shapeNote(note, authors) : null,
        last_connection: connection ? shapeConnection(connection, types) : null,
      },
      count: 1,
    };
  },
};

// ── list_leader_notes ────────────────────────────────────────────────────

const NOTE_CHAR_CAP = 5000;

function shapeNote(note: NoteRow, authors: Map<string, string>) {
  const content = note.content ?? '';
  return {
    id: note.id,
    content: trimText(content, NOTE_CHAR_CAP) ?? '',
    truncated: content.length > NOTE_CHAR_CAP,
    created_at: note.created_at,
    created_by_name: note.created_by ? authors.get(note.created_by) ?? null : null,
  };
}

const listLeaderNotes: ToolDefinition = {
  name: 'list_leader_notes',
  title: "List a leader's notes",
  description:
    "Read the relationship notes on a leader's profile, newest first. Note authors are shown by name. " +
    'Clearing a follow-up in Radius also leaves a note, so follow-up resolutions show up here.',
  requiredScope: MCP_SCOPE_READ,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['leader_id'],
    properties: {
      leader_id: leaderIdProp,
      since: { type: 'string', pattern: DATE_PATTERN, description: 'Only notes created on or after this date (YYYY-MM-DD).' },
      limit: limitProp(50, 20),
      cursor: cursorProp,
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      leader_id: { type: 'integer' },
      radius_url: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            content: { type: 'string' },
            truncated: { type: 'boolean' },
            created_at: { type: 'string' },
            created_by_name: nullableString,
          },
          required: ['id', 'content', 'created_at'],
        },
      },
      ...pageProps,
    },
    required: ['leader_id', 'items', 'total', 'next_cursor'],
  },
  async run(args, ctx) {
    const id = args.leader_id as number;
    const offset = decodeCursor(args.cursor);
    if (!(await ctx.repo.getLeader(id))) throw new InputError(`No Circle Leader with id ${id}.`);
    const { rows, total } = await ctx.repo.listNotes(id, {
      since: dateArg(args.since, 'since'),
      limit: args.limit as number,
      offset,
    });
    const authors = await ctx.repo.authorNames(Array.from(new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v))));
    return {
      structured: {
        leader_id: id,
        radius_url: radiusUrl(ctx.config, id),
        items: rows.map((r) => shapeNote(r, authors)),
        total,
        next_cursor: nextCursor(offset, rows.length, total),
      },
      count: rows.length,
    };
  },
};

// ── list_leader_connections ──────────────────────────────────────────────

function shapeConnection(row: ConnectionRow, types: Map<number, string>) {
  return {
    id: row.id,
    date_of_connection: row.date_of_connection,
    connection_type: row.connection_type_id ? types.get(row.connection_type_id) ?? null : null,
    note: trimText(row.note, NOTE_CHAR_CAP),
    created_at: row.created_at,
  };
}

const listLeaderConnections: ToolDefinition = {
  name: 'list_leader_connections',
  title: "List a leader's interaction history",
  description:
    'Read the logged interactions with a leader (calls, texts, coffees, visits and so on), newest first, with the date, type and any note.',
  requiredScope: MCP_SCOPE_READ,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['leader_id'],
    properties: {
      leader_id: leaderIdProp,
      since: { type: 'string', pattern: DATE_PATTERN, description: 'Only interactions on or after this date (YYYY-MM-DD).' },
      limit: limitProp(50, 20),
      cursor: cursorProp,
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      leader_id: { type: 'integer' },
      radius_url: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            date_of_connection: { type: 'string' },
            connection_type: nullableString,
            note: nullableString,
            created_at: { type: 'string' },
          },
          required: ['id', 'date_of_connection'],
        },
      },
      ...pageProps,
    },
    required: ['leader_id', 'items', 'total', 'next_cursor'],
  },
  async run(args, ctx) {
    const id = args.leader_id as number;
    const offset = decodeCursor(args.cursor);
    if (!(await ctx.repo.getLeader(id))) throw new InputError(`No Circle Leader with id ${id}.`);
    const { rows, total } = await ctx.repo.listConnections(id, {
      since: dateArg(args.since, 'since'),
      limit: args.limit as number,
      offset,
    });
    const types = await ctx.repo.connectionTypeNames(
      Array.from(new Set(rows.map((r) => r.connection_type_id).filter((v): v is number => !!v)))
    );
    return {
      structured: {
        leader_id: id,
        radius_url: radiusUrl(ctx.config, id),
        items: rows.map((r) => shapeConnection(r, types)),
        total,
        next_cursor: nextCursor(offset, rows.length, total),
      },
      count: rows.length,
    };
  },
};

// ── list_follow_ups ──────────────────────────────────────────────────────

type FollowUpStatus = 'overdue' | 'upcoming' | 'completed';

interface FollowUpItem {
  id: string;
  source: 'leader_follow_up' | 'personal_todo';
  status: FollowUpStatus;
  leader_id: number | null;
  leader_name: string | null;
  summary: string | null;
  due_date: string | null;
  due_time: string | null;
  completed_at: string | null;
  radius_url: string | null;
}

const STATUS_ORDER: Record<FollowUpStatus, number> = { overdue: 0, upcoming: 1, completed: 2 };

const listFollowUps: ToolDefinition = {
  name: 'list_follow_ups',
  title: 'List follow-ups',
  description:
    'List follow-ups, soonest first within each status. Two sources are combined and labelled by `source`: ' +
    '"leader_follow_up" is the follow-up flag and date on a leader (shared by everyone in Radius; it has no completed state — clearing it removes it and leaves a note, so check list_leader_notes), and ' +
    '"personal_todo" is the signed-in user\'s own to-do items about leaders, which can be completed. ' +
    '"overdue" means due before today in Central time; undated open follow-ups count as upcoming.',
  requiredScope: MCP_SCOPE_READ,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: ['upcoming', 'overdue', 'completed', 'all'], default: 'upcoming' },
      leader_id: { ...leaderIdProp, description: 'Only follow-ups about this leader.' },
      from: { type: 'string', pattern: DATE_PATTERN, description: 'Due on or after this date (YYYY-MM-DD).' },
      to: { type: 'string', pattern: DATE_PATTERN, description: 'Due on or before this date (YYYY-MM-DD).' },
      limit: limitProp(100, 25),
      cursor: cursorProp,
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      as_of_date: { type: 'string', description: "Today's date in Central time; what overdue was measured against." },
      timezone: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            source: { type: 'string', enum: ['leader_follow_up', 'personal_todo'] },
            status: { type: 'string', enum: ['overdue', 'upcoming', 'completed'] },
            leader_id: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
            leader_name: nullableString,
            summary: nullableString,
            due_date: nullableString,
            due_time: nullableString,
            completed_at: nullableString,
            radius_url: nullableString,
          },
          required: ['id', 'source', 'status'],
        },
      },
      ...pageProps,
    },
    required: ['as_of_date', 'timezone', 'items', 'total', 'next_cursor'],
  },
  async run(args, ctx) {
    const wanted = args.status as 'upcoming' | 'overdue' | 'completed' | 'all';
    const leaderId = args.leader_id as number | undefined;
    const from = dateArg(args.from, 'from');
    const to = dateArg(args.to, 'to');
    const offset = decodeCursor(args.cursor);
    const limit = args.limit as number;
    const today = DateTime.fromJSDate(ctx.now()).setZone(TIMEZONE).toISODate()!;
    const classify = (due: string | null): FollowUpStatus => (due && due < today ? 'overdue' : 'upcoming');

    const [leaderRows, todoRows] = await Promise.all([
      wanted === 'completed' ? Promise.resolve<LeaderRow[]>([]) : ctx.repo.leaderFollowUps({ leaderId }),
      // The user id comes from the verified token; there is no tool argument that can change it.
      ctx.repo.personalFollowUps(ctx.principal.userId, { leaderId }),
    ]);

    const items: FollowUpItem[] = [];
    for (const row of leaderRows) {
      items.push({
        id: `leader:${row.id}`,
        source: 'leader_follow_up',
        status: classify(row.follow_up_date),
        leader_id: row.id,
        leader_name: row.name,
        summary: trimText(row.follow_up_note ?? null, 1000),
        due_date: row.follow_up_date ?? null,
        due_time: row.follow_up_time ?? null,
        completed_at: null,
        radius_url: radiusUrl(ctx.config, row.id),
      });
    }
    const todoLeaderIds = Array.from(new Set(todoRows.map((t: TodoRow) => t.linked_leader_id).filter((v): v is number => !!v)));
    const names = await ctx.repo.leaderNames(todoLeaderIds);
    for (const todo of todoRows) {
      items.push({
        id: `todo:${todo.id}`,
        source: 'personal_todo',
        status: todo.completed ? 'completed' : classify(todo.due_date),
        leader_id: todo.linked_leader_id ?? null,
        leader_name: todo.linked_leader_id ? names.get(todo.linked_leader_id) ?? null : null,
        summary: trimText(todo.text, 1000),
        due_date: todo.due_date ?? null,
        due_time: null,
        completed_at: todo.completed_at ?? null,
        radius_url: todo.linked_leader_id ? radiusUrl(ctx.config, todo.linked_leader_id) : null,
      });
    }

    const matching = items
      .filter((i) => wanted === 'all' || i.status === wanted)
      .filter((i) => (from ? !!i.due_date && i.due_date >= from : true))
      .filter((i) => (to ? !!i.due_date && i.due_date <= to : true))
      .sort((a, b) => {
        if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        if (a.status === 'completed') return (b.completed_at || '').localeCompare(a.completed_at || '');
        if (a.due_date === b.due_date) return a.id.localeCompare(b.id);
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });

    const page = matching.slice(offset, offset + limit);
    return {
      structured: {
        as_of_date: today,
        timezone: TIMEZONE,
        items: page,
        total: matching.length,
        next_cursor: nextCursor(offset, page.length, matching.length),
      },
      count: page.length,
    };
  },
};

// ── registry ─────────────────────────────────────────────────────────────

export const READ_TOOLS: readonly ToolDefinition[] = [
  searchLeaders,
  getLeader,
  listLeaderNotes,
  listLeaderConnections,
  listFollowUps,
];

export const parseToolArguments = (tool: ToolDefinition, args: unknown) => parseArguments(tool.inputSchema, args);
