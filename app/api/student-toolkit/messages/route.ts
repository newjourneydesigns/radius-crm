/**
 * GET /api/student-toolkit/messages
 * Active Message Center posts for the signed-in student leader.
 *
 * Reads the shared `circle_summary_messages` table filtered to the 'student'
 * audience, so staff post from the Message Center they already know. A post is
 * shown when its date window is open and its campus filter is empty or contains
 * the leader's campus.
 */

import { NextResponse } from 'next/server';
import { getSessionStudentLeader, unauthorized } from '../../../../lib/student-toolkit/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export type StudentMessage = {
  id: string;
  header: string;
  body_html: string;
  url: string | null;
  url_label: string | null;
};

type MessageRow = StudentMessage & {
  campus_filter: string[] | null;
  priority: number | null;
};

export async function GET() {
  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  const supabase = createServiceSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('circle_summary_messages')
    .select('id, header, body_html, url, url_label, campus_filter, priority')
    .eq('audience', 'student')
    .or(`start_date.is.null,start_date.lte.${today}`)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[student-toolkit] messages load failed:', error.message);
    return NextResponse.json({ messages: [], error: error.message }, { status: 500 });
  }

  // campus_filter is a text[]; empty or absent means every campus sees the post.
  const leaderCampus = leader.campus || null;
  const messages: StudentMessage[] = ((data || []) as MessageRow[])
    .filter((message) => {
      const campuses = Array.isArray(message.campus_filter)
        ? message.campus_filter.filter((value): value is string => typeof value === 'string')
        : [];
      if (campuses.length === 0) return true;
      return leaderCampus ? campuses.includes(leaderCampus) : false;
    })
    .map((message) => ({
      id: message.id,
      header: message.header,
      body_html: message.body_html,
      url: message.url ?? null,
      url_label: message.url_label ?? null,
    }));

  return NextResponse.json({ messages });
}
