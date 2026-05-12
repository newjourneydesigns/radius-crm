import { NextResponse } from 'next/server';
import { clearSessionCookie } from '../../../../../lib/circle-summary/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
