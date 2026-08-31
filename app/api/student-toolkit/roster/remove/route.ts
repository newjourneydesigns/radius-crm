/**
 * POST /api/student-toolkit/roster/remove
 * Body: { ccbIndividualId: string }
 *
 * Takes a student off the leader's roster. **Pull-only and reversible**: this
 * stamps removed_at on the leader's own student_roster_members row and stops
 * there. The adult roster's remove route drops the person from the CCB group —
 * this one must never do that. Student ministry owns CCB membership; a leader
 * tidying their list can't be allowed to change the church's record.
 */

import { NextResponse } from 'next/server';
import { getSessionStudentLeader, unauthorized } from '../../../../../lib/student-toolkit/session';
import { resolveActiveTerm, type TermSlug } from '../../../../../lib/student-toolkit/terms';
import { isStudentToolkitEnabled } from '../../../../../lib/student-toolkit/feature-flag';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isStudentToolkitEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  let body: { ccbIndividualId?: string | number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ccbIndividualId = body.ccbIndividualId != null ? String(body.ccbIndividualId).trim() : '';
  if (!ccbIndividualId) {
    return NextResponse.json({ error: 'ccbIndividualId is required.' }, { status: 400 });
  }

  const term = (leader.term as TermSlug | null) ?? (await resolveActiveTerm());
  const supabase = createServiceSupabaseClient();

  // Every filter is the session leader's own — an id in the body can only ever
  // match a row this leader already owns.
  const { data, error } = await supabase
    .from('student_roster_members')
    .update({
      removed_at: new Date().toISOString(),
      // A snooze belongs to a roster run; don't carry it into a later re-add.
      snoozed_until: null,
      snoozed_on_last_attended: null,
    })
    .eq('student_leader_id', leader.id)
    .eq('ccb_individual_id', ccbIndividualId)
    .eq('term', term)
    .is('removed_at', null)
    .select('id');

  if (error) {
    console.error('[student-toolkit] Roster remove failed:', error);
    return NextResponse.json({ error: 'Could not remove that student right now.' }, { status: 500 });
  }

  // Already gone is success, not an error — a double tap shouldn't read as a
  // failure on a phone with a flaky connection.
  return NextResponse.json({ ok: true, removed: data?.length ?? 0 });
}
