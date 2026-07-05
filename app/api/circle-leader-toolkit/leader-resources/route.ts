/**
 * GET /api/circle-leader-toolkit/leader-resources
 * Returns the ordered Resources pages for the signed-in leader's audience.
 *
 *   ?list=1 → titles/slugs only (used by the nav dropdown; skips page bodies)
 *
 * Falls back to the legacy single-doc table when an audience has no pages yet
 * (migration not run / admin hasn't opened the new editor), so existing
 * content keeps rendering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const listOnly = new URL(req.url).searchParams.get('list') === '1';
  const supabase = createServiceSupabaseClient();
  const audience = leader.leader_type === 'host_team' ? 'host_team' : 'circle';

  const columns = listOnly
    ? 'id, slug, title, updated_at'
    : 'id, slug, title, body_html, updated_at';
  const { data: pages, error } = await supabase
    .from('circle_leader_resource_pages')
    .select(columns)
    .eq('audience', audience)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ pages: [], error: error.message }, { status: 500 });
  }

  // The Pro Tips catalog appears as a virtual last page whenever the audience
  // has at least one published tip. Its content comes from /pro-tips; here it
  // only claims a tab slot (slug is reserved by the admin API).
  const { count: tipCount } = await supabase
    .from('leader_pro_tips')
    .select('id', { count: 'exact', head: true })
    .eq('audience', audience)
    .lte('publish_at', new Date().toISOString());
  const proTipsPage =
    tipCount && tipCount > 0
      ? [{ id: 'pro-tips', slug: 'pro-tips', title: 'Pro Tips', kind: 'pro_tips' as const }]
      : [];

  if (pages && pages.length > 0) {
    return NextResponse.json({ pages: [...pages, ...proTipsPage] });
  }

  // Legacy fallback: serve the old single doc as one pseudo-page.
  const { data: legacy, error: legacyError } = await supabase
    .from('circle_leader_resources')
    .select('body_html, updated_at')
    .eq('audience', audience)
    .maybeSingle();

  if (legacyError) {
    return NextResponse.json({ pages: [], error: legacyError.message }, { status: 500 });
  }
  if (!legacy?.body_html || !legacy.body_html.trim()) {
    return NextResponse.json({ pages: proTipsPage });
  }
  return NextResponse.json({
    pages: [
      {
        id: 'legacy',
        slug: 'resources',
        title: 'Resources',
        updated_at: legacy.updated_at,
        ...(listOnly ? {} : { body_html: legacy.body_html }),
      },
      ...proTipsPage,
    ],
  });
}
