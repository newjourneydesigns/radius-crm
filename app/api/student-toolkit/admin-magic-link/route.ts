/**
 * POST /api/student-toolkit/admin-magic-link
 * Body: { leader_id, selfHosted? }
 *
 * Admin-only. Returns a magic-link URL an admin can share with a student
 * leader, or auto-login into the Student Toolkit as them (selfHosted).
 * RADIUS-issued links are long-lived; access is revoked through the Student
 * Toolkit access toggle (`toolkit_access_enabled`) or archived leader status.
 *
 * Mirrors app/api/circle-leader-toolkit/admin-magic-link/route.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { createSessionToken, RADIUS_LINK_TTL_MS } from '../../../../lib/leader-tokens';
import { isStudentToolkitAccessEnabled } from '../../../../lib/student-toolkit/session';
import {
  getStudentToolkitBaseUrl,
  getAdminStudentToolkitBaseUrl,
} from '../../../../lib/student-toolkit/links';
import { studentToolkitLeaderPath } from '../../../../lib/student-toolkit/paths';
import { ageFromBirthdate, isMinor } from '../../../../lib/messaging/minorGuard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { isAdmin, error } = await verifyAdminAccess(req);
    if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });

    let body: { leader_id?: number | string; selfHosted?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (!body.leader_id) {
      return NextResponse.json({ error: 'leader_id is required.' }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const { data: leader, error: lookupError } = await supabase
      .from('student_leaders')
      .select('id, name, phone, email, birthday, status, toolkit_access_enabled')
      .eq('id', body.leader_id)
      .single();
    if (lookupError || !leader) {
      return NextResponse.json(
        { error: lookupError?.message || 'Student leader not found' },
        { status: 404 }
      );
    }
    if (!isStudentToolkitAccessEnabled(leader)) {
      return NextResponse.json(
        { error: 'Student Toolkit access is disabled for this leader.' },
        { status: 403 }
      );
    }

    const token = createSessionToken(leader.id, RADIUS_LINK_TTL_MS);
    const targetPath = studentToolkitLeaderPath(leader.id, 'home/');
    // `selfHosted` links (the admin "Open Student Toolkit" auto-login button)
    // stay on the current RADIUS origin so the token is verified by the same
    // deployment that signed it — no cross-site LEADER_SESSION_SECRET sync
    // required. Leader-facing links keep the clean dedicated toolkit domain.
    const baseUrl = body.selfHosted
      ? getAdminStudentToolkitBaseUrl(req)
      : getStudentToolkitBaseUrl(req);
    const url = new URL('/api/student-toolkit/auth/link', baseUrl);
    url.searchParams.set('t', token);
    url.searchParams.set('next', targetPath);

    const leaderFirstName = leader.name?.split(' ')[0] || 'there';
    const messageBody = `Hi ${leaderFirstName}, the Student Toolkit is where you'll find your students, your schedule, and everything you need to lead.\n\nHere's your personal link: ${url.toString()}`;

    // Student leaders are frequently minors themselves. Texting is age-gated
    // everywhere else in RADIUS (lib/messaging/minorGuard), so flag it here too
    // rather than handing an admin a ready-to-send SMS with no warning.
    const age = ageFromBirthdate(leader.birthday);

    return NextResponse.json({
      ok: true,
      url: url.toString(),
      targetPath,
      phone: leader.phone || null,
      email: leader.email || null,
      smsBody: messageBody,
      isMinor: isMinor(age),
      permanent: true,
    });
  } catch (err: unknown) {
    console.error('[student-toolkit/admin-magic-link] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
