/**
 * POST /api/circle-summary/admin-magic-link
 * Body: { leader_id }
 *
 * Admin-only. Returns a magic-link URL the admin can text or share to a
 * Circle Leader. When the leader taps the link, they are auto-signed-in to
 * /circle-summary/events.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { createSessionToken } from '../../../../lib/leader-tokens';
import { isCircleSummaryAccessEnabled } from '../../../../lib/circle-summary/session';
import { getCircleSummaryBaseUrl } from '../../../../lib/circle-summary/links';

export const dynamic = 'force-dynamic';

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function POST(req: NextRequest) {
  try {
    const { isAdmin, error } = await verifyAdminAccess(req);
    if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });

    let body: { leader_id?: number | string } = {};
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
      .select('id, name, phone, email, status, circle_summary_access_enabled')
      .eq('id', body.leader_id)
      .single();
    if (lookupError || !leader) {
      return NextResponse.json({ error: lookupError?.message || 'Leader not found' }, { status: 404 });
    }
    if (!isCircleSummaryAccessEnabled(leader)) {
      return NextResponse.json({ error: 'Circle Summary access is disabled for this leader.' }, { status: 403 });
    }

    const token = createSessionToken(leader.id, TTL_MS);
    const url = new URL('/api/circle-summary/auth/link', getCircleSummaryBaseUrl(req));
    url.searchParams.set('t', token);
    url.searchParams.set('next', '/circle-summary/events');

    const messageBody = `Hi ${leader.name?.split(' ')[0] || 'there'}, here's your link to report your Circle event summary: ${url.toString()}`;

    return NextResponse.json({
      ok: true,
      url: url.toString(),
      phone: leader.phone || null,
      email: leader.email || null,
      smsBody: messageBody,
      expiresInDays: 7,
    });
  } catch (err: unknown) {
    console.error('[admin-magic-link] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
