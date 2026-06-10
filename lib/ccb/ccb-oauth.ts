/**
 * CCB (Church Community Builder) API v2 OAuth helper
 *
 * CCB's v2 OAuth flow is non-standard:
 *  - Authorize:  GET  https://oauth.ccbchurch.com/oauth/authorize
 *                  ?client_id=...&response_type=code&redirect_uri=...&subdomain=...
 *  - Token:      POST https://api.ccbchurch.com/oauth/token
 *                  { grant_type: "client_credentials", subdomain, client_id, client_secret, code }
 *                  Headers: Accept: application/vnd.ccbchurch.v2+json, Content-Type: application/json
 *
 * The response contains only `access_token` and `expires_in` — there is no
 * refresh token. The authorization `code` from the initial redirect is
 * reusable: when the access token expires, re-POST the same code to the
 * token endpoint to mint a new one. So we persist the code alongside the
 * current access token/expiry in the singleton `ccb_oauth_tokens` table.
 */

import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../server-supabase';

const OAUTH_AUTHORIZE_URL = 'https://oauth.ccbchurch.com/oauth/authorize';
const OAUTH_TOKEN_URL = 'https://api.ccbchurch.com/oauth/token';

// CCB doesn't document a token lifetime guarantee; refresh a bit early.
const EXPIRY_BUFFER_SECONDS = 300;

export interface CCBTokenResponse {
  access_token: string;
  expires_in?: number;
  [key: string]: unknown;
}

export interface CCBStoredTokens {
  authorizationCode: string;
  accessToken: string;
  expiresAt: DateTime;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function ccbSubdomain(): string {
  return requireEnv('CCB_SUBDOMAIN').trim();
}

/** Redirect URI registered with CCB for this app. */
export function getRedirectUri(): string {
  const appUrl = requireEnv('NEXT_PUBLIC_APP_URL').replace(/\/$/, '');
  return `${appUrl}/api/ccb/oauth/callback`;
}

/** Authorization endpoint the admin is redirected to for consent. */
export function getAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('CCB_OAUTH_CLIENT_ID'),
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    subdomain: ccbSubdomain(),
    state,
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange (or re-exchange) an authorization code for a fresh access token.
 * Per CCB's v2 API, the same code can be reused after the access token
 * expires.
 */
export async function exchangeCodeForToken(code: string): Promise<CCBTokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.ccbchurch.v2+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      subdomain: ccbSubdomain(),
      client_id: requireEnv('CCB_OAUTH_CLIENT_ID'),
      client_secret: requireEnv('CCB_OAUTH_CLIENT_SECRET'),
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`CCB OAuth token request failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<CCBTokenResponse>;
}

/** Persist the authorization code + current access token to the singleton row. */
export async function saveTokens(code: string, tokens: CCBTokenResponse): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const expiresInSeconds = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600;
  const expiresAt = DateTime.utc()
    .plus({ seconds: Math.max(expiresInSeconds - EXPIRY_BUFFER_SECONDS, 0) })
    .toISO();

  const { error } = await supabase
    .from('ccb_oauth_tokens')
    .upsert({
      id: 1,
      authorization_code: code,
      access_token: tokens.access_token,
      expires_at: expiresAt,
      updated_at: DateTime.utc().toISO(),
    });

  if (error) {
    throw new Error(`Failed to save CCB OAuth tokens: ${error.message}`);
  }
}

/** Read the stored token row, if any. */
export async function getStoredTokens(): Promise<CCBStoredTokens | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('ccb_oauth_tokens')
    .select('authorization_code, access_token, expires_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load CCB OAuth tokens: ${error.message}`);
  }
  if (!data) return null;

  return {
    authorizationCode: data.authorization_code,
    accessToken: data.access_token,
    expiresAt: DateTime.fromISO(data.expires_at),
  };
}

/**
 * Get a valid access token, re-exchanging the stored authorization code for
 * a fresh one if the current token has expired. Throws if CCB hasn't been
 * connected yet — callers should direct an admin to
 * `/api/ccb/oauth/authorize` first.
 */
export async function getValidAccessToken(): Promise<string> {
  const stored = await getStoredTokens();
  if (!stored) {
    throw new Error('No CCB OAuth tokens found. An admin must connect CCB via /api/ccb/oauth/authorize first.');
  }

  if (stored.expiresAt > DateTime.utc()) {
    return stored.accessToken;
  }

  const refreshed = await exchangeCodeForToken(stored.authorizationCode);
  await saveTokens(stored.authorizationCode, refreshed);
  return refreshed.access_token;
}
