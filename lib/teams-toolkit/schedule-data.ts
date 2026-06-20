/**
 * Loads a host-team leader's upcoming schedule: the scheduled occurrences for
 * their CCB category, with each occurrence's people limited to the positions
 * the leader manages, plus each person's CCB response (pending/accepted/
 * declined + reason). Read-only — CCB stays the system of record.
 *
 * Mirrors lib/teams-toolkit/roster-data.ts (same managed-position filter).
 */

import type { TeamSessionLeader } from './session';
import { createServiceSupabaseClient } from '../server-supabase';
import { createCCBv2Client } from '../ccb/ccb-v2-client';
import type { ScheduleResponseStatus } from '../ccb/ccb-v2-client';

export interface TeamScheduledPerson {
  id: number | string;
  name: string;
  email: string;
  mobile: string;
  status: ScheduleResponseStatus;
  declineReason: string;
}

export interface TeamSchedulePosition {
  positionId: string;
  positionName: string;
  people: TeamScheduledPerson[];
}

export interface TeamScheduleOccurrence {
  id: string;
  date: string; // YYYY-MM-DD
  dateTime: string;
  title: string;
  positions: TeamSchedulePosition[];
}

export type LoadTeamScheduleResult = {
  occurrences: TeamScheduleOccurrence[];
  error?: string;
};

function defaultRange(): { startDate: string; endDate: string } {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 42); // next ~6 weeks
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export async function loadTeamSchedule(
  leader: TeamSessionLeader,
  range?: { startDate?: string; endDate?: string }
): Promise<LoadTeamScheduleResult> {
  const categoryId = leader.ccb_category_id ? String(leader.ccb_category_id) : null;
  if (!categoryId) {
    return { occurrences: [], error: 'Your team has no CCB category configured yet. Contact your director.' };
  }

  const db = createServiceSupabaseClient();
  const { data: positions, error: positionsError } = await db
    .from('host_team_positions')
    .select('ccb_position_id, position_name')
    .eq('leader_id', leader.id);

  if (positionsError) {
    return { occurrences: [], error: positionsError.message };
  }
  if (!positions || positions.length === 0) {
    return { occurrences: [] };
  }

  const managedPositionIds = new Set(positions.map((p) => String(p.ccb_position_id)));
  const positionNameMap = new Map(positions.map((p) => [String(p.ccb_position_id), p.position_name]));

  const { startDate, endDate } = { ...defaultRange(), ...(range || {}) };

  const v2 = createCCBv2Client({
    module: 'Teams Toolkit',
    action: 'Fetch Category Schedules',
    direction: 'pull',
    userId: null,
  });

  let raw;
  try {
    raw = await v2.getCategorySchedules(categoryId, { startDate, endDate });
  } catch (e: any) {
    return { occurrences: [], error: e?.message || 'Could not load the schedule from CCB.' };
  }

  const occurrences: TeamScheduleOccurrence[] = [];
  for (const occ of raw) {
    // Keep only assignments in the leader's managed positions.
    const byPosition = new Map<string, TeamSchedulePosition>();
    for (const a of occ.assignments) {
      if (!managedPositionIds.has(a.positionId)) continue;
      if (!a.individual) continue;
      if (!byPosition.has(a.positionId)) {
        byPosition.set(a.positionId, {
          positionId: a.positionId,
          positionName: positionNameMap.get(a.positionId) || a.positionName || a.positionId,
          people: [],
        });
      }
      byPosition.get(a.positionId)!.people.push({
        id: a.individual.id,
        name: a.individual.name,
        email: a.individual.email,
        mobile: a.individual.mobile,
        status: a.status,
        declineReason: a.declineReason,
      });
    }

    if (byPosition.size === 0) continue; // nothing for this leader on this date

    const positionsOut = Array.from(byPosition.values())
      .sort((a, b) => a.positionName.localeCompare(b.positionName))
      .map((p) => ({ ...p, people: p.people.sort((x, y) => x.name.localeCompare(y.name)) }));

    occurrences.push({
      id: occ.id,
      date: occ.date,
      dateTime: occ.dateTime,
      title: occ.title,
      positions: positionsOut,
    });
  }

  occurrences.sort((a, b) => (a.date || a.dateTime).localeCompare(b.date || b.dateTime));
  return { occurrences };
}
