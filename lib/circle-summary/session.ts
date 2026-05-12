/**
 * Helpers for reading/writing the leader session cookie inside Next.js
 * App Router API routes.
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createSessionToken,
  verifySessionToken,
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
};

/** Read the session cookie and return the verified leader_id, or null. */
export function getSessionLeaderId(): string | null {
  const c = cookies().get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(c)?.leaderId ?? null;
}

/** Read the session, then load the leader's profile from Supabase. */
export async function getSessionLeader(): Promise<SessionLeader | null> {
  const leaderId = getSessionLeaderId();
  if (!leaderId) return null;
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from('circle_leaders')
    .select('id, name, email, phone, campus, acpd, status, day, time, ccb_group_id, ccb_profile_link')
    .eq('id', leaderId)
    .single();
  return (data as SessionLeader) ?? null;
}

/** Issue the session cookie on a NextResponse. */
export function attachSessionCookie(res: NextResponse, leaderId: string): NextResponse {
  const token = createSessionToken(leaderId);
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
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
