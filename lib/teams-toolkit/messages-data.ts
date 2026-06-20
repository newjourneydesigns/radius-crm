/**
 * Message Center loader for the Teams Toolkit. Reads the same admin-managed
 * `circle_summary_messages` table the Circle Leader Toolkit uses, filtered to
 * the leader's campus. Mirrors loadLeaderMessages in
 * lib/circle-leader-toolkit/events-data.ts but is typed for a team leader.
 */

import { createServiceSupabaseClient } from '../server-supabase';

export type TeamMessage = {
  id: string;
  header: string;
  body_html: string;
  url: string | null;
  url_label: string | null;
};

type MessageRow = {
  id: string;
  header: string;
  body_html: string;
  url: string | null;
  url_label: string | null;
  campus_filter: string[] | null;
  priority: number | null;
};

export async function loadTeamMessages(leader: { campus: string | null }): Promise<TeamMessage[]> {
  const supabase = createServiceSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('circle_summary_messages')
    .select('id, header, body_html, url, url_label, campus_filter, priority')
    .or(`start_date.is.null,start_date.lte.${today}`)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[teams-toolkit] loadTeamMessages failed:', error.message);
    return [];
  }

  const leaderCampus = leader.campus || null;
  return ((data || []) as MessageRow[])
    .filter((m) => {
      const filter = Array.isArray(m.campus_filter)
        ? m.campus_filter.filter((value): value is string => typeof value === 'string')
        : [];
      if (filter.length === 0) return true;
      return leaderCampus ? filter.includes(leaderCampus) : false;
    })
    .map((m) => ({
      id: m.id,
      header: m.header,
      body_html: m.body_html,
      url: m.url ?? null,
      url_label: m.url_label ?? null,
    }));
}
