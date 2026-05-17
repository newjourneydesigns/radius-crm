/**
 * GET /api/circle-summary/messages
 * Returns active Message Center messages for the current leader's campus.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-summary/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

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
    return NextResponse.json({ messages: [], error: error.message }, { status: 500 });
  }

  const leaderCampus = leader.campus || null;
  const messages = (data || []).filter((m: any) => {
    const filter = Array.isArray(m.campus_filter) ? m.campus_filter : [];
    if (filter.length === 0) return true;
    return leaderCampus ? filter.includes(leaderCampus) : false;
  });

  return NextResponse.json({ messages });
}
