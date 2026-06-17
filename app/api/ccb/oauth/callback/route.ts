import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import {
  CCB_V2_TOKEN_URL,
  CCB_V2_ACCEPT_HEADER,
  getCCBv2Config,
} from '../../../../../lib/ccb/ccb-v2-config';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'ccb_v2_oauth_state';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * CCB v2 OAuth callback. Verifies the CSRF `state`, exchanges the `code` for
 * tokens, and (Phase 0) returns a MASKED summary without persisting anything.
 * Phase 1 will swap the summary for encrypted persistence into ccb_oauth_tokens.
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

  let config;
  try {
    config = getCCBv2Config();
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Exchange the code for tokens.
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    subdomain: config.subdomain,
  });

  let tokenJson: any;
  try {
    const res = await fetch(CCB_V2_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: CCB_V2_ACCEPT_HEADER,
      },
      body: body.toString(),
    });
    const text = await res.text();
    try {
      tokenJson = JSON.parse(text);
    } catch {
      tokenJson = { raw: text };
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Token exchange failed', status: res.status, detail: tokenJson },
        { status: 502 }
      );
    }
  } catch (error: any) {
    return NextResponse.json({ error: 'Token exchange request failed', detail: error.message }, { status: 502 });
  }

  // Phase 0: confirm the flow works WITHOUT persisting secrets. Mask the tokens.
  const mask = (t: unknown) => (typeof t === 'string' && t.length > 8 ? `${t.slice(0, 4)}…${t.slice(-4)}` : t ? 'present' : 'absent');
  const summary = {
    ok: true,
    note: 'Phase 0 verification — tokens NOT persisted. Server logs hold the masked summary only.',
    token_type: tokenJson.token_type ?? null,
    expires_in: tokenJson.expires_in ?? null,
    scope: tokenJson.scope ?? null,
    access_token: mask(tokenJson.access_token),
    refresh_token: mask(tokenJson.refresh_token),
    has_refresh_token: Boolean(tokenJson.refresh_token),
  };
  console.log('[ccb-v2-oauth] token exchange succeeded:', summary);

  const response = NextResponse.json({
    ...summary,
    nextStep: 'Visit /api/ccb/oauth/probe to run the v1↔v2 ID-parity check (token is passed via a short-lived httpOnly cookie).',
  });
  response.cookies.delete(STATE_COOKIE);

  // Phase 0 only: stash the access token in a short-lived httpOnly cookie so the
  // throwaway probe route can read it without the token ever being displayed or
  // copy-pasted. Remove this together with the probe route after the parity gate.
  if (typeof tokenJson.access_token === 'string') {
    const ttl = Number(tokenJson.expires_in);
    response.cookies.set('ccb_v2_probe_token', tokenJson.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: Number.isFinite(ttl) && ttl > 0 ? Math.min(ttl, 3600) : 1800,
    });
  }
  return response;
}
