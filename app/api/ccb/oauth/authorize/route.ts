import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyAdminAccessDemo } from '../../../../../lib/auth-middleware';
import { getAuthorizeUrl } from '../../../../../lib/ccb/ccb-oauth';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'ccb_oauth_state';

/**
 * Starts the CCB API v2 OAuth flow. Admins hit this endpoint (with a valid
 * Supabase session token), and are redirected to CCB's consent screen. A
 * random state value is stored in a short-lived cookie and verified by the
 * callback to prevent CSRF.
 */
export async function GET(request: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccessDemo(request);
  if (!isAdmin) {
    return NextResponse.json({ error: error || 'Admin access required' }, { status: 403 });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const response = NextResponse.redirect(getAuthorizeUrl(state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/api/ccb/oauth',
  });

  return response;
}
