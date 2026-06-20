/**
 * Session helpers for the Teams Toolkit.
 *
 * Team leaders are `circle_leaders` rows with `leader_type = 'host_team'`. They
 * share the same passwordless leader-session infrastructure as the Circle
 * Leader Toolkit — the opaque session cookie, the `leader_sessions` table, and
 * the OTP flow are all keyed by `leader_id` and are leader-type agnostic. So we
 * reuse the cookie read/write helpers from the circle session module and only
 * add a teams-specific profile loader + eligibility gate here.
 */

import { cache } from 'react';
import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../server-supabase';
import {
  getSessionLeaderId,
  attachSessionCookie,
  refreshSessionCookie,
  revokeCurrentSession,
  revokeLeaderSessions,
  clearSessionCookie,
} from '../circle-leader-toolkit/session';

export type TeamSessionLeader = {
  id: number | string;
  name: string;
  email: string | null;
  phone: string | null;
  campus: string | null;
  acpd: string | null;
  status: string | null;
  team_name: string | null;
  director: string | null;
  ccb_category_id?: string | null;
  leader_type?: string | null;
  circle_summary_access_enabled?: boolean | null;
};

const INELIGIBLE_STATUSES = new Set(['archive', 'archived']);

/** A leader can use the Teams Toolkit only if they are a host-team leader in an
 *  eligible (non-archived) status. */
export function isTeamLeaderEligible(
  leader: Pick<TeamSessionLeader, 'status' | 'leader_type'> | null
): boolean {
  if (!leader) return false;
  if ((leader.leader_type || '').trim().toLowerCase() !== 'host_team') return false;
  const status = (leader.status || '').trim().toLowerCase();
  return !INELIGIBLE_STATUSES.has(status);
}

export function isTeamsToolkitAccessEnabled(
  leader: Pick<TeamSessionLeader, 'status' | 'leader_type' | 'circle_summary_access_enabled'> | null
): boolean {
  if (!isTeamLeaderEligible(leader)) return false;
  return leader?.circle_summary_access_enabled !== false;
}

/**
 * Read the session cookie, then load the team leader's profile from Supabase.
 * Wrapped in React `cache()` so the layout + page in a single render share one
 * lookup. Returns null when there's no session or the leader isn't an eligible
 * host-team leader (so the Teams host can't be used by circle-only leaders).
 */
export const getSessionLeader = cache(async function getSessionLeader(): Promise<TeamSessionLeader | null> {
  const leaderId = await getSessionLeaderId();
  if (!leaderId) return null;

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('circle_leaders')
    .select('id, name, email, phone, campus, acpd, status, team_name, director, ccb_category_id, leader_type, circle_summary_access_enabled')
    .eq('id', leaderId)
    .maybeSingle();

  if (error) {
    console.error('[teams-toolkit] Failed to load session leader:', error);
    return null;
  }

  const leader = (data as TeamSessionLeader | null) ?? null;
  if (!isTeamsToolkitAccessEnabled(leader)) return null;
  return leader;
});

export function unauthorized() {
  return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
}

// Cookie helpers are shared with the Circle Leader Toolkit (same session table
// + cookie). Re-export so teams routes import everything from one place.
export {
  getSessionLeaderId,
  attachSessionCookie,
  refreshSessionCookie,
  revokeCurrentSession,
  revokeLeaderSessions,
  clearSessionCookie,
};
