/**
 * Reconciles Circles reporting against CCB's own "Event List" report.
 *
 * WHY THIS EXISTS
 *
 * Staff pull an Event List export straight out of CCB (Group Dept = Adult
 * Circles, Group Type = Circle) and read four numbers off it: how many circles
 * met, total attendance, average attendance, and the same split by campus. The
 * reporting page answers the same questions from RADIUS's own tables and gets
 * different numbers, for three structural reasons rather than any arithmetic
 * error:
 *
 *   1. The page's "Total Circles" is a PROJECTION. It counts (leader, week)
 *      pairs derived from the hand-maintained `circle_leaders.day / frequency /
 *      meeting_start_date`, restricted to `status = 'active'` and
 *      `leader_type = 'circle'`. CCB's count is whatever is on CCB's calendar.
 *      Two different populations.
 *   2. CCB reports RADIUS cannot attribute are dropped. `attendance_profiles`
 *      returns no reliable group id, so an occurrence only becomes "this
 *      circle's meeting" through `ccb_event_group_map`. Misses land in
 *      `ccb_orphan_summaries`, which the reporting page never reads.
 *   3. Attendance precedence is inverted. `weekAttendanceCount()` prefers the
 *      leader's toolkit submission and falls back to CCB, so the page reports
 *      RADIUS's number whenever the two disagree.
 *
 * This route measures all three instead of guessing at them. It recomputes the
 * week from CCB, recomputes it from what RADIUS stored, and prints the delta
 * per circle. It is READ-ONLY: it writes nothing, repairs nothing, and is safe
 * to run repeatedly.
 *
 * CCB COST: exactly one call. `attendance_profiles?start_date&end_date` returns
 * the entire church for the range in a single unpaged response.
 *
 * THE ONE DEFINITION THAT MATTERS
 *
 * CCB's "Actual Attendance" column is not a stored field — it is
 * `head_count + attendees.length`. `head_count` is CCB's "additional people not
 * named above", so the two are disjoint and must be summed. That is already how
 * `lib/ccb/ccb-client.ts:1791-1793` computes `circle_meeting_occurrences
 * .headcount`, so the stored column and the export agree by construction. The
 * consequence for unique-individual counting is that the head_count portion
 * carries NO individual id and therefore cannot be deduplicated across circles
 * — it is reported separately rather than folded in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createCCBClient, type AttendanceSummary } from '../../../../lib/ccb/ccb-client';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { submittedAttendanceCount } from '../../../../lib/circleAttendance';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const APP_TIME_ZONE = 'America/Chicago';

/** Campus codes CCB prefixes onto every circle's group name. */
const CAMPUS_BY_CODE: Record<string, string> = {
  FMT: 'Flower Mound',
  DNT: 'Denton',
  LVT: 'Lewisville',
  GVT: 'Gainesville',
  ONL: 'Online',
};

/**
 * `CODE | S# | Leader Name` — the shape of every Adult Circles group name in
 * CCB. Verified against a 294-row export for 2026-09-06: 100% conformance, so
 * a non-match is a reliable signal that a row is not a circle meeting.
 */
const CIRCLE_NAME_RE = /^\s*(FMT|DNT|LVT|GVT|ONL)\s*\|\s*(S\d+)\s*\|\s*(.+?)\s*$/i;

/** Only the columns this route selects. The repo has no generated DB types. */
type GroupCacheRow = {
  id: string | number;
  name: string | null;
  campus: string | null;
  group_type: string | null;
  inactive: boolean | null;
};

type CachedGroup = {
  name: string | null;
  campus: string | null;
  groupType: string | null;
  inactive: boolean;
};

type LeaderRow = {
  id: number;
  name: string | null;
  ccb_group_id: string | null;
  ccb_group_name: string | null;
  circle_name: string | null;
  campus: string | null;
  acpd: string | null;
  status: string | null;
  leader_type: string | null;
};

