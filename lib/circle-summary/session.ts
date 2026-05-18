/**
 * Helpers for reading/writing the leader session cookie inside Next.js
 * App Router API routes.
 */

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
};

const INELIGIBLE_STATUSES = new Set(['archive', 'archived']);

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

function setSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}

/** Read the session cookie and return the verified leader_id, or null. */
export async function getSessionLeaderId(): Promise<string | null> {
  const c = getSessionCookieValue();
  if (!c) return null;

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

/** Read the session, then load the leader's profile from Supabase. */
export async function getSessionLeader(): Promise<SessionLeader | null> {
  const token = getSessionCookieValue();
  if (!token) return null;

  const supabase = createServiceSupabaseClient();
  const tokenHash = hashSessionToken(token);

  const { data: session, error: sessionError } = await supabase
    .from('leader_sessions')
    .select('id, leader_id')
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
    .select('id, name, email, phone, campus, acpd, status, day, time, ccb_group_id, ccb_profile_link, circle_summary_access_enabled')
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

  await supabase
    .from('leader_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', session.id);

  return leader;
}

/** Issue the session cookie on a NextResponse. */
export async function attachSessionCookie(
  res: NextResponse,
  leaderId: string | number,
  req?: Request
): Promise<NextResponse> {
  const token = createOpaqueSessionToken();
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

  return setSessionCookie(res, token);
}

/** Refresh the persistent cookie max-age for the current request token. */
export function refreshSessionCookie(res: NextResponse): NextResponse {
  const token = getSessionCookieValue();
  if (!token) return res;
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
  return res;
}

export function unauthorized() {
  return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
}
