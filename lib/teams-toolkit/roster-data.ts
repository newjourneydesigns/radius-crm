/**
 * Loads a host-team leader's roster: the volunteers in their CCB scheduling
 * category, filtered to the positions they manage and grouped by position.
 *
 * This is the same logic the admin route `/api/ccb/serve-team-roster` runs, but
 * keyed off a Teams Toolkit session leader instead of an admin request, so a
 * signed-in team leader can see their own roster.
 */

import type { TeamSessionLeader } from './session';
import { createServiceSupabaseClient } from '../server-supabase';
import { createCCBv2Client } from '../ccb/ccb-v2-client';

export interface TeamRosterPosition {
  positionId: string;
  positionName: string;
  volunteers: Array<{
    id: number;
    name: string;
    email: string;
    mobile: string;
    birthday: string;
    status: string;
  }>;
}

export type LoadTeamRosterResult = {
  positions: TeamRosterPosition[];
  error?: string;
};

export async function loadTeamRoster(leader: TeamSessionLeader): Promise<LoadTeamRosterResult> {
  const categoryId = leader.ccb_category_id ? String(leader.ccb_category_id) : null;
  if (!categoryId) {
    return { positions: [], error: 'Your team has no CCB category configured yet. Contact your director.' };
  }

  // no-store: positions are admin-mutable config that must not be served stale
  // (Next.js caches service GETs by URL otherwise — see serve-team-roster).
  const db = createServiceSupabaseClient({ noStore: true });
  const { data: positions, error: positionsError } = await db
    .from('host_team_positions')
    .select('ccb_position_id, ccb_team_id, position_name')
    .eq('leader_id', leader.id);

  if (positionsError) {
    return { positions: [], error: positionsError.message };
  }
  if (!positions || positions.length === 0) {
    return { positions: [] };
  }

  const managedPositionIds = new Set(positions.map((p) => String(p.ccb_position_id)));
  const positionNameMap = new Map(positions.map((p) => [String(p.ccb_position_id), p.position_name]));

  // No admin/bearer token here — a leader session has no Supabase JWT — so we
  // build the CCB telemetry context directly (userId null).
  const v2 = createCCBv2Client({
    module: 'Teams Toolkit',
    action: 'Fetch Category Volunteers',
    direction: 'pull',
    userId: null,
  });

  let allVolunteers;
  try {
    allVolunteers = await v2.getCategoryVolunteers(categoryId);
  } catch (e: any) {
    return { positions: [], error: e?.message || 'Could not load roster from CCB.' };
  }

  const byPosition = new Map<string, TeamRosterPosition>();
  for (const vol of allVolunteers) {
    const posId = String(vol.positionId);
    if (!managedPositionIds.has(posId)) continue;
    if (!vol.individual) continue;

    if (!byPosition.has(posId)) {
      byPosition.set(posId, {
        positionId: posId,
        positionName: positionNameMap.get(posId) ?? posId,
        volunteers: [],
      });
    }

    byPosition.get(posId)!.volunteers.push({
      id: vol.individual.id,
      name: vol.individual.name,
      email: vol.individual.email,
      mobile: vol.individual.mobile,
      birthday: vol.individual.birthday,
      status: vol.status,
    });
  }

  const result = Array.from(byPosition.values())
    .sort((a, b) => a.positionName.localeCompare(b.positionName))
    .map((p) => ({
      ...p,
      volunteers: p.volunteers.sort((a, b) => a.name.localeCompare(b.name)),
    }));

  return { positions: result };
}
