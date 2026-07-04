import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';
import {
  hashOtpCode,
  normalizeEmail,
  normalizePhone,
  OTP_MAX_ATTEMPTS,
} from '../../../../../lib/leader-tokens';
import { attachSessionCookie, isTeamsToolkitAccessEnabled } from '../../../../../lib/teams-toolkit/session';

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
  const lastTen = isEmail ? null : normalizePhone(identifier);
  let leaderQuery = supabase
    .from('circle_leaders')
    .select('id, name, email, phone, status, leader_type, circle_summary_access_enabled, ccb_category_id')
    .eq('leader_type', 'host_team')
    .order('id', { ascending: true })
    .limit(10);
  if (isEmail) {
    leaderQuery = leaderQuery.ilike('email', normalizeEmail(identifier));
  } else {
    leaderQuery = leaderQuery.like('phone', `%${lastTen}%`);
  }
  const { data: leaders } = await leaderQuery;
  // Require an exact last-10 match for phone lookups (the LIKE is coarse).
  const eligibleLeaders = (leaders || []).filter(
    (l) =>
      isTeamsToolkitAccessEnabled(l) &&
      (!lastTen || normalizePhone(l.phone || '') === lastTen)
  );
  if (eligibleLeaders.length === 0) {
    return NextResponse.json({ error: 'Code is invalid or expired.' }, { status: 401 });
  }

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
    // Atomic increment so concurrent guesses can't race past the attempt cap;
    // fall back to a per-row update if the migration hasn't been applied yet.
    const { error: incErr } = await supabase.rpc('increment_otp_attempts', {
      p_ids: otps.map((o) => o.id),
    });
    if (incErr) {
      await Promise.all(
        otps.map((o) =>
          supabase
            .from('leader_otp_codes')
            .update({ attempts: o.attempts + 1 })
            .eq('id', o.id)
        )
      );
    }
    return NextResponse.json({ error: 'Code is invalid or expired.' }, { status: 401 });
  }

  await supabase
    .from('leader_otp_codes')
    .update({ consumed_at: nowIso })
    .eq('leader_id', match.leader_id)
    .is('consumed_at', null);

  const leader = eligibleLeaders.find((l) => l.id === match.leader_id) || eligibleLeaders[0];
  // Return the category id so the sign-in form can navigate straight to the
  // category-scoped roster URL.
  return await attachSessionCookie(
    NextResponse.json({
      ok: true,
      leaderId: leader.id,
      name: leader.name,
      categoryId: leader.ccb_category_id ?? null,
    }),
    leader.id,
    req
  );
}
