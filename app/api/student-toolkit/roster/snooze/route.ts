/**
 * POST /api/student-toolkit/roster/snooze
 * Body: { ccbIndividualId: string } | { all: true }
 *
 * Quiets an absent-student alert for seven days.
 *
 * Server-side, unlike the Circle Leader Toolkit's localStorage version: student
 * leaders switch phones and share devices, and a snooze that evaporates is
 * worse than none. Alongside the expiry we store the absence the snooze was set
 * against (snoozed_on_last_attended), which is what lets a snooze answer for
 * *this* run of absences rather than the student forever.
 */

import { NextResponse } from 'next/server';
import { getSessionStudentLeader, unauthorized } from '../../../../../lib/student-toolkit/session';
import {
  loadStudentRoster,
  isAbsentAlert,
  SNOOZE_DURATION_DAYS,
} from '../../../../../lib/student-toolkit/roster-data';
import { isStudentToolkitEnabled } from '../../../../../lib/student-toolkit/feature-flag';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isStudentToolkitEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  let body: { ccbIndividualId?: string | number; all?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const snoozeAll = body.all === true;
  const ccbIndividualId = body.ccbIndividualId != null ? String(body.ccbIndividualId).trim() : '';
  if (!snoozeAll && !ccbIndividualId) {
    return NextResponse.json({ error: 'ccbIndividualId or all is required.' }, { status: 400 });
  }

  // The roster read is also the authorization check: a student who isn't on
  // this leader's roster simply isn't in `rows`, whatever the body claims.
  const { rows, term, error } = await loadStudentRoster(leader);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const targets = snoozeAll
    ? rows.filter((row) => isAbsentAlert(row))
    : rows.filter((row) => row.ccb_individual_id === ccbIndividualId);

  if (targets.length === 0) {
    return NextResponse.json(
      { ok: false, error: snoozeAll ? 'Nothing to snooze.' : 'That student isn’t on your roster.' },
      { status: snoozeAll ? 200 : 404 }
    );
  }

  const snoozedUntil = new Date(
    Date.now() + SNOOZE_DURATION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // snoozed_on_last_attended differs per student, so group the writes by that
  // date — a roster is a few dozen students, which is a handful of updates.
  const idsByLastAttended: Record<string, string[]> = {};
  for (const row of targets) {
    const key = row.lastAttendedCircle ?? '';
    (idsByLastAttended[key] ||= []).push(row.ccb_individual_id);
  }

  const supabase = createServiceSupabaseClient();
  for (const [key, ids] of Object.entries(idsByLastAttended)) {
    const lastAttended = key || null;
    const { error: updateError } = await supabase
      .from('student_roster_members')
      .update({ snoozed_until: snoozedUntil, snoozed_on_last_attended: lastAttended })
      .eq('student_leader_id', leader.id)
      .eq('term', term)
      .in('ccb_individual_id', ids)
      .is('removed_at', null);

    if (updateError) {
      console.error('[student-toolkit] Roster snooze failed:', updateError);
      return NextResponse.json({ error: 'Could not snooze right now.' }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    snoozedUntil,
    snoozedIds: targets.map((row) => row.ccb_individual_id),
    days: SNOOZE_DURATION_DAYS,
  });
}
