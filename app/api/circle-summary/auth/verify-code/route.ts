import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';
import {
  hashOtpCode,
  normalizeEmail,
  normalizePhone,
  OTP_MAX_ATTEMPTS,
} from '../../../../../lib/leader-tokens';
import { attachSessionCookie } from '../../../../../lib/circle-summary/session';

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

  let leaderQuery = supabase.from('circle_leaders').select('id, name, email, phone').limit(5);
  if (isEmail) {
    leaderQuery = leaderQuery.ilike('email', normalizeEmail(identifier));
  } else {
    leaderQuery = leaderQuery.like('phone', `%${normalizePhone(identifier)}%`);
  }
  const { data: leaders } = await leaderQuery;
  if (!leaders || leaders.length === 0) {
    return NextResponse.json({ error: 'Code is invalid or expired.' }, { status: 401 });
  }
  const leader = leaders.find((l) => l.email) || leaders[0];

  // Find the most recent unconsumed code for this leader
  const { data: otpRow } = await supabase
    .from('leader_otp_codes')
    .select('id, code_hash, expires_at, attempts, consumed_at')
    .eq('leader_id', leader.id)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otpRow) {
    return NextResponse.json({ error: 'Code is invalid or expired.' }, { status: 401 });
  }

  if (new Date(otpRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Code has expired. Request a new one.' }, { status: 401 });
  }

  if (otpRow.attempts >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: 'Too many attempts. Request a new code.' },
      { status: 429 }
    );
  }

  const submittedHash = hashOtpCode(code);
  const matches = submittedHash === otpRow.code_hash;

  if (!matches) {
    await supabase
      .from('leader_otp_codes')
      .update({ attempts: otpRow.attempts + 1 })
      .eq('id', otpRow.id);
    return NextResponse.json({ error: 'Code is invalid or expired.' }, { status: 401 });
  }

  await supabase
    .from('leader_otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', otpRow.id);

  return attachSessionCookie(
    NextResponse.json({ ok: true, leaderId: leader.id, name: leader.name }),
    leader.id
  );
}
