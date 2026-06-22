/**
 * Helpers for reading/writing the leader session cookie inside Next.js
 * App Router API routes.
 */

import { cache } from 'react';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  createOpaqueSessionToken,
  hashSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_SECONDS,
} from '../leader-tokens';
import { createServiceSupabaseClient } from '../server-supabase';

export type SessionLeader = {
  id: number | string;
  name: string;
  email: string | null;
  phone: string | null;
  campus: string | null;
  acpd: string | null;
  status: string | null;
  day: string | null;
  time: string | null;
  ccb_group_id?: string | null;
  ccb_profile_link?: string | null;
  circle_summary_access_enabled?: boolean | null;
  // 'circle' | 'host_team' — selects which toolkit content (Message Center,
  // Resources) the leader sees. Defaults to 'circle' when unset.
  leader_type?: string | null;
};

const INELIGIBLE_STATUSES = new Set(['archive', 'archived']);
const TEMP_SESSION_EXPIRES_COOKIE_NAME = `${SESSION_COOKIE_NAME}_expires`;

// `last_seen_at` is telemetry, not auth state — don't block the request on it.
// We only bother writing when the stored value is older than this, which keeps
// the write off the critical path AND collapses the write volume for the
// several auth handshakes a single page load triggers.
const LAST_SEEN_THROTTLE_MS = 60_000;

function getSessionCookieValue(): string | null {
  return cookies().get(SESSION_COOKIE_NAME)?.value ?? null;
}

function getRequestIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded || req.headers.get('x-real-ip') || '';
  return /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : null;
}

export function isLeaderEligible(leader: Pick<SessionLeader, 'status'> | null): boolean {
  if (!leader) return false;
  const status = (leader.status || '').trim().toLowerCase();
  return !INELIGIBLE_STATUSES.has(status);
}

export function isCircleSummaryAccessEnabled(
  leader: Pick<SessionLeader, 'status' | 'circle_summary_access_enabled'> | null
): boolean {
  if (!isLeaderEligible(leader)) return false;
  return leader?.circle_summary_access_enabled !== false;
}

function isMigrationMissingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybe = err as { code?: string; message?: string; details?: string };
  const text = `${maybe.code || ''} ${maybe.message || ''} ${maybe.details || ''}`.toLowerCase();
  return (
    text.includes('circle_summary_access_enabled') ||
    text.includes('leader_sessions') ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('could not find')
  );
}

function getTemporarySessionExpiresMs(): number | null {
  const raw = cookies().get(TEMP_SESSION_EXPIRES_COOKIE_NAME)?.value ?? null;
  if (!raw) return null;
  const expiresMs = Number(raw);
  return Number.isFinite(expiresMs) ? expiresMs : null;
}