type Occurrence = {
  eventId: string;
  occurrenceDate: string;
  eventTitle: string;
  didNotMeet: boolean;
  /** CCB's unnamed extras. Disjoint from `namedAttendees`. */
  headCountField: number;
  namedAttendees: number;
  /** headCountField + namedAttendees — the export's "Actual Attendance". */
  actualAttendance: number;
  individualIds: string[];
  hasNotes: boolean;
  ccbGroupId: string | null;
  ccbGroupName: string | null;
  campus: string | null;
  campusSource: 'group_name_prefix' | 'group_cache' | 'leader' | 'unknown';
  groupType: string | null;
  leaderId: number | null;
  leaderName: string | null;
  leaderStatus: string | null;
  acpd: string | null;
  /** Why this row is or isn't counted. */
  classification: 'counted' | 'orphan_no_group_map' | 'orphan_no_leader' | 'orphan_inactive_leader' | 'excluded_not_a_circle';
};

type Bucket = {
  circles: number;
  met: number;
  didNotMeet: number;
  noReport: number;
  totalAttendance: number;
  namedAttendance: number;
  unnamedAttendance: number;
  avgPerMetCircle: number | null;
};

function emptyBucket(): Bucket {
  return {
    circles: 0,
    met: 0,
    didNotMeet: 0,
    noReport: 0,
    totalAttendance: 0,
    namedAttendance: 0,
    unnamedAttendance: 0,
    avgPerMetCircle: null,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * `attendance_profiles` returns the entire church, so a week can carry well
 * over a thousand event ids. PostgREST puts the whole `in.(...)` list in the
 * query string, so an unchunked lookup silently 414s at that size.
 */
const IN_CHUNK = 400;

function chunk<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Status for one circle-week, with CCB as the source of truth.
 *
 * `did_not_meet` comes off CCB's own flag rather than being inferred from a
 * zero. That distinction is invisible in the CSV export — a circle that did not
 * meet and a circle that never filed both export as 0 — which is exactly why
 * the API is the better source here, not merely an equivalent one.
 */
function classifyStatus(o: { didNotMeet: boolean; actualAttendance: number }): 'met' | 'did_not_meet' | 'no_report' {
  if (o.didNotMeet) return 'did_not_meet';
  if (o.actualAttendance > 0) return 'met';
  return 'no_report';
}

function summarize(rows: Occurrence[]): Bucket {
  const b = emptyBucket();
  b.circles = rows.length;
  for (const r of rows) {
    const status = classifyStatus(r);
    if (status === 'met') b.met += 1;
    else if (status === 'did_not_meet') b.didNotMeet += 1;
    else b.noReport += 1;
    b.totalAttendance += r.actualAttendance;
    b.namedAttendance += r.namedAttendees;
    b.unnamedAttendance += r.headCountField;
  }
  b.avgPerMetCircle = b.met > 0 ? round1(b.totalAttendance / b.met) : null;
  return b;
}

function groupBy(rows: Occurrence[], key: (r: Occurrence) => string): Record<string, Bucket> {
  const out: Record<string, Occurrence[]> = {};
  for (const r of rows) {
    const k = key(r) || 'Unknown';
    (out[k] ||= []).push(r);
  }
  return Object.fromEntries(
    Object.entries(out)
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([k, v]) => [k, summarize(v)])
  );
}

/**
 * Collapses a week's occurrences to one row per circle.
 *
 * A circle can carry more than one CCB event in a week — a genuine second
 * gathering, or the same meeting entered twice. Both appeared in the 2026-09-06
 * export: one group had two identical 6:00pm events reading 6 apiece (counting
 * both invents 6 people), another had a separate "Prophetic Reset" event on the
 * same calendar. Reporting is per circle, so the row with the strongest
 * evidence wins: a real report beats a did-not-meet, which beats an empty stub,
 * and attendance breaks the remaining ties.
 */
function dedupeToOneRowPerCircle(rows: Occurrence[]): { kept: Occurrence[]; collapsed: Occurrence[] } {
  const byCircle = new Map<string, Occurrence>();
  const collapsed: Occurrence[] = [];

  const rank = (o: Occurrence): number => {
    if (o.actualAttendance > 0) return 3;
    if (o.didNotMeet) return 2;
    if (o.hasNotes) return 1;
    return 0;
  };

  for (const r of rows) {
    // Fall back to the event id so an unattributed row is never merged into
    // another circle's total.
    const key = r.ccbGroupId ?? `event:${r.eventId}`;
    const held = byCircle.get(key);
    if (!held) {
      byCircle.set(key, r);
      continue;
    }
    const better =
      rank(r) > rank(held) ||
      (rank(r) === rank(held) && r.actualAttendance > held.actualAttendance);
    if (better) {
      byCircle.set(key, r);
      collapsed.push(held);
    } else {
      collapsed.push(r);
    }
  }

  return { kept: Array.from(byCircle.values()), collapsed };
}

export async function GET(request: NextRequest) {
  // An admin gate, not decoration: this route spends a CCB API call.
  const auth = await verifyAdminAccess(request);
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error ?? 'Admin access required' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const requestedWeek = params.get('week_start_date');
  const includeRows = params.get('include_rows') !== '0';

  // Default to the most recently completed Sunday–Saturday week, matching the
  // reporting page, which never shows the in-progress week.
  const nowCT = DateTime.now().setZone(APP_TIME_ZONE);
  const thisWeekSunday = nowCT.minus({ days: nowCT.weekday % 7 }).startOf('day');
  let weekStart = thisWeekSunday.minus({ days: 7 });

  if (requestedWeek) {
    const parsed = DateTime.fromISO(requestedWeek, { zone: APP_TIME_ZONE });
    if (!parsed.isValid) {
      return NextResponse.json({ error: 'week_start_date must be YYYY-MM-DD' }, { status: 400 });
    }
    // Snap to the containing Sunday so a mid-week date still resolves.
    weekStart = parsed.minus({ days: parsed.weekday % 7 }).startOf('day');
  }

  const weekStartISO = weekStart.toISODate()!;
  const weekEndISO = weekStart.plus({ days: 6 }).toISODate()!;

  const supabase = createServiceSupabaseClient({ noStore: true });

  try {
    // ── 1. CCB: one unpaged call for the whole church ────────────────────────
    const ccb = createCCBClient({
      userId: auth.user?.id ?? null,
      module: 'circle-reporting',
      action: 'ccb-reconcile',
    });
    const byEventId = await ccb.fetchAllAttendanceInRange(weekStartISO, weekEndISO, {
      includeAttendees: true,
    });

    const raw: Array<{ eventId: string; title: string; attendance: AttendanceSummary }> = [];
    for (const rows of Array.from(byEventId.values())) {
      for (const row of rows) {
        if (!row.attendance) continue;
        if (row.occurDate < weekStartISO || row.occurDate > weekEndISO) continue;
        raw.push({ eventId: row.eventId, title: row.title ?? '', attendance: row.attendance });
      }
    }

    // ── 2. Attribution: event → group → circle leader ────────────────────────
    const eventIds = Array.from(new Set(raw.map((r) => r.eventId)));

    const groupByEvent = new Map<string, string>();
    for (const batch of chunk(eventIds)) {
      const { data: mapRows, error } = await supabase
        .from('ccb_event_group_map')
        .select('ccb_event_id, ccb_group_id')
        .in('ccb_event_id', batch);
      if (error) throw new Error(`ccb_event_group_map lookup failed: ${error.message}`);
      for (const m of mapRows ?? []) {
        groupByEvent.set(String(m.ccb_event_id), String(m.ccb_group_id));
      }
    }

    const groupIds = Array.from(new Set(Array.from(groupByEvent.values())));

    const groupCache = new Map<string, CachedGroup>();
    for (const batch of chunk(groupIds)) {
      const { data: groupRows, error } = await supabase
        .from('ccb_group_cache')
        .select('id, name, campus, group_type, inactive')
        .in('id', batch);
      // A cold or absent group cache is not fatal — the group-name prefix still
      // resolves campus and scope — so this degrades instead of failing.
      if (error) {
        console.warn('[ccb-reconcile] ccb_group_cache lookup failed:', error.message);
        break;
      }
      for (const g of (groupRows ?? []) as GroupCacheRow[]) {
        groupCache.set(String(g.id), {
          name: g.name ?? null,
          campus: g.campus ?? null,
          groupType: g.group_type ?? null,
          inactive: Boolean(g.inactive),
        });
      }
    }

    const { data: leaderRowsRaw } = await supabase
      .from('circle_leaders')
      .select('id, name, ccb_group_id, ccb_group_name, circle_name, campus, acpd, status, leader_type')
      .not('ccb_group_id', 'is', null)
      .limit(5000);
    const leaderRows = (leaderRowsRaw ?? []) as LeaderRow[];
    const leaderByGroup = new Map<string, LeaderRow>();
    for (const l of leaderRows) {
      leaderByGroup.set(String(l.ccb_group_id), l);
    }

    // ── 3. Build one normalized occurrence per CCB row ───────────────────────
    const occurrences: Occurrence[] = raw.map((r) => {
      const a = r.attendance;
      const headCountField = Number.isFinite(a.headCount) ? Number(a.headCount) : 0;
      const attendees = a.attendees ?? [];
      const individualIds = attendees
        .map((p) => (p.id ?? '').trim())
        .filter((id) => id.length > 0);
      const namedAttendees = attendees.length;

      const ccbGroupId = groupByEvent.get(r.eventId) ?? null;
      const cached = ccbGroupId ? groupCache.get(ccbGroupId) : undefined;
      const leader = ccbGroupId ? leaderByGroup.get(ccbGroupId) : undefined;

      // Prefer the group's own name. The event title can name a different
      // leader than the group it sits on — the 2026-09-06 export had two such
      // rows — so the title is the weaker key.
      const ccbGroupName = cached?.name ?? leader?.ccb_group_name ?? null;
      const prefix = CIRCLE_NAME_RE.exec(ccbGroupName ?? r.title ?? '');

      // Campus, best source first. The `CODE |` prefix is the only one that
      // comes from CCB's own naming, and it matched the export on all 294 rows.
      let campus: string | null = null;
      let campusSource: Occurrence['campusSource'] = 'unknown';
      if (prefix) {
        campus = CAMPUS_BY_CODE[prefix[1].toUpperCase()] ?? null;
        if (campus) campusSource = 'group_name_prefix';
      }
      if (!campus && cached?.campus) {
        campus = cached.campus;
        campusSource = 'group_cache';
      }
      if (!campus && leader?.campus) {
        campus = leader.campus;
        campusSource = 'leader';
      }

      const groupType = cached?.groupType ?? null;
      const leaderStatus = leader?.status ?? null;
      const leaderId = leader ? Number(leader.id) : null;

      // Scope mirrors the export's Group Type = Circle filter. The group-name
      // pattern stands in where the cache has no type, so a row is only
      // rejected when neither source calls it a circle.
      const inScope = (groupType ?? '').toLowerCase() === 'circle' || Boolean(prefix);
      const activeLeader = (leaderStatus ?? '').toLowerCase() === 'active';

      let classification: Occurrence['classification'];
      if (!inScope) classification = 'excluded_not_a_circle';
      else if (!ccbGroupId) classification = 'orphan_no_group_map';
      else if (leaderId === null) classification = 'orphan_no_leader';
      else if (!activeLeader) classification = 'orphan_inactive_leader';
      else classification = 'counted';

      return {
        eventId: r.eventId,
        occurrenceDate: a.occurrence,
        eventTitle: r.title,
        didNotMeet: a.didNotMeet === true,
        headCountField,
        namedAttendees,
        actualAttendance: headCountField + namedAttendees,
        individualIds,
        hasNotes: Boolean(a.topic || a.notes || a.prayerRequests || a.info),
        ccbGroupId,
        ccbGroupName,
        campus,
        campusSource,
        groupType,
        leaderId,
        leaderName: leader?.name ?? null,
        leaderStatus,
        acpd: leader?.acpd ?? null,
        classification,
      };
    });

    const inScopeRows = occurrences.filter((o) => o.classification !== 'excluded_not_a_circle');
    const excluded = occurrences.filter((o) => o.classification === 'excluded_not_a_circle');
    const orphans = inScopeRows.filter((o) => o.classification !== 'counted');
    const counted = inScopeRows.filter((o) => o.classification === 'counted');

    // ── 4. Metrics, on every scope so the gap is visible ─────────────────────
    const allDedup = dedupeToOneRowPerCircle(inScopeRows);
    const countedDedup = dedupeToOneRowPerCircle(counted);

    /**
     * Unique individuals. The named portion deduplicates by CCB individual id,
     * so a person in two circles is counted once. The unnamed portion cannot be
     * deduplicated at all — CCB's head_count carries no id — so it is reported
     * as a separate ceiling rather than added in and presented as fact.
     */
    const uniqueIds = new Set<string>();
    let unnamedTotal = 0;
    for (const o of allDedup.kept) {
      for (const id of o.individualIds) uniqueIds.add(id);
      unnamedTotal += o.headCountField;
    }
    const namedSeatCount = allDedup.kept.reduce((sum, o) => sum + o.namedAttendees, 0);

    // ── 5. What RADIUS stored for the same week, same grain ──────────────────
    const { data: storedOccurrences } = await supabase
      .from('circle_meeting_occurrences')
      .select('leader_id, meeting_date, status, headcount')
      .gte('meeting_date', weekStartISO)
      .lte('meeting_date', weekEndISO)
      .limit(20000);

    // `occurrence` is TIMESTAMPTZ holding a naive CCB wall-clock string, so a
    // UTC-literal window is what /api/circle-reporting uses. Copied on purpose:
    // the point is to compare against the page, not to be independently right.
    // (/api/event-summary-tracker converts CT→UTC instead, and the two can
    // disagree on late-Saturday meetings.)
    const { data: storedSubmissions } = await supabase
      .from('circle_event_summaries')
      .select('leader_id, occurrence, did_not_meet, attendee_ccb_ids, manual_attendees, status')
      .gte('occurrence', `${weekStartISO}T00:00:00.000Z`)
      .lt('occurrence', `${DateTime.fromISO(weekEndISO).plus({ days: 1 }).toISODate()}T00:00:00.000Z`)
      .limit(20000);

    const radiusByLeader = new Map<number, { status: string; attendance: number }>();
    for (const row of storedOccurrences ?? []) {
      const id = Number(row.leader_id);
      const attendance = Number(row.headcount ?? 0) || 0;
      const held = radiusByLeader.get(id);
      if (!held || attendance > held.attendance) {
        radiusByLeader.set(id, { status: String(row.status ?? 'no_record'), attendance });
      }
    }
    // The leader's own submission, which the reporting page currently prefers
    // over CCB. Recorded here so the precedence flip can be quantified.
    const submissionByLeader = new Map<number, { didNotMeet: boolean; attendance: number }>();
    for (const row of storedSubmissions ?? []) {
      if (row.status && row.status !== 'submitted') continue;
      const id = Number(row.leader_id);
      const attendance = submittedAttendanceCount(row);
      const held = submissionByLeader.get(id);
      if (!held || attendance > held.attendance) {
        submissionByLeader.set(id, { didNotMeet: Boolean(row.did_not_meet), attendance });
      }
    }

    // ── 6. Per-circle disagreement ───────────────────────────────────────────
    const disagreements = countedDedup.kept
      .map((o) => {
        const stored = o.leaderId !== null ? radiusByLeader.get(o.leaderId) : undefined;
        const submitted = o.leaderId !== null ? submissionByLeader.get(o.leaderId) : undefined;
        const ccbStatus = classifyStatus(o);
        const radiusAttendance = submitted && submitted.attendance > 0
          ? submitted.attendance
          : stored?.attendance ?? null;
        const attendanceDelta =
          radiusAttendance === null ? null : o.actualAttendance - radiusAttendance;
        const statusMismatch = Boolean(stored) && stored!.status !== ccbStatus;
        return {
          leader_id: o.leaderId,
          leader_name: o.leaderName,
          ccb_group_id: o.ccbGroupId,
          ccb_group_name: o.ccbGroupName,
          campus: o.campus,
          date: o.occurrenceDate,
          ccb_status: ccbStatus,
          ccb_attendance: o.actualAttendance,
          ccb_named: o.namedAttendees,
          ccb_unnamed: o.headCountField,
          radius_stored_status: stored?.status ?? null,
          radius_stored_attendance: stored?.attendance ?? null,
          radius_submitted_attendance: submitted?.attendance ?? null,
          attendance_delta: attendanceDelta,
          status_mismatch: statusMismatch,
          // CCB's head_count can only ever be raised (see
          // lib/circle-leader-toolkit/ccb-attendance-push.ts), so CCB holding
          // more than the leader reported is the signature of an inflated
          // count, not of a leader undercounting.
          possible_ccb_inflation:
            submitted !== undefined &&
            submitted.attendance > 0 &&
            o.actualAttendance > submitted.attendance,
        };
      })
      .filter((d) => d.status_mismatch || (d.attendance_delta ?? 0) !== 0)
      .sort((a, b) => Math.abs(b.attendance_delta ?? 0) - Math.abs(a.attendance_delta ?? 0));

    // The mirror image of an orphan. An active weekly circle with no CCB
    // occurrence at all still counts toward the page's `expected` denominator,
    // so it drags compliance down without ever appearing in a CCB export.
    const ccbGroupIdsSeen = new Set(
      inScopeRows.map((o) => o.ccbGroupId).filter((id): id is string => Boolean(id))
    );
    const activeCirclesWithoutCcbEvent = leaderRows.filter((l) => {
      if ((l.status ?? '').toLowerCase() !== 'active') return false;
      if ((l.leader_type ?? 'circle') !== 'circle') return false;
      return !ccbGroupIdsSeen.has(String(l.ccb_group_id));
    });

    const ccbTruth = summarize(countedDedup.kept);
    const ccbTruthWithOrphans = summarize(allDedup.kept);

    const radiusTotalAttendance = countedDedup.kept.reduce((sum, o) => {
      const stored = o.leaderId !== null ? radiusByLeader.get(o.leaderId) : undefined;
      const submitted = o.leaderId !== null ? submissionByLeader.get(o.leaderId) : undefined;
      if (submitted && submitted.attendance > 0) return sum + submitted.attendance;
      return sum + (stored?.attendance ?? 0);
    }, 0);

    return NextResponse.json(
      {
        week: { start: weekStartISO, end: weekEndISO, timezone: APP_TIME_ZONE },
        ccb_cost: { attendance_profiles_calls: 1 },

        // Compare this block against the CCB Event List export. It is built
        // from the same definitions the export uses.
        ccb: {
          note: 'Actual Attendance = head_count + named attendees. did_not_meet is CCB\'s own flag, not an inferred zero.',
          raw_occurrences_in_week: occurrences.length,
          in_scope_occurrences: inScopeRows.length,
          excluded_not_a_circle: excluded.length,
          collapsed_duplicate_events: allDedup.collapsed.length,
          including_orphans: ccbTruthWithOrphans,
          matched_active_circles_only: ccbTruth,
          by_campus: groupBy(allDedup.kept, (r) => r.campus ?? 'Unknown'),
          by_acpd: groupBy(countedDedup.kept, (r) => r.acpd ?? 'Unassigned'),
        },

        // The metric the CSV export cannot produce at all.
        unique_individuals: {
          named_unique: uniqueIds.size,
          named_seats: namedSeatCount,
          duplicate_seats_from_multi_circle_attendance: namedSeatCount - uniqueIds.size,
          unnamed_not_deduplicable: unnamedTotal,
          upper_bound_if_every_unnamed_person_is_distinct: uniqueIds.size + unnamedTotal,
          caveat:
            'CCB head_count carries no individual id, so the unnamed portion cannot be deduplicated. Treat named_unique as the floor and the upper bound as the ceiling.',
        },

        radius: {
          note: 'Same circles as matched_active_circles_only, valued the way the reporting page values them today (leader submission preferred over CCB).',
          total_attendance: radiusTotalAttendance,
          stored_occurrence_rows_in_week: (storedOccurrences ?? []).length,
          leader_submissions_in_week: (storedSubmissions ?? []).length,
        },

        delta: {
          total_attendance_ccb_minus_radius: ccbTruth.totalAttendance - radiusTotalAttendance,
          attendance_hidden_in_orphans:
            ccbTruthWithOrphans.totalAttendance - ccbTruth.totalAttendance,
          circles_hidden_in_orphans: ccbTruthWithOrphans.circles - ccbTruth.circles,
          circles_with_disagreement: disagreements.length,
        },

        // The worklist. Every row here is a circle whose CCB attendance is
        // invisible to the reporting page until its mapping is fixed.
        orphans: {
          total: orphans.length,
          attendance: orphans.reduce((s, o) => s + o.actualAttendance, 0),
          by_reason: {
            no_group_map: orphans.filter((o) => o.classification === 'orphan_no_group_map').length,
            no_leader: orphans.filter((o) => o.classification === 'orphan_no_leader').length,
            inactive_leader: orphans.filter((o) => o.classification === 'orphan_inactive_leader').length,
          },
          truncated: orphans.length > 200,
          rows: orphans.slice(0, 200).map((o) => ({
            event_id: o.eventId,
            date: o.occurrenceDate,
            event_title: o.eventTitle,
            ccb_group_id: o.ccbGroupId,
            ccb_group_name: o.ccbGroupName,
            campus: o.campus,
            attendance: o.actualAttendance,
            reason: o.classification,
          })),
        },

        // RADIUS-side circles CCB never reported on. Counted in the page's
        // denominator, absent from any CCB export.
        active_circles_with_no_ccb_event: {
          total: activeCirclesWithoutCcbEvent.length,
          rows: includeRows
            ? activeCirclesWithoutCcbEvent.slice(0, 200).map((l) => ({
                leader_id: Number(l.id),
                leader_name: l.name,
                ccb_group_id: l.ccb_group_id,
                ccb_group_name: l.ccb_group_name,
                campus: l.campus,
              }))
            : undefined,
          truncated: activeCirclesWithoutCcbEvent.length > 200,
        },

        disagreements: includeRows ? disagreements : disagreements.length,

        // A sample, not the list: attendance_profiles returns every event in
        // the church, so most exclusions are kids/teams/serving occurrences.
        // Enough rows to spot a filter that is throwing away real circles.
        excluded_sample: includeRows
          ? excluded.slice(0, 50).map((o) => ({
              event_id: o.eventId,
              date: o.occurrenceDate,
              event_title: o.eventTitle,
              ccb_group_name: o.ccbGroupName,
              group_type: o.groupType,
            }))
          : excluded.length,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reconciliation failed';
    console.error('[ccb-reconcile]', error);
    return NextResponse.json({ error: message, week: { start: weekStartISO, end: weekEndISO } }, { status: 500 });
  }
}
