import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';
import {
  hashOtpCode,
  normalizeEmail,
  normalizePhone,
  OTP_MAX_ATTEMPTS,
} from '../../../../../lib/leader-tokens';
import { attachSessionCookie, isCircleSummaryAccessEnabled } from '../../../../../lib/circle-summary/session';

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

  const isEmail = identifier.includes('@');
  const supabase = createServiceSupabaseClient();

  // Deterministic ordering so request-code and verify-code pick the same leader
  let leaderQuery = supabase
    .from('circle_leaders')
    .select('id, name, email, phone, status, circle_summary_access_enabled, ccb_group_id')
    .order('id', { ascending: true })
    .limit(10);
  if (isEmail) {
    leaderQuery = leaderQuery.ilike('email', normalizeEmail(identifier));
  } else {
    leaderQuery = leaderQuery.like('phone', `%${normalizePhone(identifier)}%`);
  }
  const { data: leaders } = await leaderQuery;
  const eligibleLeaders = (leaders || []).filter((l) => isCircleSummaryAccessEnabled(l));
  if (eligibleLeaders.length === 0) {
    return NextResponse.json({ error: 'Code is invalid or expired.' }, { status: 401 });
  }

  // Candidate leaders: anyone whose identifier matches. We accept the code if
  // it matches an outstanding OTP for ANY of them. This handles two real cases:
  //   1. Multiple leaders share a phone number (family)
  //   2. The user requested multiple codes (older code still unconsumed)
  const candidateIds = eligibleLeaders.map((l) => l.id);

  const nowIso = new Date().toISOString();
  const { data: otps } = await supabase
    .from('leader_otp_codes')
    .select('id, leader_id, code_hash, expires_at, attempts, consumed_at')
    .in('leader_id', candidateIds)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false });

  if (!otps || otps.length === 0) {
    return NextResponse.json({ error: 'Code is invalid or expired.' }, { status: 401 });
  }

  const submittedHash = hashOtpCode(code);
  const match = otps.find((o) => o.code_hash === submittedHash && o.attempts < OTP_MAX_ATTEMPTS);

  if (!match) {
    // No match — bump the attempt counter on every outstanding row for these
    // leaders so we still enforce the per-code attempt limit.
    await Promise.all(
      otps.map((o) =>
        supabase
          .from('leader_otp_codes')
          .update({ attempts: o.attempts + 1 })
          .eq('id', o.id)
      )
    );
    return NextResponse.json({ error: 'Code is invalid or expired.' }, { status: 401 });
  }

  // Mark the matched code consumed (and any other still-outstanding codes for
  // the same leader — only one code should ever survive a successful login).
  await supabase
    .from('leader_otp_codes')
    .update({ consumed_at: nowIso })
    .eq('leader_id', match.leader_id)
    .is('consumed_at', null);

  const leader = eligibleLeaders.find((l) => l.id === match.leader_id) || eligibleLeaders[0];
  // Return the group id so the sign-in form can navigate straight to the
  // group-scoped events URL, skipping the legacy /circle-summary/events
  // client redirector (an extra round trip + an extra loader flash).
  return await attachSessionCookie(
    NextResponse.json({
      ok: true,
      leaderId: leader.id,
      name: leader.name,
      ccbGroupId: leader.ccb_group_id ?? null,
    }),
    leader.id,
    req
  );
}
