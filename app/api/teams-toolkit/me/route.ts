import { NextResponse } from 'next/server';
import { getSessionLeader, refreshSessionCookie } from '../../../../lib/teams-toolkit/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return NextResponse.json({ leader: null });

  // Rolling refresh: every page load refreshes the browser cookie cap.
  return refreshSessionCookie(NextResponse.json({ leader }));
}
