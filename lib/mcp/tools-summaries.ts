import { DateTime } from 'luxon';
import { MCP_SCOPE_READ } from './config';
import { canSeeCampus } from './access';
import type { ReviewFilter, SummaryKeyset, SummaryRow } from './repo';
import { InputError } from './schema';
import type { JsonSchema } from './schema';
import {
  DATE_PATTERN, TIMEZONE, cursorProp, dateArg, limitProp, nullableString, radiusUrl, trimText,
  type ToolContext, type ToolDefinition,
} from './tool-kit';
import { LEADER_ID_FILTER_CAP, likeTerm } from './repo';
import { sundayWeekKey } from '../week';

// ── review state ─────────────────────────────────────────────────────────
// Radius keeps ONE shared review stamp per summary (reviewed_at / reviewed_by). There is no per-user
// review record, so "mine" means "I am the person who stamped it", and a summary someone else stamped
// reads as reviewed_by_other. Nothing in this file can set or clear the stamp.

type ReviewState = 'unreviewed' | 'reviewed_by_me' | 'reviewed_by_other';

async function reviewOf(row: SummaryRow, ctx: ToolContext, names: Map<string, string>) {
  const state: ReviewState = !row.reviewed_at ? 'unreviewed' : row.reviewed_by === ctx.principal.userId ? 'reviewed_by_me' : 'reviewed_by_other';
  return {
    state,
    reviewed_at: row.reviewed_at ?? null,
    reviewed_by_name: row.reviewed_by ? names.get(row.reviewed_by) ?? null : null,
  };
}

const reviewSchema: JsonSchema = {
  type: 'object',
  description:
    "The review stamp on this summary. Radius keeps one shared stamp, not one per person: 'reviewed_by_me' means you stamped it, " +
    "'reviewed_by_other' means someone else did. This is separate from submission status and is never changed by reading.",
  properties: {
    state: { type: 'string', enum: ['unreviewed', 'reviewed_by_me', 'reviewed_by_other'] },
    reviewed_at: nullableString,
    reviewed_by_name: nullableString,
  },
  required: ['state', 'reviewed_at', 'reviewed_by_name'],
};

const reportingWeek = (occurrence: string) => {
  const dt = DateTime.fromISO(occurrence).setZone(TIMEZONE);
  return { event_date: dt.toISODate(), reporting_week_start: sundayWeekKey(dt) };
};

async function reviewerNames(ctx: ToolContext, rows: SummaryRow[]) {
  const ids = Array.from(new Set(rows.map((r) => r.reviewed_by).filter((v): v is string => !!v)));
  return ctx.repo.authorNames(ids);
}

// ── cursor (keyset) ──────────────────────────────────────────────────────

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const encodeKeyset = (k: SummaryKeyset) => Buffer.from(JSON.stringify({ o: k.occurrence, c: k.created_at, i: k.id })).toString('base64url');

function decodeKeyset(cursor: unknown): SummaryKeyset | undefined {
  if (cursor === undefined) return undefined;
  try {
    const p = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    // These values are spliced into a database filter, so they must match strict patterns, never free text.
    if (typeof p?.o === 'string' && TIMESTAMP.test(p.o) && typeof p?.c === 'string' && TIMESTAMP.test(p.c) && typeof p?.i === 'string' && UUID.test(p.i)) {
      return { occurrence: p.o, created_at: p.c, id: p.i };
    }
  } catch {
    // falls through
  }
  throw new InputError('cursor is not valid. Use the next_cursor from a previous response.');
}

const ctDayStartUtc = (date: string) => DateTime.fromISO(date, { zone: TIMEZONE }).startOf('day').toUTC().toISO()!;
const ctDayAfterUtc = (date: string) => DateTime.fromISO(date, { zone: TIMEZONE }).plus({ days: 1 }).startOf('day').toUTC().toISO()!;

// ── list_event_summaries ─────────────────────────────────────────────────

const summaryItemSchema: JsonSchema = {
  type: 'object',
  properties: {
    summary_id: { type: 'string' },
    leader_id: { type: 'integer' },
    leader_name: nullableString,
    circle_name: nullableString,
    campus: nullableString,
    occurrence: { type: 'string', description: 'When the circle met, as a timestamp.' },
    event_date: { type: 'string', description: 'The meeting date in Central time.' },
    reporting_week_start: { type: 'string', description: 'The Sunday that starts the Sunday-to-Saturday reporting week.' },
    submitted_at: { type: 'string' },
    submission_status: { type: 'string', enum: ['submitted', 'failed', 'retrying'] },
    did_not_meet: { type: 'boolean' },
    review: reviewSchema,
    radius_url: { type: 'string' },
  },
  required: ['summary_id', 'leader_id', 'occurrence', 'submitted_at', 'submission_status', 'review', 'radius_url'],
};

