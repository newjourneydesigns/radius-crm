import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, saveTokens } from '../../../../../lib/ccb/ccb-oauth';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'ccb_oauth_state';

/**
 * CCB redirects here after the admin approves access in the consent screen.
 * Verifies the `state` value set by /api/ccb/oauth/authorize, exchanges the
 * authorization code for tokens, and stores them in `ccb_oauth_tokens`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return redirectWithStatus(request, 'error', error);
  }

  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState) {
    return redirectWithStatus(request, 'error', 'invalid_state');
  }

  if (!code) {
    return redirectWithStatus(request, 'error', 'missing_code');
  }

  try {
    const tokens = await exchangeCodeForToken(code);
    await saveTokens(code, tokens);
  } catch (err: any) {
    console.error('CCB OAuth callback error:', err);
    return redirectWithStatus(request, 'error', 'token_exchange_failed');
  }

  const response = redirectWithStatus(request, 'connected');
  response.cookies.delete(STATE_COOKIE);
  return response;
}

function redirectWithStatus(request: NextRequest, status: string, detail?: string): NextResponse {
  const url = new URL('/settings', request.url);
  url.searchParams.set('ccb_oauth', status);
  if (detail) url.searchParams.set('ccb_oauth_detail', detail);
  return NextResponse.redirect(url);
}
