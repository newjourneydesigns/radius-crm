import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { CCB_V2_AUTHORIZE_URL, getCCBv2Config } from '../../../../../lib/ccb/ccb-v2-config';

export const dynamic = 'force-dynamic';

// Short-lived cookie holding the CSRF `state` value we expect back on the callback.
const STATE_COOKIE = 'ccb_v2_oauth_state';
const STATE_COOKIE_MAX_AGE = 10 * 60; // 10 minutes — long enough to complete the consent screen.

/**
 * Phase 0/1: kick off CCB v2 "System Auth". Redirects the (Master Admin) browser
 * to CCB's authorize screen. CCB redirects back to /api/ccb/oauth/callback with a
 * `code` we exchange for tokens. `scope` is omitted to default to all assigned scopes.
 */
export async function GET() {
  let config;
  try {
    config = getCCBv2Config();
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const state = randomBytes(32).toString('base64url');

  const url = new URL(CCB_V2_AUTHORIZE_URL);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('subdomain', config.subdomain);
  url.searchParams.set('state', state);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_COOKIE_MAX_AGE,
  });
  return response;
}
