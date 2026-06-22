/**
 * Loads a single person's profile for a host-team leader: their contact info,
 * the team(s) + position(s) they currently hold on the leader's teams, their
 * serving requests over the last 4 weeks and next 4 weeks, and their monthly
 * serving %. Read-only — CCB is the system of record.
 *
 * Serving % (a serve-team commitment is 50% of available opportunities/month):
 *  - Past month  = times they CHECKED IN ÷ every request sent to them, over the
 *                  previous calendar month.
 *  - Next month  = times they ACCEPTED ÷ every request sent to them, over the
 *                  next calendar month (no check-ins exist for future dates).
 *
 * Scope is the leader's *managed* positions only (same filter as the roster and
 * schedule loaders), so a leader only sees a person in the context of their own
 * teams.
 */

import { DateTime } from 'luxon';
import type { TeamSessionLeader } from './session';
import { createServiceSupabaseClient } from '../server-supabase';
import { createCCBv2Client } from '../ccb/ccb-v2-client';
import type { ScheduleServeStatus } from '../ccb/ccb-v2-client';

const CT_ZONE = 'America/Chicago';
const WINDOW_DAYS = 28; // last / next 4 weeks for the request lists
const COMMITMENT_PCT = 50; // serve-team monthly commitment

export interface TeamPersonMembership {
  positionId: string;
  positionName: string;
  teamName: string;
}

export interface TeamPersonServing {
  occurrenceId: string;
  date: string; // YYYY-MM-DD
  positionName: string;
  status: ScheduleServeStatus;
  declineReason: string;
}

/** Monthly serving-% summary. `count` is check-ins (past) or accepts (upcoming). */
export interface TeamServeStats {
  monthLabel: string; // e.g. "May" / "July"
  requests: number; // every request sent to them that month
  count: number; // checked-in (past) or accepted (upcoming)
  pct: number | null; // null when no requests that month
  commitmentPct: number; // 50
  meetsCommitment: boolean;
}

export interface TeamPersonProfile {
  id: string;
  name: string;
  email: string;
  mobile: string;
  memberships: TeamPersonMembership[];
  /** Serving requests in the last 4 weeks, most recent first. */
  history: TeamPersonServing[];
  /** Serving requests in the next 4 weeks, soonest first. */
  upcoming: TeamPersonServing[];
  /** Checked-in % for the previous calendar month. */
  pastMonth: TeamServeStats;
  /** Accepted % for the next calendar month. */
  nextMonth: TeamServeStats;
}

export type LoadTeamPersonResult = {
  person: TeamPersonProfile | null;
  /** True when the lookup succeeded but the person isn't on the leader's teams. */
  notFound?: boolean;
  error?: string;
};

