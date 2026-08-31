import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';
import { hashOtpCode, normalizeEmail, OTP_MAX_ATTEMPTS } from '../../../../../lib/leader-tokens';
import {
  attachSessionCookie,
  isStudentToolkitAccessEnabled,
} from '../../../../../lib/student-toolkit/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { identifier?: string; code?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const identifier = (body.identifier || '').trim();
  const code = (body.code || '').trim();

  if (!identifier || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the 6-digit code we sent you.' }, { status: 400 });
  }
  // Email only, matching request-code — see the comment there.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
    return NextResponse.json(
      { error: 'Enter the email address on your student leader profile.' },
      { status: 400 }
    );
  }

  const supabase = createServiceSupabaseClient();

  // Deterministic ordering so request-code and verify-code pick the same leader
  const { data: leaders } = await supabase
    .from('student_leaders')
    .select('id, name, email, status, toolkit_access_enabled')
    .ilike('email', normalizeEmail(identifier))
    .order('id', { ascending: true })
    .limit(10);

  const eligibleLeaders = (leaders || []).filter((l) => isStudentToolkitAccessEnabled(l));
  if (eligibleLeaders.length === 0) {
    return NextResponse.json({ error: 'Code is invalid or expired.' }, { status: 401 });
  }

  const candidateIds = eligibleLeaders.map((l) => l.id);

  const nowIso = new Date().toISOString();
  const { data: otps } = await supabase
    .from('student_otp_codes')
    .select('id, student_leader_id, code_hash, expires_at, attempts, consumed_at')
    .in('student_leader_id', candidateIds)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false });

  if (!otps || otps.length === 0) {
    return NextResponse.json({ error: 'Code is invalid or expired.' }, { status: 401 });
  }

  const submittedHash = hashOtpCode(code);
  const match = otps.find((o) => o.code_hash === submittedHash && o.attempts < OTP_MAX_ATTEMPTS);

  if (!match) {
    // Atomic increment so concurrent guesses can't race past the attempt cap;
    // fall back to a per-row update if the migration hasn't been applied yet.
    const leaderIds = Array.from(new Set(otps.map((o) => o.student_leader_id)));
    const results = await Promise.all(
      leaderIds.map((leaderId) =>
        supabase.rpc('increment_student_otp_attempts', { p_leader_id: leaderId })
      )
    );
    if (results.some((r) => r.error)) {
      await Promise.all(
        otps.map((o) =>
          supabase
            .from('student_otp_codes')
            .update({ attempts: o.attempts + 1 })
            .eq('id', o.id)
        )
      );
    }
    return NextResponse.json({ error: 'Code is invalid or expired.' }, { status: 401 });
  }

  await supabase
    .from('student_otp_codes')
    .update({ consumed_at: nowIso })
    .eq('student_leader_id', match.student_leader_id)
    .is('consumed_at', null);

  const leader =
    eligibleLeaders.find((l) => String(l.id) === String(match.student_leader_id)) ||
    eligibleLeaders[0];

  // The leader's own id is the toolkit's URL key, so the sign-in form navigates
  // straight to /student-toolkit/<id>/home/ with what's returned here.
  return await attachSessionCookie(
    NextResponse.json({ ok: true, leaderId: leader.id, name: leader.name }),
    leader.id,
    req
  );
}
