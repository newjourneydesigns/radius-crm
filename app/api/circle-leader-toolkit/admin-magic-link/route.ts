/**
 * POST /api/circle-leader-toolkit/admin-magic-link
 * Body: { leader_id }
 *
 * Admin-only. Returns a magic-link URL the admin can text or share to a
 * Circle Leader. Radius-issued links are long-lived; access is revoked through
 * Circle Summary access controls or archived leader status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { createSessionToken, RADIUS_LINK_TTL_MS } from '../../../../lib/leader-tokens';
import { isCircleSummaryAccessEnabled } from '../../../../lib/circle-leader-toolkit/session';
import { getCircleSummaryBaseUrl, getAdminToolkitBaseUrl } from '../../../../lib/circle-leader-toolkit/links';

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
      .select('id, name, phone, email, status, ccb_group_id, circle_summary_access_enabled')
      .eq('id', body.leader_id)
      .single();
    if (lookupError || !leader) {
      return NextResponse.json({ error: lookupError?.message || 'Leader not found' }, { status: 404 });
    }
    if (!isCircleSummaryAccessEnabled(leader)) {
      return NextResponse.json({ error: 'Circle Summary access is disabled for this leader.' }, { status: 403 });
    }

    const token = createSessionToken(leader.id, RADIUS_LINK_TTL_MS);
    const targetPath = leader.ccb_group_id
      ? `/circle-leader-toolkit/${encodeURIComponent(String(leader.ccb_group_id))}/events/`
      : '/circle-leader-toolkit/events';
    // `selfHosted` links (the admin "Open Toolkit" auto-login button) stay on the
    // current RADIUS origin so the token is verified by the same deployment that
    // signed it — no cross-site LEADER_SESSION_SECRET sync required. Leader-facing
    // links (e.g. the texted sign-in link) keep the clean dedicated toolkit domain.
    const baseUrl = body.selfHosted ? getAdminToolkitBaseUrl(req) : getCircleSummaryBaseUrl(req);
    const url = new URL('/api/circle-leader-toolkit/auth/link', baseUrl);
    url.searchParams.set('t', token);
    url.searchParams.set('next', targetPath);

    const leaderFirstName = leader.name?.split(' ')[0] || 'there';
    const messageBody = `Hi ${leaderFirstName}, the Circles Toolkit is your new one-stop spot to manage your Circle and submit your event summaries.\n\nHere’s your personal link: ${url.toString()}`;

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
    console.error('[admin-magic-link] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
