/**
 * GET /api/student-toolkit/roster
 *
 * The signed-in student leader's roster: name, birthday, grade, and the two
 * attendance dates. Never any contact information — these are minors, and the
 * toolkit deliberately carries no phone/email/address for them anywhere,
 * response bodies included.
 *
 * Read-only and Supabase-only. The nightly sync in attendance-sync.ts does all
 * the CCB work, so opening the roster never reaches upstream.
 */

import { NextResponse } from 'next/server';
import { getSessionStudentLeader, unauthorized } from '../../../../lib/student-toolkit/session';
import { loadStudentRoster } from '../../../../lib/student-toolkit/roster-data';
import { isStudentToolkitEnabled } from '../../../../lib/student-toolkit/feature-flag';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Middleware already 404s the whole portal while the flag is off; this is the
  // belt-and-braces guard for the main RADIUS host, where /api isn't host-gated.
  if (!isStudentToolkitEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  // Scoped to the session's own leader — the client never gets to name an id.
  const result = await loadStudentRoster(leader);

  if (result.error) {
    return NextResponse.json(
      { rows: [], term: result.term, attendanceConnected: false, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    rows: result.rows,
    term: result.term,
    attendanceConnected: result.attendanceConnected,
  });
}