const listEventSummaries: ToolDefinition = {
  name: 'list_event_summaries',
  title: 'List submitted event summaries',
  description:
    'List event summaries that leaders submitted through Radius (one per meeting), newest meeting first. ' +
    'Filters combine (AND). Dates and weeks are Central time; reporting weeks run Sunday to Saturday. ' +
    "`review_status` filters on the review stamp, which Radius keeps once per summary (not per person): 'reviewed_by_me' = you stamped it, " +
    "'reviewed_by_other' = someone else did. Submission status and review status are different things. " +
    'Contact details and the written responses are not included; use get_event_summary for those. This never marks anything reviewed.',
  requiredScope: MCP_SCOPE_READ,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      campus: { type: 'string', maxLength: 100, description: 'Narrows to a campus you can already see. It is not a permission.' },
      leader_id: { type: 'integer', minimum: 1, maximum: 2147483647, description: 'Only this leader.' },
      circle: { type: 'string', maxLength: 100, description: 'Part of the circle name or leader name.' },
      occurrence_from: { type: 'string', pattern: DATE_PATTERN, description: 'Meetings on or after this date (YYYY-MM-DD).' },
      occurrence_to: { type: 'string', pattern: DATE_PATTERN, description: 'Meetings on or before this date (YYYY-MM-DD).' },
      week_start: { type: 'string', pattern: DATE_PATTERN, description: 'The Sunday that starts a reporting week (YYYY-MM-DD). Do not combine with occurrence_from/occurrence_to.' },
      review_status: {
        type: 'string',
        enum: ['any', 'unreviewed', 'reviewed_by_me', 'reviewed_by_other', 'reviewed_by_anyone'],
        default: 'any',
      },
      limit: limitProp(50, 25),
      cursor: cursorProp,
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      items: { type: 'array', items: summaryItemSchema },
      total: { type: 'integer', description: 'How many summaries match in all, across every page.' },
      next_cursor: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'null when there are no more pages.' },
      sort: { type: 'string' },
    },
    required: ['items', 'total', 'next_cursor', 'sort'],
  },
  async run(args, ctx) {
    const limit = args.limit as number;
    const after = decodeKeyset(args.cursor);
    for (const key of ['campus', 'circle'] as const) {
      if (typeof args[key] === 'string' && !likeTerm(args[key] as string)) {
        throw new InputError(`"${key}" has no searchable letters or numbers.`);
      }
    }

    let from = dateArg(args.occurrence_from, 'occurrence_from');
    let to = dateArg(args.occurrence_to, 'occurrence_to');
    const week = dateArg(args.week_start, 'week_start');
    if (week) {
      if (from || to) throw new InputError('Use week_start or occurrence_from/occurrence_to, not both.');
      if (DateTime.fromISO(week).weekday !== 7) throw new InputError('week_start must be a Sunday.');
      from = week;
      to = DateTime.fromISO(week).plus({ days: 6 }).toISODate()!;
    }
    if (from && to && from > to) throw new InputError('occurrence_from is after occurrence_to.');

    // Permission first (the user's campuses), then the narrowing filters.
    const matched = await ctx.repo.leaderIdsMatching({
      allowedCampuses: ctx.principal.campuses,
      campus: args.campus as string | undefined,
      circle: args.circle as string | undefined,
      leaderId: args.leader_id as number | undefined,
    });
    if (matched?.capped) {
      throw new InputError(`More than ${LEADER_ID_FILTER_CAP} leaders match. Narrow the campus, circle or leader_id filter.`);
    }

    const filters = {
      leaderIds: matched ? matched.ids : null,
      occurrenceFrom: from ? ctDayStartUtc(from) : undefined,
      occurrenceToExclusive: to ? ctDayAfterUtc(to) : undefined,
      review: args.review_status as ReviewFilter,
      userId: ctx.principal.userId,
      limit: limit + 1,
    };
    const [fetched, total] = await Promise.all([
      ctx.repo.listEventSummaries({ ...filters, after }),
      ctx.repo.countEventSummaries(filters),
    ]);
    const rows = fetched.slice(0, limit);
    const last = rows[rows.length - 1];

    const [leaders, names] = await Promise.all([
      ctx.repo.leaderBasics(Array.from(new Set(rows.map((r) => r.leader_id)))),
      reviewerNames(ctx, rows),
    ]);
    const items = await Promise.all(
      rows.map(async (r) => ({
        summary_id: r.id,
        leader_id: r.leader_id,
        leader_name: leaders.get(r.leader_id)?.name ?? null,
        circle_name: leaders.get(r.leader_id)?.circle_name ?? null,
        campus: leaders.get(r.leader_id)?.campus ?? null,
        occurrence: r.occurrence,
        ...reportingWeek(r.occurrence),
        submitted_at: r.created_at,
        submission_status: r.status,
        did_not_meet: !!r.did_not_meet,
        review: await reviewOf(r, ctx, names),
        radius_url: radiusUrl(ctx.config, r.leader_id),
      }))
    );

    return {
      structured: {
        items,
        total,
        next_cursor: fetched.length > limit && last ? encodeKeyset({ occurrence: last.occurrence, created_at: last.created_at, id: last.id }) : null,
        sort: 'occurrence desc, submitted_at desc, summary_id desc',
      },
      count: items.length,
    };
  },
};

