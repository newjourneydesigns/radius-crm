import { DateTime } from 'luxon';
import type { McpConfig } from './config';
import type { Principal } from './oauth';
import type { LeaderRow, ReadRepo } from './repo';
import type { ContactRepo, WriteRepo } from './repo-write';
import { InputError, type JsonSchema } from './schema';

export const TIMEZONE = 'America/Chicago';

export interface ToolContext {
  repo: ReadRepo;
  contacts: ContactRepo;
  writes: WriteRepo;
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
  /** Changes Radius. Drives the advertised annotations, the stricter rate limit and the audit redaction. */
  writes?: boolean;
  /** Needs `users.role = 'ACPD'`, checked live on every call (not cached from sign-in or consent). */
  requiresAcpd?: boolean;
  /**
   * What goes into the audit log in place of the raw arguments. Required thinking for any tool whose
   * arguments carry pastoral text: the log must never hold a second copy of it.
   */
  redactArgs?: (args: Record<string, unknown>) => unknown;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

// ── shared pieces ────────────────────────────────────────────────────────

export const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';
export const nullableString: JsonSchema = { anyOf: [{ type: 'string' }, { type: 'null' }] };

export const limitProp = (max: number, fallback: number): JsonSchema => ({
  type: 'integer',
  minimum: 1,
  maximum: max,
  default: fallback,
  description: `Page size, 1–${max}. Defaults to ${fallback}.`,
});
export const cursorProp: JsonSchema = {
  type: 'string',
  maxLength: 200,
  description: 'Pass the next_cursor from the previous response to get the next page.',
};
export const leaderIdProp: JsonSchema = {
  type: 'integer',
  minimum: 1,
  maximum: 2147483647,
  description: 'The Radius Circle Leader id, as returned by search_leaders.',
};

export const radiusUrl = (config: McpConfig, leaderId: number) => `${config.baseUrl}/circle/${leaderId}`;

export const encodeCursor = (offset: number) => Buffer.from(JSON.stringify({ o: offset })).toString('base64url');

export function decodeCursor(cursor: unknown): number {
  if (cursor === undefined) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (Number.isInteger(parsed?.o) && parsed.o >= 0 && parsed.o <= 100000) return parsed.o;
  } catch {
    // falls through to the error below
  }
  throw new InputError('cursor is not valid. Use the next_cursor from a previous response.');
}

export const nextCursor = (offset: number, returned: number, total: number) =>
  offset + returned < total ? encodeCursor(offset + returned) : null;

export function dateArg(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (!DateTime.fromISO(String(value)).isValid) throw new InputError(`"${name}" is not a real date.`);
  return String(value);
}

export const trimText = (text: string | null, max: number) => (text && text.length > max ? `${text.slice(0, max)}…` : text);

export function leaderSummary(row: LeaderRow, config: McpConfig) {
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

export const leaderSummarySchema: JsonSchema = {
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

export const pageProps = {
  total: { type: 'integer', description: 'How many records match in all, across every page.' },
  next_cursor: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'null when there are no more pages.' },
} as const;
