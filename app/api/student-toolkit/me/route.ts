import { NextResponse } from 'next/server';
import { getSessionStudentLeader, refreshSessionCookie } from '../../../../lib/student-toolkit/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionStudentLeader();
  if (!leader) return NextResponse.json({ leader: null });

  // Rolling refresh: every page load refreshes the browser cookie cap.
  return refreshSessionCookie(NextResponse.json({ leader }));
}
