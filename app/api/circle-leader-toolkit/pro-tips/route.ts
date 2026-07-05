/**
 * GET /api/circle-leader-toolkit/pro-tips
 * Published Pro Tips (publish_at has arrived) for the signed-in leader's
 * audience, newest first. Scheduled tips stay invisible until their time —
 * visibility is a query-time filter, no delivery job involved.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const supabase = createServiceSupabaseClient();
  const audience = leader.leader_type === 'host_team' ? 'host_team' : 'circle';
  const { data, error } = await supabase
    .from('leader_pro_tips')
    .select('id, title, youtube_url, body_html, publish_at')
    .eq('audience', audience)
    .lte('publish_at', new Date().toISOString())
    .order('publish_at', { ascending: false });

  if (error) {
    return NextResponse.json({ tips: [], error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tips: data || [] });
}
