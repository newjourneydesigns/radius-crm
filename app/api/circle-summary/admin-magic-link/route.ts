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
      .select('id, name, phone, email')
      .eq('id', body.leader_id)
      .single();
    if (lookupError || !leader) {
      return NextResponse.json({ error: lookupError?.message || 'Leader not found' }, { status: 404 });
    }

    const token = createSessionToken(leader.id, TTL_MS);
    // Use the host the admin is currently on. Avoids cross-domain cookie loss
    // when NEXT_PUBLIC_APP_URL points at a custom domain that 301s to the
    // netlify.app host (or vice versa) — cookies don't survive that hop.
    const forwardedHost = req.headers.get('x-forwarded-host');
    const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
    const origin = forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : new URL(req.url).origin;
    const url = new URL('/api/circle-summary/auth/link', origin);
    url.searchParams.set('t', token);
    url.searchParams.set('next', '/circle-summary/events');

    const messageBody = `Hi ${leader.name?.split(' ')[0] || 'there'}, here's your Circle Summary link (signs you in automatically, no password): ${url.toString()}`;

    return NextResponse.json({
      ok: true,
      url: url.toString(),
      phone: leader.phone || null,
      email: leader.email || null,
      smsBody: messageBody,
      expiresInDays: 7,
    });
  } catch (err: any) {
    console.error('[admin-magic-link] error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
