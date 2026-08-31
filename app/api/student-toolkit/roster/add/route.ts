/**
 * POST /api/student-toolkit/roster/add
 * Body: { ccbIndividualId: string }
 *
 * Adds a student to the leader's own roster. **Pull-only**: this writes one row
 * to student_roster_members and nothing else. Unlike the adult roster's add
 * route, it never calls CCB — a student leader's list is private to the toolkit
 * and CCB group membership stays read-only, owned by student ministry.
 *
 * The student must already be in the synced directory for this leader's campus
 * and term, so a leader can only ever add someone from their own campus.
 */

import { NextResponse } from 'next/server';
import { getSessionStudentLeader, unauthorized } from '../../../../../lib/student-toolkit/session';
import { resolveActiveTerm, type TermSlug } from '../../../../../lib/student-toolkit/terms';
import { isStudentToolkitEnabled } from '../../../../../lib/student-toolkit/feature-flag';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';
import type { StudentAttendanceKind, StudentRosterRow } from '../../../../../lib/supabase';

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

  // Vet the student against the directory before writing. The campus check is
  // the wall: the body can name any id, but only this campus's students exist
  // for this leader.
  const { data: student, error: directoryError } = await supabase
    .from('student_directory_cache')
    .select('ccb_individual_id, first_name, last_name, full_name, birthday, grade, campus, is_active')
    .eq('term', term)
    .eq('ccb_individual_id', ccbIndividualId)
    .maybeSingle();

  if (directoryError) {
    console.error('[student-toolkit] Roster add directory lookup failed:', directoryError);
    return NextResponse.json({ error: 'Could not add that student right now.' }, { status: 500 });
  }

  if (!student || (leader.campus && student.campus !== leader.campus)) {
    return NextResponse.json(
      { error: 'That student isn’t in your campus’s list for this term.' },
      { status: 404 }
    );
  }

  // Upsert rather than insert so re-adding someone the leader removed earlier
  // reuses their row — and clears the stale snooze that came with it.
  const { error: upsertError } = await supabase.from('student_roster_members').upsert(
    {
      student_leader_id: leader.id,
      ccb_individual_id: ccbIndividualId,
      term,
      added_at: new Date().toISOString(),
      removed_at: null,
      snoozed_until: null,
      snoozed_on_last_attended: null,
    },
    { onConflict: 'student_leader_id,ccb_individual_id,term' }
  );

  if (upsertError) {
    console.error('[student-toolkit] Roster add failed:', upsertError);
    return NextResponse.json({ error: 'Could not add that student right now.' }, { status: 500 });
  }

  // Resolve their two dates now so the row lands complete instead of showing
  // "no attendance" until the next background refresh.
  const { data: attendance } = await supabase
    .from('student_attendance')
    .select('kind, occurrence')
    .eq('ccb_individual_id', ccbIndividualId)
    .order('occurrence', { ascending: false });

  const latest: Partial<Record<StudentAttendanceKind, string>> = {};
  for (const record of attendance ?? []) {
    const kind = record.kind as StudentAttendanceKind;
    if (!latest[kind]) latest[kind] = record.occurrence as string;
  }

  const row: StudentRosterRow = {
    ccb_individual_id: ccbIndividualId,
    first_name: student.first_name ?? null,
    last_name: student.last_name ?? null,
    full_name: student.full_name ?? null,
    birthday: student.birthday ?? null,
    grade: student.grade ?? null,
    lastAttendedCircle: latest.circle ?? null,
    lastAttendedMovement: latest.movement ?? null,
    // A freshly added student carries no snooze — add/ clears any stale one.
    snoozed_until: null,
    snoozed_on_last_attended: null,
    is_active: student.is_active ?? true,
  };

  return NextResponse.json({ ok: true, row, term });
}