// ── get_event_summary ────────────────────────────────────────────────────

const getEventSummary: ToolDefinition = {
  name: 'get_event_summary',
  title: 'Read one event summary',
  description:
    'Read everything a leader submitted for one meeting: what was covered, notes, prayer requests, attendance counts, the answers to the form questions, ' +
    'and the submission details. This is the real per-meeting record, not the leader-level summary flag. ' +
    'Submission status (did the report reach Radius/CCB) and review status (the shared review stamp) are reported separately. ' +
    'Reading never marks a summary reviewed. Names and contact details of attendees are not included.',
  requiredScope: MCP_SCOPE_READ,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary_id'],
    properties: { summary_id: { type: 'string', pattern: UUID_PATTERN, description: 'The summary_id from list_event_summaries.' } },
  },
  outputSchema: {
    type: 'object',
    properties: {
      summary_id: { type: 'string' },
      leader: { type: 'object' },
      event: { type: 'object' },
      submission: { type: 'object' },
      review: reviewSchema,
      responses: { type: 'object' },
      radius_url: { type: 'string' },
    },
    required: ['summary_id', 'leader', 'event', 'submission', 'review', 'responses', 'radius_url'],
  },
  async run(args, ctx) {
    const id = String(args.summary_id).toLowerCase();
    const notFound = new InputError(`No event summary with id ${id}.`);
    const row = await ctx.repo.getEventSummary(id);
    if (!row) throw notFound;
    const leader = (await ctx.repo.leaderBasics([row.leader_id])).get(row.leader_id);
    // Same answer for "doesn't exist" and "not yours to see".
    if (!leader || !canSeeCampus(ctx.principal, leader.campus)) throw notFound;

    const names = await reviewerNames(ctx, [row]);
    const dynamic = Object.entries(row.dynamic_responses ?? {}).map(([questionId, v]) => ({
      question_id: questionId,
      label: v?.label ?? null,
      value: v?.value ?? null,
    }));

    return {
      structured: {
        summary_id: row.id,
        leader: { id: row.leader_id, name: leader.name, circle_name: leader.circle_name, campus: leader.campus },
        event: { ccb_event_id: row.ccb_event_id, occurrence: row.occurrence, ...reportingWeek(row.occurrence) },
        submission: {
          status: row.status,
          submitted_at: row.created_at,
          updated_at: row.updated_at ?? null,
          submitted_via: row.submitted_via ?? null,
          ccb_submitted_at: row.ccb_submitted_at ?? null,
          ccb_error: trimText(row.ccb_error ?? null, 500),
        },
        review: await reviewOf(row, ctx, names),
        responses: {
          did_not_meet: !!row.did_not_meet,
          did_not_meet_reason: row.did_not_meet_reason ?? null,
          topic: row.topic ?? null,
          notes: row.notes ?? null,
          prayer_requests: row.prayer_requests ?? null,
          info: row.info ?? null,
          attendee_count: (row.attendee_ccb_ids ?? []).length,
          manual_attendee_count: (row.manual_attendees ?? []).length,
          dynamic_responses: dynamic,
          info_update_requested: row.info_update_requested ?? null,
        },
        radius_url: radiusUrl(ctx.config, row.leader_id),
      },
      count: 1,
    };
  },
};

export const SUMMARY_TOOLS: readonly ToolDefinition[] = [listEventSummaries, getEventSummary];
