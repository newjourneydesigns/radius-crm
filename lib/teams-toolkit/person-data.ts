/**
 * Loads a single person's profile for a host-team leader: their contact info,
 * the team(s) + position(s) they currently hold on the leader's teams, and their
 * serving history over the last 4 weeks. Read-only — CCB is the system of record.
 *
 * Scope is the leader's *managed* positions only (same filter as the roster and
 * schedule loaders), so a leader only sees a person in the context of their own
 * teams.
 */

import { DateTime } from 'luxon';
import type { TeamSessionLeader } from './session';
import { createServiceSupabaseClient } from '../server-supabase';
import { createCCBv2Client } from '../ccb/ccb-v2-client';
import type { ScheduleResponseStatus } from '../ccb/ccb-v2-client';

const CT_ZONE = 'America/Chicago';
const HISTORY_DAYS = 28; // last 4 weeks

export interface TeamPersonMembership {
  positionId: string;
  positionName: string;
  teamName: string;
}

export interface TeamPersonServing {
  occurrenceId: string;
  date: string; // YYYY-MM-DD
  positionName: string;
  status: ScheduleResponseStatus;
  declineReason: string;
}

export interface TeamPersonProfile {
  id: string;
  name: string;
  email: string;
  mobile: string;
  memberships: TeamPersonMembership[];
  history: TeamPersonServing[];
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

  const end = DateTime.now().setZone(CT_ZONE);
  const start = end.minus({ days: HISTORY_DAYS });

  // These three reads are independent — fan out in parallel.
  let volunteers, category, occurrences;
  try {
    [volunteers, category, occurrences] = await Promise.all([
      v2.getCategoryVolunteers(categoryId),
      v2.getSchedulingCategory(categoryId),
      v2.getCategorySchedules(categoryId, {
        startDate: start.toISODate()!,
        endDate: end.toISODate()!,
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

  // Serving history: every assignment for this person in a managed position over
  // the window, most recent first.
  const history: TeamPersonServing[] = [];
  for (const occ of occurrences) {
    for (const a of occ.assignments) {
      if (!a.individual) continue;
      if (String(a.individual.id) !== String(personId)) continue;
      if (!managedPositionIds.has(a.positionId)) continue;
      history.push({
        occurrenceId: occ.id,
        date: occ.date,
        positionName: positionNameMap.get(a.positionId) || a.positionName || a.positionId,
        status: a.status,
        declineReason: a.declineReason,
      });
    }
  }
  history.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return {
    person: {
      id: identity.id,
      name: identity.name,
      email: identity.email,
      mobile: identity.mobile,
      memberships,
      history,
    },
  };
}