function setTemporarySessionExpiresCookie(res: NextResponse, expiresMs: number, maxAgeSeconds: number): NextResponse {
  res.cookies.set({
    name: TEMP_SESSION_EXPIRES_COOKIE_NAME,
    value: String(expiresMs),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
  return res;
}

function clearTemporarySessionExpiresCookie(res: NextResponse): NextResponse {
  res.cookies.set({
    name: TEMP_SESSION_EXPIRES_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

function isTemporarySessionExpired(): boolean {
  const expiresMs = getTemporarySessionExpiresMs();
  return expiresMs !== null && Date.now() >= expiresMs;
}

function setSessionCookie(res: NextResponse, token: string, maxAgeSeconds = SESSION_COOKIE_MAX_AGE_SECONDS): NextResponse {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
  return res;
}

/** Read the session cookie and return the verified leader_id, or null. */
export async function getSessionLeaderId(): Promise<string | null> {
  const c = getSessionCookieValue();
  if (!c) return null;
  if (isTemporarySessionExpired()) return null;

  const tokenHash = hashSessionToken(c);
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('leader_sessions')
    .select('leader_id')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .maybeSingle();

  if (error) {
    if (!isMigrationMissingError(error)) {
      console.error('[circle-summary] Failed to read leader session id:', error);
    }
    return null;
  }

  return data?.leader_id != null ? String(data.leader_id) : null;
}

/**
 * Read the session, then load the leader's profile from Supabase.
 *
 * Wrapped in React `cache()` so the layout, page, and any nested server
 * components in a single render all share ONE session+leader lookup instead of
 * each paying for the round trips independently.
 */
export const getSessionLeader = cache(async function getSessionLeader(): Promise<SessionLeader | null> {
  const token = getSessionCookieValue();
  if (!token) return null;
  if (isTemporarySessionExpired()) return null;

  const supabase = createServiceSupabaseClient();
  const tokenHash = hashSessionToken(token);

  const { data: session, error: sessionError } = await supabase
    .from('leader_sessions')
    .select('id, leader_id, last_seen_at')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .maybeSingle();

  if (sessionError) {
    if (!isMigrationMissingError(sessionError)) {
      console.error('[circle-summary] Failed to load leader session:', sessionError);
    }
    return null;
  }

  if (!session?.leader_id) return null;

  const { data, error: leaderError } = await supabase
    .from('circle_leaders')
    .select('id, name, email, phone, campus, acpd, status, day, time, ccb_group_id, ccb_profile_link, circle_summary_access_enabled, leader_type')
    .eq('id', session.leader_id)
    .maybeSingle();

  if (leaderError) {
    if (!isMigrationMissingError(leaderError)) {
      console.error('[circle-summary] Failed to load session leader:', leaderError);
    }
    return null;
  }

  const leader = (data as SessionLeader | null) ?? null;
  if (!isCircleSummaryAccessEnabled(leader)) return null;

  // Fire-and-forget, throttled. The response ships without waiting on this
  // write, and we skip it entirely when the timestamp is already recent.
  const lastSeenMs = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
  if (Date.now() - lastSeenMs > LAST_SEEN_THROTTLE_MS) {
    const sessionId = session.id;
    void (async () => {
      try {
        const { error } = await supabase
          .from('leader_sessions')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', sessionId);
        if (error && !isMigrationMissingError(error)) {
          console.warn('[circle-summary] last_seen_at update failed:', error.message);
        }
      } catch {
        // Non-fatal telemetry — never let it surface to the request.
      }
    })();
  }

  return leader;
});

/** Issue the session cookie on a NextResponse. */
export async function attachSessionCookie(
  res: NextResponse,
  leaderId: string | number,
  req?: Request,
  options?: { maxAgeSeconds?: number }
): Promise<NextResponse> {
  const token = createOpaqueSessionToken();
  const maxAgeSeconds = options?.maxAgeSeconds && options.maxAgeSeconds > 0
    ? Math.floor(options.maxAgeSeconds)
    : SESSION_COOKIE_MAX_AGE_SECONDS;
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from('leader_sessions').insert({
    leader_id: leaderId,
    token_hash: hashSessionToken(token),
    user_agent: req?.headers.get('user-agent') || null,
    ip: req ? getRequestIp(req) : null,
  });
  if (error) {
    console.error('[circle-summary] Failed to create leader session:', error);
    throw new Error('Could not create leader session.');
  }

  setSessionCookie(res, token, maxAgeSeconds);
  if (maxAgeSeconds < SESSION_COOKIE_MAX_AGE_SECONDS) {
    setTemporarySessionExpiresCookie(res, Date.now() + maxAgeSeconds * 1000, maxAgeSeconds);
  } else {
    clearTemporarySessionExpiresCookie(res);
  }
  return res;
}

/** Refresh the persistent cookie max-age for the current request token. */
export function refreshSessionCookie(res: NextResponse): NextResponse {
  const token = getSessionCookieValue();
  if (!token) return res;
  const temporaryExpiresMs = getTemporarySessionExpiresMs();
  if (temporaryExpiresMs !== null) {
    const remainingSeconds = Math.max(0, Math.floor((temporaryExpiresMs - Date.now()) / 1000));
    if (remainingSeconds <= 0) return clearSessionCookie(res);
    setSessionCookie(res, token, remainingSeconds);
    setTemporarySessionExpiresCookie(res, temporaryExpiresMs, remainingSeconds);
    return res;
  }
  return setSessionCookie(res, token);
}

export async function revokeCurrentSession(): Promise<void> {
  const token = getSessionCookieValue();
  if (!token) return;
  const supabase = createServiceSupabaseClient();
  await supabase
    .from('leader_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', hashSessionToken(token))
    .is('revoked_at', null);
}

export async function revokeLeaderSessions(leaderId: string | number): Promise<number> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('leader_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('leader_id', leaderId)
    .is('revoked_at', null)
    .select('id');
  if (error) {
    console.error('[circle-summary] Failed to revoke leader sessions:', error);
    throw new Error('Could not revoke leader sessions.');
  }
  return data?.length ?? 0;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  clearTemporarySessionExpiresCookie(res);
  return res;
}

export function unauthorized() {
  return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
}
