/**
 * CCB API v2 OAuth 2.0 helper
 *
 * Handles the authorization-code flow used by CCB's v2 REST API, and
 * persists the resulting access/refresh tokens in the singleton
 * `ccb_oauth_tokens` table (service-role access only).
 */

import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../server-supabase';

export interface CCBTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number; // seconds
  scope?: string;
}

export interface CCBStoredTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string | null;
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

/** Authorization endpoint the user is redirected to for consent. */
export function getAuthorizeUrl(state: string): string {
  const base = process.env.CCB_OAUTH_AUTHORIZE_URL || `https://${ccbSubdomain()}.ccbchurch.com/api/oauth/authorize`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: requireEnv('CCB_OAUTH_CLIENT_ID'),
    redirect_uri: getRedirectUri(),
    state,
  });
  if (process.env.CCB_OAUTH_SCOPE) {
    params.set('scope', process.env.CCB_OAUTH_SCOPE);
  }
  return `${base}?${params.toString()}`;
}

/** Token endpoint used to exchange a code (or refresh token) for tokens. */
function getTokenUrl(): string {
  return process.env.CCB_OAUTH_TOKEN_URL || `https://${ccbSubdomain()}.ccbchurch.com/api/oauth/token`;
}

/** Redirect URI registered with CCB for this app. */
export function getRedirectUri(): string {
  const appUrl = requireEnv('NEXT_PUBLIC_APP_URL').replace(/\/$/, '');
  return `${appUrl}/api/ccb/oauth/callback`;
}

async function requestTokens(body: Record<string, string>): Promise<CCBTokenResponse> {
  const res = await fetch(getTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requireEnv('CCB_OAUTH_CLIENT_ID'),
      client_secret: requireEnv('CCB_OAUTH_CLIENT_SECRET'),
      ...body,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`CCB OAuth token request failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<CCBTokenResponse>;
}

/** Exchange an authorization code (from the callback redirect) for tokens. */
export async function exchangeCodeForTokens(code: string): Promise<CCBTokenResponse> {
  return requestTokens({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
  });
}

/** Use a refresh token to obtain a new access token. */
export async function refreshTokens(refreshToken: string): Promise<CCBTokenResponse> {
  return requestTokens({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

/** Persist tokens to the singleton `ccb_oauth_tokens` row. */
export async function saveTokens(tokens: CCBTokenResponse): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const expiresAt = DateTime.utc().plus({ seconds: tokens.expires_in }).toISO();

  const { error } = await supabase
    .from('ccb_oauth_tokens')
    .upsert({
      id: 1,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope ?? null,
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
    .select('access_token, refresh_token, token_type, scope, expires_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load CCB OAuth tokens: ${error.message}`);
  }
  if (!data) return null;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type,
    scope: data.scope,
    expiresAt: DateTime.fromISO(data.expires_at),
  };
}

/**
 * Get a valid access token, refreshing it first if it's expired (or about to
 * expire within the next minute). Throws if no tokens have been stored yet —
 * callers should direct an admin to `/api/ccb/oauth/authorize` first.
 */
export async function getValidAccessToken(): Promise<string> {
  const stored = await getStoredTokens();
  if (!stored) {
    throw new Error('No CCB OAuth tokens found. An admin must connect CCB via /api/ccb/oauth/authorize first.');
  }

  if (stored.expiresAt > DateTime.utc().plus({ minutes: 1 })) {
    return stored.accessToken;
  }

  const refreshed = await refreshTokens(stored.refreshToken);
  await saveTokens(refreshed);
  return refreshed.access_token;
}
