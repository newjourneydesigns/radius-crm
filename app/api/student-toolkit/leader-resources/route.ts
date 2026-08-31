/**
 * GET /api/student-toolkit/leader-resources
 * The ordered Resources pages for the 'student' audience.
 *
 *   ?list=1 → titles/slugs only, for nav (skips page bodies)
 *
 * Staff author these through the existing admin Resources editor against the
 * shared `circle_leader_resource_pages` table; this route only reads them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionStudentLeader, unauthorized } from '../../../../lib/student-toolkit/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  const listOnly = new URL(req.url).searchParams.get('list') === '1';
  const columns = listOnly
    ? 'id, slug, title, updated_at'
    : 'id, slug, title, body_html, updated_at';

  const { data: pages, error } = await createServiceSupabaseClient()
    .from('circle_leader_resource_pages')
    .select(columns)
    .eq('audience', 'student')
    // sort_order is the nav order staff drag into place; created_at only breaks ties.
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ pages: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pages: pages || [] });
}
