import { NextResponse } from 'next/server';
import { attachSessionCookie, getSessionLeader } from '../../../../lib/circle-summary/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return NextResponse.json({ leader: null });

  // Rolling refresh: every page load extends the session another 30 days,
  // so active leaders effectively never have to sign in again.
  return attachSessionCookie(NextResponse.json({ leader }), leader.id);
}
