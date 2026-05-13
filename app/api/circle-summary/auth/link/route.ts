/**
 * GET /api/circle-summary/auth/link?t=TOKEN
 *
 * Sign-in via HMAC-signed magic link. Used by reminder emails. The token has
 * a 7-day TTL embedded; on click we verify and issue a fresh 30-day session
 * cookie, then redirect to the events list.
 *
 * The link token uses the same `createSessionToken` format used for the
 * session cookie itself, so any token issued for the leader works here.
 */

import { NextResponse } from 'next/server';
import { verifySessionToken } from '../../../../../lib/leader-tokens';
import { attachSessionCookie } from '../../../../../lib/circle-summary/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') || '';
  const next = url.searchParams.get('next') || '/circle-summary/events';

  const verified = verifySessionToken(token);
  if (!verified?.leaderId) {
    // Token bad or expired — bounce to sign-in with a hint
    const signIn = new URL('/circle-summary', req.url);
    signIn.searchParams.set('reason', 'link_expired');
    return NextResponse.redirect(signIn);
  }

  // Issue a fresh 30-day session cookie
  return attachSessionCookie(
    NextResponse.redirect(new URL(next, req.url)),
    verified.leaderId
  );
}