export async function loadTeamPerson(
  leader: TeamSessionLeader,
  personId: string
): Promise<LoadTeamPersonResult> {
  const categoryId = leader.ccb_category_id ? String(leader.ccb_category_id) : null;
  if (!categoryId) {
    return { person: null, error: 'Your team has no CCB category configured yet. Contact your director.' };
  }
  if (!personId) {
    return { person: null, notFound: true };
  }

  // The leader's managed positions (admin-mutable config — never serve stale).
  const db = createServiceSupabaseClient({ noStore: true });
  const { data: positions, error: positionsError } = await db
    .from('host_team_positions')
    .select('ccb_position_id, position_name')
    .eq('leader_id', leader.id);

  if (positionsError) {
    return { person: null, error: positionsError.message };
  }
  if (!positions || positions.length === 0) {
    return { person: null, notFound: true };
  }

  const managedPositionIds = new Set(positions.map((p) => String(p.ccb_position_id)));
  const positionNameMap = new Map(positions.map((p) => [String(p.ccb_position_id), p.position_name]));

  const v2 = createCCBv2Client({
    module: 'Teams Toolkit',
    action: 'Fetch Person Profile',
    direction: 'pull',
    userId: null,
  });

  // Fetch one range wide enough to cover both the 4-week request lists and the
  // previous/next calendar months used by the serving-% metrics.
  const now = DateTime.now().setZone(CT_ZONE);
  const lastMonthStart = now.startOf('month').minus({ months: 1 });
  const lastMonthEnd = now.startOf('month').minus({ days: 1 });
  const nextMonthStart = now.startOf('month').plus({ months: 1 });
  const nextMonthEnd = now.startOf('month').plus({ months: 2 }).minus({ days: 1 });
  const fourWeeksAgo = now.minus({ days: WINDOW_DAYS });
  const fourWeeksAhead = now.plus({ days: WINDOW_DAYS });

  const fetchStart = DateTime.min(lastMonthStart, fourWeeksAgo);
  const fetchEnd = DateTime.max(nextMonthEnd, fourWeeksAhead);

  // These three reads are independent — fan out in parallel.
  let volunteers, category, occurrences;
  try {
    [volunteers, category, occurrences] = await Promise.all([
      v2.getCategoryVolunteers(categoryId),
      v2.getSchedulingCategory(categoryId),
      v2.getCategorySchedules(categoryId, {
        startDate: fetchStart.toISODate()!,
        endDate: fetchEnd.toISODate()!,
      }),
    ]);
  } catch (e: any) {
    return { person: null, error: e?.message || 'Could not load this person from CCB.' };
  }

  // position id → team name, from the category's team/position tree.
  const teamNameByPosition = new Map<string, string>();
  for (const team of category?.teams ?? []) {
    for (const pos of team.positions ?? []) {
      teamNameByPosition.set(String(pos.id), team.name);
    }
  }

  // The person's current memberships on the leader's managed positions, plus a
  // contact card from the first matching volunteer record.
  const memberships: TeamPersonMembership[] = [];
  let identity: { id: string; name: string; email: string; mobile: string } | null = null;
  for (const vol of volunteers) {
    if (!vol.individual) continue;
    if (String(vol.individual.id) !== String(personId)) continue;
    const posId = String(vol.positionId);
    if (!managedPositionIds.has(posId)) continue;

    if (!identity) {
      identity = {
        id: String(vol.individual.id),
        name: vol.individual.name,
        email: vol.individual.email,
        mobile: vol.individual.mobile,
      };
    }
    memberships.push({
      positionId: posId,
      positionName: positionNameMap.get(posId) || teamNameByPosition.get(posId) || posId,
      teamName: teamNameByPosition.get(posId) || '',
    });
  }

  if (!identity) {
    return { person: null, notFound: true };
  }

  memberships.sort((a, b) =>
    (a.teamName + a.positionName).localeCompare(b.teamName + b.positionName)
  );

  // Every assignment for this person in a managed position across the fetched
  // range. We bucket these into the display lists and the monthly metrics below.
  const requests: TeamPersonServing[] = [];
  for (const occ of occurrences) {
    for (const a of occ.assignments) {
      if (!a.individual) continue;
      if (String(a.individual.id) !== String(personId)) continue;
      if (!managedPositionIds.has(a.positionId)) continue;
      requests.push({
        occurrenceId: occ.id,
        date: occ.date,
        positionName: positionNameMap.get(a.positionId) || a.positionName || a.positionId,
        status: a.serveStatus,
        declineReason: a.declineReason,
      });
    }
  }

  const todayIso = now.toISODate()!;
  const fourWeeksAgoIso = fourWeeksAgo.toISODate()!;
  const fourWeeksAheadIso = fourWeeksAhead.toISODate()!;
  const inRange = (d: string, lo: string, hi: string) => !!d && d >= lo && d <= hi;

  // Last 4 weeks (past, inclusive of today), most recent first.
  const history = requests
    .filter((r) => inRange(r.date, fourWeeksAgoIso, todayIso))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Next 4 weeks (future), soonest first.
  const upcoming = requests
    .filter((r) => r.date > todayIso && r.date <= fourWeeksAheadIso)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const pastMonth = buildStats(
    requests.filter((r) => inRange(r.date, lastMonthStart.toISODate()!, lastMonthEnd.toISODate()!)),
    'checked_in',
    lastMonthStart.toFormat('LLLL')
  );
  const nextMonth = buildStats(
    requests.filter((r) => inRange(r.date, nextMonthStart.toISODate()!, nextMonthEnd.toISODate()!)),
    'accepted',
    nextMonthStart.toFormat('LLLL')
  );

  return {
    person: {
      id: identity.id,
      name: identity.name,
      email: identity.email,
      mobile: identity.mobile,
      memberships,
      history,
      upcoming,
      pastMonth,
      nextMonth,
    },
  };
}

/**
 * Serving % over a month's requests. `countStatus` is the serve status that
 * counts toward the numerator — 'checked_in' for completed months (actually
 * served) or 'accepted' for upcoming months (committed to serve).
 */
function buildStats(
  monthRequests: TeamPersonServing[],
  countStatus: ScheduleServeStatus,
  monthLabel: string
): TeamServeStats {
  const requests = monthRequests.length;
  const count = monthRequests.filter((r) => r.status === countStatus).length;
  const pct = requests > 0 ? Math.round((count / requests) * 100) : null;
  return {
    monthLabel,
    requests,
    count,
    pct,
    commitmentPct: COMMITMENT_PCT,
    meetsCommitment: pct != null && pct >= COMMITMENT_PCT,
  };
}
