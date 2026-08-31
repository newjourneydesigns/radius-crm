/**
 * Nightly CCB pull for the Student Leader Toolkit.
 *
 * Cron-gated (Bearer CRON_SECRET), same as the other sync routes. Also callable
 * by a RADIUS admin so staff can run it on demand right after wiring up a
 * campus's CCB group IDs, instead of waiting for the next night.
 *
 * The work itself lives in lib/student-toolkit/attendance-sync.ts.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { syncStudentMinistryGroups } from '../../../../lib/student-toolkit/attendance-sync';
import { getCCBRequestContext, CCBDailyBudgetError } from '../../../../lib/ccb/ccb-api-gateway';
import { isStudentToolkitEnabled } from '../../../../lib/student-toolkit/feature-flag';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { isValidTerm } from '../../../../lib/student-toolkit/terms';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  // Middleware already 404s this route while the flag is off; this is the
  // belt-and-braces guard for the main RADIUS host, where the API prefix isn't
  // host-gated.
  if (!isStudentToolkitEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let authorized = isCronRequest(req);
  if (!authorized) {
    const admin = await verifyAdminAccess(req as NextRequest);
    authorized = admin.isAdmin;
  }
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let term: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.term === 'string' && isValidTerm(body.term)) term = body.term;
  } catch {
    // No body is the normal cron case — sync the active term.
  }

  try {
    const result = await syncStudentMinistryGroups({
      term,
      ccbContext: await getCCBRequestContext(req, {
        module: 'Student Toolkit',
        action: 'Sync Student Attendance',
        direction: 'pull',
      }),
    });

    // No mapped groups is the expected day-one state, not a failure — student
    // ministry is still tracking the CCB group IDs down. Say so plainly so a
    // green cron run isn't mistaken for a working pipeline.
    if (result.notConfigured) {
      return NextResponse.json({
        ...result,
        message:
          'No CCB groups are mapped for this term yet. Add them in Admin → Student Groups; ' +
          'until then the roster reports attendance as not connected.',
      });
    }

    const failed = result.groups.filter((g) => g.error);
    return NextResponse.json({
      ...result,
      message:
        `Synced ${result.groupsSynced}/${result.groupsConfigured} group(s): ` +
        `${result.studentsUpserted} student(s), ${result.attendanceRowsUpserted} attendance row(s).` +
        (failed.length ? ` ${failed.length} group(s) failed — see groups[].error.` : ''),
    });
  } catch (err) {
    if (err instanceof CCBDailyBudgetError) {
      return NextResponse.json(
        { error: err.message, count: err.count, limit: err.limit },
        { status: 429 }
      );
    }
    const message = err instanceof Error ? err.message : 'Sync failed';
    console.error('[student-toolkit] Sync route failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Current pipeline state, for the admin screen's status panel. */
export async function GET(req: Request) {
  if (!isStudentToolkitEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const admin = await verifyAdminAccess(req as NextRequest);
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { createServiceSupabaseClient } = await import('../../../../lib/server-supabase');
  const { resolveActiveTerm } = await import('../../../../lib/student-toolkit/terms');
  const supabase = createServiceSupabaseClient();
  const term = await resolveActiveTerm();

  const { data, error } = await supabase
    .from('student_ministry_groups')
    .select('id, campus, term, kind, ccb_group_id, label, active, last_synced_at, last_sync_error')
    .eq('term', term)
    .order('campus')
    .order('kind');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ term, groups: data ?? [] });
}
