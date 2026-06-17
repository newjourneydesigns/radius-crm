/**
 * CCB API v2 OAuth token manager.
 *
 * Verified live 2026-06-17: CCB v2 issues a long-lived refresh_token plus a
 * short-lived access_token (TTL ~7200s). Flow:
 *   1. Admin authorizes once (authorization_code grant) → /api/ccb/oauth/callback
 *      calls saveTokensFromResponse().
 *   2. Every request calls getValidAccessToken(), which returns the cached token
 *      or transparently refreshes it via the refresh_token grant.
 *
 * Tokens are AES-256-GCM encrypted at rest. The key is derived from the
 * service-role secret (which already gates the table), so a DB-only leak can't
 * yield a usable token and we avoid introducing another managed secret.
 */

import { DateTime } from 'luxon';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import { createServiceSupabaseClient } from '../server-supabase';
import {
  CCB_V2_TOKEN_URL,
  CCB_V2_ACCEPT_HEADER,
  getCCBv2Config,
} from './ccb-v2-config';

// Refresh once the access token is within this window of expiry.
const EXPIRY_BUFFER_SECONDS = 60;

export interface CCBv2TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  [key: string]: unknown;
}

// ---- Encryption (AES-256-GCM, key derived from the service-role secret) ----

let cachedKey: Buffer | null = null;
function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to encrypt CCB v2 tokens');
  }
  cachedKey = scryptSync(secret, 'ccb-v2-oauth', 32);
  return cachedKey;
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ---- Token endpoint calls ----

async function postToken(body: Record<string, string>): Promise<CCBv2TokenResponse> {
  const res = await fetch(CCB_V2_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: CCB_V2_ACCEPT_HEADER,
    },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  let json: CCBv2TokenResponse;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`CCB v2 token endpoint returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || !json.access_token) {
    throw new Error(`CCB v2 token request failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  return json;
}

/** Exchange the one-time authorization code (initial connect) for tokens. */
export function exchangeAuthorizationCode(code: string): Promise<CCBv2TokenResponse> {
  const cfg = getCCBv2Config();
  return postToken({
    grant_type: 'authorization_code',
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    subdomain: cfg.subdomain,
  });
}

/** Mint a fresh access token from the stored refresh token. */
export function refreshAccessToken(refreshToken: string): Promise<CCBv2TokenResponse> {
  const cfg = getCCBv2Config();
  return postToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    subdomain: cfg.subdomain,
  });
}

// ---- Persistence ----

export interface StoredCCBv2Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: DateTime;
  scope: string | null;
}

/**
 * Persist a token response to the singleton row. `fallbackRefreshToken` keeps
 * the existing refresh token when CCB doesn't rotate it on refresh.
 */
export async function saveTokensFromResponse(
  tokens: CCBv2TokenResponse,
  fallbackRefreshToken?: string,
): Promise<void> {
  const refreshToken = tokens.refresh_token || fallbackRefreshToken;
  if (!refreshToken) {
    throw new Error('CCB v2 token response had no refresh_token and no fallback to reuse');
  }
  const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600;
  const expiresAt = DateTime.utc().plus({ seconds: expiresIn }).toISO();

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from('ccb_oauth_tokens').upsert({
    id: 1,
    access_token: encrypt(tokens.access_token),
    refresh_token: encrypt(refreshToken),
    expires_at: expiresAt,
    scope: tokens.scope ?? null,
    updated_at: DateTime.utc().toISO(),
  });
  if (error) {
    throw new Error(`Failed to save CCB v2 tokens: ${error.message}`);
  }
}

export async function getStoredTokens(): Promise<StoredCCBv2Tokens | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('ccb_oauth_tokens')
    .select('access_token, refresh_token, expires_at, scope')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load CCB v2 tokens: ${error.message}`);
  if (!data) return null;
  return {
    accessToken: decrypt(data.access_token),
    refreshToken: decrypt(data.refresh_token),
    expiresAt: DateTime.fromISO(data.expires_at, { zone: 'utc' }),
    scope: data.scope ?? null,
  };
}

export async function isCCBv2Connected(): Promise<boolean> {
  try {
    return (await getStoredTokens()) !== null;
  } catch {
    return false;
  }
}

/**
 * Return a valid access token, refreshing transparently when within the expiry
 * buffer. Throws if CCB has never been connected (admin must visit
 * /api/ccb/oauth/start once).
 *
 * NOTE: serverless instances don't share memory, so two instances could refresh
 * concurrently at the expiry boundary. With a 2h token lifetime this is rare;
 * if CCB rotates refresh tokens aggressively we'll add a DB advisory lock.
 */
export async function getValidAccessToken(): Promise<string> {
  const stored = await getStoredTokens();
  if (!stored) {
    throw new Error('CCB v2 is not connected. An admin must authorize via /api/ccb/oauth/start.');
  }

  const threshold = DateTime.utc().plus({ seconds: EXPIRY_BUFFER_SECONDS });
  if (stored.expiresAt > threshold) {
    return stored.accessToken;
  }

  const refreshed = await refreshAccessToken(stored.refreshToken);
  await saveTokensFromResponse(refreshed, stored.refreshToken);
  return refreshed.access_token;
}
