/**
 * GET /api/circle-summary/leader-resources
 * Returns the Circle Leader Resources HTML page for the signed-in leader.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-summary/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('circle_leader_resources')
    .select('body_html, updated_at')
    .eq('singleton', true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ resource: null, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    resource: data || { body_html: '', updated_at: null },
  });
}
