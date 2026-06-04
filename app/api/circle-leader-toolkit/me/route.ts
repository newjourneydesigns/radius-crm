import { NextResponse } from 'next/server';
import { getSessionLeader, refreshSessionCookie } from '../../../../lib/circle-leader-toolkit/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return NextResponse.json({ leader: null });

  // Rolling refresh: every page load refreshes the browser cookie cap, while
  // the server-side session remains valid until sign-out or revocation.
  return refreshSessionCookie(NextResponse.json({ leader }));
}
