import { NextResponse } from 'next/server';
import { clearSessionCookie, revokeCurrentSession } from '../../../../../lib/circle-leader-toolkit/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  await revokeCurrentSession();
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
