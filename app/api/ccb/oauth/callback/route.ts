import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { exchangeAuthorizationCode, saveTokensFromResponse } from '../../../../../lib/ccb/ccb-v2-auth';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'ccb_v2_oauth_state';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * CCB v2 OAuth callback. Verifies the CSRF `state`, exchanges the one-time
 * authorization code for tokens, and persists them (encrypted) so all future
 * requests can mint access tokens from the refresh token with no human action.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const returnedState = searchParams.get('state');
  const oauthError = searchParams.get('error');

  if (oauthError) {
    return NextResponse.json(
      { error: 'CCB denied authorization', detail: oauthError, description: searchParams.get('error_description') },
      { status: 400 }
    );
  }
  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  // CSRF check: the state we set in /start must match what CCB returns.
  const cookieHeader = request.headers.get('cookie') || '';
  const expectedState = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);

  if (!expectedState || !returnedState || !safeEqual(expectedState, returnedState)) {
    return NextResponse.json({ error: 'Invalid or missing OAuth state (possible CSRF)' }, { status: 400 });
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    await saveTokensFromResponse(tokens);

    const response = NextResponse.json({
      ok: true,
      connected: true,
      scope: tokens.scope ?? null,
      expires_in: tokens.expires_in ?? null,
      message: 'CCB v2 connected. Tokens are stored and will refresh automatically.',
    });
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to connect CCB v2', detail: error.message }, { status: 502 });
  }
}
