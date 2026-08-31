/**
 * POST /api/student-toolkit/roster/search
 * Body: { query: string }
 *
 * Candidates the leader can add to their roster, scoped to their own campus and
 * term and served from the synced student directory.
 *
 * Deliberately NOT CCB's global individual search — which is what the adult
 * roster uses. A volunteer student leader has no business searching the whole
 * church directory, and doesn't need to: their students are already in the
 * campus's mapped groups. Results carry no contact information.
 */

import { NextResponse } from 'next/server';
import { getSessionStudentLeader, unauthorized } from '../../../../../lib/student-toolkit/session';
import { searchStudentDirectory } from '../../../../../lib/student-toolkit/roster-data';
import { resolveActiveTerm, type TermSlug } from '../../../../../lib/student-toolkit/terms';
import { isStudentToolkitEnabled } from '../../../../../lib/student-toolkit/feature-flag';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

const RESULT_LIMIT = 12;

export async function POST(req: Request) {
  if (!isStudentToolkitEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  let body: { query?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const query = (body.query || '').trim();
  if (query.length < 2) return NextResponse.json({ results: [] });

  if (!leader.campus) {
    return NextResponse.json({
      results: [],
      message: 'Your campus isn’t set yet, so there’s no student list to search. Ask your director.',
    });
  }

  const term = (leader.term as TermSlug | null) ?? (await resolveActiveTerm());

  // Students already on this leader's roster are filtered out server-side, so
  // the picker can't offer a duplicate the add route would just reject.
  const supabase = createServiceSupabaseClient();
  const { data: existing } = await supabase
    .from('student_roster_members')
    .select('ccb_individual_id')
    .eq('student_leader_id', leader.id)
    .eq('term', term)
    .is('removed_at', null);

  const results = await searchStudentDirectory(leader.campus, term, query, {
    limit: RESULT_LIMIT,
    excludeIds: (existing ?? []).map((row) => String(row.ccb_individual_id)),
  });

  return NextResponse.json({ results, term, campus: leader.campus });
}
