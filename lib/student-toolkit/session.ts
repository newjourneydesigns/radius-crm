/**
 * Session helpers for the Student Leader Toolkit.
 *
 * Unlike the Teams Toolkit — whose leaders ARE `circle_leaders` rows and so
 * reuse the circle session module wholesale — student leaders live in their own
 * `student_leaders` table with their own `student_sessions` rows and their own
 * cookie. A student session must never satisfy the circle or teams hosts, and
 * vice versa, so nothing here is shared with them beyond the pure crypto
 * helpers in `lib/leader-tokens`.
 */

import { cache } from 'react';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  createOpaqueSessionToken,
  hashSessionToken,
  SESSION_COOKIE_MAX_AGE_SECONDS,
} from '../leader-tokens';
import { createServiceSupabaseClient } from '../server-supabase';

/** Distinct from the circle/teams cookie so the three portals never cross-auth. */
export const STUDENT_SESSION_COOKIE_NAME = 'radius_student_session';
const TEMP_SESSION_EXPIRES_COOKIE_NAME = `${STUDENT_SESSION_COOKIE_NAME}_expires`;

export type StudentSessionLeader = {
  id: number | string;
  name: string;
  email: string | null;
  campus: string | null;
  status: string | null;
  term: string | null;
  toolkit_access_enabled?: boolean | null;
  toolkit_home_screen_completed_at?: string | null;
  toolkit_home_screen_dismissed_at?: string | null;
  toolkit_notifications_completed_at?: string | null;
  toolkit_notifications_dismissed_at?: string | null;
  toolkit_roster_completed_at?: string | null;
  toolkit_roster_dismissed_at?: string | null;
  toolkit_onboarding_completed_at?: string | null;
};

const INELIGIBLE_STATUSES = new Set(['archive', 'archived']);

const LEADER_SELECT = [
  'id', 'name', 'email', 'campus', 'status', 'term', 'toolkit_access_enabled',
  'toolkit_home_screen_completed_at', 'toolkit_home_screen_dismissed_at',
  'toolkit_notifications_completed_at', 'toolkit_notifications_dismissed_at',
  'toolkit_roster_completed_at', 'toolkit_roster_dismissed_at',
  'toolkit_onboarding_completed_at',
].join(', ');

// `last_seen_at` is telemetry, not auth state — don't block the request on it.
const LAST_SEEN_THROTTLE_MS = 60_000;

function getSessionCookieValue(): string | null {
  return cookies().get(STUDENT_SESSION_COOKIE_NAME)?.value ?? null;
}

function getRequestIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded || req.headers.get('x-real-ip') || '';
  return /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : null;
}

export function isStudentLeaderEligible(
  leader: Pick<StudentSessionLeader, 'status'> | null
): boolean {
  if (!leader) return false;
  const status = (leader.status || '').trim().toLowerCase();
  return !INELIGIBLE_STATUSES.has(status);
}

/**
 * The kill switch. `toolkit_access_enabled = false` revokes toolkit access on
 * the next request without touching the leader's record otherwise.
 */
export function isStudentToolkitAccessEnabled(
  leader: Pick<StudentSessionLeader, 'status' | 'toolkit_access_enabled'> | null
): boolean {
  if (!isStudentLeaderEligible(leader)) return false;
  return leader?.toolkit_access_enabled !== false;
}

function isMigrationMissingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybe = err as { code?: string; message?: string; details?: string };
  const text = `${maybe.code || ''} ${maybe.message || ''} ${maybe.details || ''}`.toLowerCase();
  return (
    text.includes('student_sessions') ||
    text.includes('student_leaders') ||
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

function isTemporarySessionExpired(): boolean {
  const expiresMs = getTemporarySessionExpiresMs();
  return expiresMs !== null && Date.now() >= expiresMs;
}

function writeCookie(res: NextResponse, name: string, value: string, maxAge: number): NextResponse {
  res.cookies.set({
    name,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  return res;
}

function setSessionCookie(res: NextResponse, token: string, maxAgeSeconds = SESSION_COOKIE_MAX_AGE_SECONDS) {
  return writeCookie(res, STUDENT_SESSION_COOKIE_NAME, token, maxAgeSeconds);
}

/** Read the session cookie and return the verified student_leader_id, or null. */
export async function getSessionStudentLeaderId(): Promise<string | null> {
  const token = getSessionCookieValue();
  if (!token) return null;
  if (isTemporarySessionExpired()) return null;

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('student_sessions')
    .select('student_leader_id')
    .eq('token_hash', hashSessionToken(token))
    .is('revoked_at', null)
    .maybeSingle();

  if (error) {
    if (!isMigrationMissingError(error)) {
      console.error('[student-toolkit] Failed to read student session id:', error);
    }
    return null;
  }

  return data?.student_leader_id != null ? String(data.student_leader_id) : null;
}

/**
 * Read the session, then load the student leader's profile.
 *
 * Wrapped in React `cache()` so the layout, page, and any nested server
 * components in one render share a single lookup. One round trip: the profile
 * is embedded through the student_sessions → student_leaders foreign key.
 */
export const getSessionStudentLeader = cache(
  async function getSessionStudentLeader(): Promise<StudentSessionLeader | null> {
    const token = getSessionCookieValue();
    if (!token) return null;
    if (isTemporarySessionExpired()) return null;

    const supabase = createServiceSupabaseClient();

    type SessionRow = {
      id: string;
      student_leader_id: string | number | null;
      last_seen_at: string | null;
      leader?: StudentSessionLeader | StudentSessionLeader[] | null;
    };

    const { data: session, error } = await supabase
      .from('student_sessions')
      .select(`id, student_leader_id, last_seen_at, leader:student_leaders(${LEADER_SELECT})`)
      .eq('token_hash', hashSessionToken(token))
      .is('revoked_at', null)
      .maybeSingle<SessionRow>();

    if (error) {
      if (!isMigrationMissingError(error)) {
        console.error('[student-toolkit] Failed to load student session:', error);
      }
      return null;
    }

    if (!session?.student_leader_id) return null;

    // PostgREST may type the embed as an array depending on its FK inference.
    const embedded = session.leader;
    const leader = (Array.isArray(embedded) ? embedded[0] : embedded) ?? null;
    if (!isStudentToolkitAccessEnabled(leader)) return null;

    // Fire-and-forget, throttled — the response never waits on telemetry.
    const lastSeenMs = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
    if (Date.now() - lastSeenMs > LAST_SEEN_THROTTLE_MS) {
      const sessionId = session.id;
      void (async () => {
        try {
          await supabase
            .from('student_sessions')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', sessionId);
        } catch {
          // Non-fatal telemetry — never surface it to the request.
        }
      })();
    }

    return leader;
  }
);

/** Issue the session cookie on a NextResponse. */
export async function attachSessionCookie(
  res: NextResponse,
  studentLeaderId: string | number,
  req?: Request,
  options?: { maxAgeSeconds?: number }
): Promise<NextResponse> {
  const token = createOpaqueSessionToken();
  const maxAgeSeconds = options?.maxAgeSeconds && options.maxAgeSeconds > 0
    ? Math.floor(options.maxAgeSeconds)
    : SESSION_COOKIE_MAX_AGE_SECONDS;

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from('student_sessions').insert({
    student_leader_id: studentLeaderId,
    token_hash: hashSessionToken(token),
    user_agent: req?.headers.get('user-agent') || null,
    ip: req ? getRequestIp(req) : null,
  });
  if (error) {
    console.error('[student-toolkit] Failed to create student session:', error);
    throw new Error('Could not create student session.');
  }

  setSessionCookie(res, token, maxAgeSeconds);
  if (maxAgeSeconds < SESSION_COOKIE_MAX_AGE_SECONDS) {
    // A share link's session must expire even if the browser keeps the cookie.
    writeCookie(res, TEMP_SESSION_EXPIRES_COOKIE_NAME, String(Date.now() + maxAgeSeconds * 1000), maxAgeSeconds);
  } else {
    writeCookie(res, TEMP_SESSION_EXPIRES_COOKIE_NAME, '', 0);
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
    writeCookie(res, TEMP_SESSION_EXPIRES_COOKIE_NAME, String(temporaryExpiresMs), remainingSeconds);
    return res;
  }
  return setSessionCookie(res, token);
}

export async function revokeCurrentSession(): Promise<void> {
  const token = getSessionCookieValue();
  if (!token) return;
  const supabase = createServiceSupabaseClient();
  await supabase
    .from('student_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', hashSessionToken(token))
    .is('revoked_at', null);
}

export async function revokeStudentLeaderSessions(studentLeaderId: string | number): Promise<number> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('student_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('student_leader_id', studentLeaderId)
    .is('revoked_at', null)
    .select('id');
  if (error) {
    console.error('[student-toolkit] Failed to revoke student sessions:', error);
    throw new Error('Could not revoke student sessions.');
  }
  return data?.length ?? 0;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  writeCookie(res, STUDENT_SESSION_COOKIE_NAME, '', 0);
  writeCookie(res, TEMP_SESSION_EXPIRES_COOKIE_NAME, '', 0);
  return res;
}

export function unauthorized() {
  return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
}
