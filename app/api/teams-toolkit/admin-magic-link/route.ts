/**
 * POST /api/teams-toolkit/admin-magic-link
 * Body: { leader_id, selfHosted? }
 *
 * Admin-only. Returns a magic-link URL the admin can text/share to a team
 * leader, or auto-login into the Teams Toolkit as them (selfHosted). RADIUS-
 * issued links are long-lived; access is revoked through the Toolkit access
 * toggle (`circle_summary_access_enabled`) or archived leader status.
 *
 * Mirrors app/api/circle-leader-toolkit/admin-magic-link/route.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { createSessionToken, RADIUS_LINK_TTL_MS } from '../../../../lib/leader-tokens';
import { isTeamsToolkitAccessEnabled } from '../../../../lib/teams-toolkit/session';
import { getTeamsToolkitBaseUrl } from '../../../../lib/teams-toolkit/links';
import { getAdminToolkitBaseUrl } from '../../../../lib/circle-leader-toolkit/links';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { isAdmin, error } = await verifyAdminAccess(req);
    if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });

    let body: { leader_id?: number | string; selfHosted?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (!body.leader_id) {
      return NextResponse.json({ error: 'leader_id is required.' }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const { data: leader, error: lookupError } = await supabase
      .from('circle_leaders')
      .select('id, name, phone, email, status, leader_type, ccb_category_id, circle_summary_access_enabled')
      .eq('id', body.leader_id)
      .single();
    if (lookupError || !leader) {
      return NextResponse.json({ error: lookupError?.message || 'Leader not found' }, { status: 404 });
    }
    if ((leader.leader_type || '') !== 'host_team') {
      return NextResponse.json({ error: 'This leader is not a team leader.' }, { status: 400 });
    }
    if (!isTeamsToolkitAccessEnabled(leader)) {
      return NextResponse.json({ error: 'Teams Toolkit access is disabled for this leader.' }, { status: 403 });
    }

    const token = createSessionToken(leader.id, RADIUS_LINK_TTL_MS);
    const targetPath = leader.ccb_category_id
      ? `/teams-toolkit/${encodeURIComponent(String(leader.ccb_category_id))}/roster`
      : '/teams-toolkit/roster';
    // `selfHosted` links (the admin "Open Teams Toolkit" auto-login button) stay
    // on the current RADIUS origin so the token is verified by the same
    // deployment that signed it — no cross-site LEADER_SESSION_SECRET sync
    // required. Leader-facing links (the texted sign-in link) keep the clean
    // dedicated toolkit domain.
    const baseUrl = body.selfHosted ? getAdminToolkitBaseUrl(req) : getTeamsToolkitBaseUrl(req);
    const url = new URL('/api/teams-toolkit/auth/link', baseUrl);
    url.searchParams.set('t', token);
    url.searchParams.set('next', targetPath);

    const leaderFirstName = leader.name?.split(' ')[0] || 'there';
    const messageBody = `Hi ${leaderFirstName}, the Teams Toolkit is your one-stop spot to view your team roster and schedule.\n\nHere's your personal link: ${url.toString()}`;

    return NextResponse.json({
      ok: true,
      url: url.toString(),
      targetPath,
      phone: leader.phone || null,
      email: leader.email || null,
      smsBody: messageBody,
      permanent: true,
    });
  } catch (err: unknown) {
    console.error('[teams-toolkit/admin-magic-link] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
