import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';
import {
  generateOtpCode,
  hashOtpCode,
  normalizeEmail,
  normalizePhone,
  OTP_TTL_MS,
} from '../../../../../lib/leader-tokens';
import { sendOtpEmail } from '../../../../../lib/circle-leader-toolkit/email';
import { isCircleSummaryAccessEnabled } from '../../../../../lib/circle-leader-toolkit/session';

export const dynamic = 'force-dynamic';

// Rate limit: 5 codes per leader per hour, 10 per IP per hour
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  let body: { identifier?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = (body.identifier || '').trim();
  if (!raw) {
    return NextResponse.json({ error: 'Email or phone is required.' }, { status: 400 });
  }

  const isEmail = raw.includes('@');
  const supabase = createServiceSupabaseClient();

  let leaderQuery = supabase
    .from('circle_leaders')
    .select('id, name, email, phone, status, circle_summary_access_enabled')
    .order('id', { ascending: true })
    .limit(10);

  if (isEmail) {
    leaderQuery = leaderQuery.ilike('email', normalizeEmail(raw));
  } else {
    const lastTen = normalizePhone(raw);
    if (lastTen.length < 7) {
      return NextResponse.json({ error: 'Please enter a valid phone number.' }, { status: 400 });
    }
    leaderQuery = leaderQuery.like('phone', `%${lastTen}%`);
  }

  const { data: leaders, error: lookupError } = await leaderQuery;
  if (lookupError) {
    console.error('[circle-summary] Leader lookup failed:', lookupError);
    return NextResponse.json({ error: 'Lookup failed. Try again.' }, { status: 500 });
  }

  // Always respond with the same shape so we don't leak whether a leader exists.
  const genericOk = NextResponse.json({
    ok: true,
    message: "If we found a matching leader, we've sent a 6-digit code to their email.",
  });

  if (!leaders || leaders.length === 0) return genericOk;

  // If multiple leaders match (e.g. shared family phone), prefer one with an email
  const leader = leaders.find((l) => l.email && isCircleSummaryAccessEnabled(l)) ||
    leaders.find((l) => isCircleSummaryAccessEnabled(l));

  if (!leader) return genericOk;

  if (!leader.email) {
    return NextResponse.json(
      {
        ok: false,
        code: 'NO_EMAIL_ON_FILE',
        message:
          "We found you, but there's no email on file. Please contact your ACPD to add an email to your profile.",
      },
      { status: 400 }
    );
  }

  // Rate limit by leader
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from('leader_otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('leader_id', leader.id)
    .gt('created_at', since);

  if ((count || 0) >= 5) {
    return NextResponse.json(
      { error: 'Too many codes requested. Please wait a bit and try again.' },
      { status: 429 }
    );
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const requestIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null;

  const { error: insertError } = await supabase.from('leader_otp_codes').insert({
    leader_id: leader.id,
    code_hash: codeHash,
    expires_at: expiresAt,
    request_ip: requestIp,
  });
  if (insertError) {
    console.error('OTP insert failed:', insertError);
    return NextResponse.json({ error: 'Could not generate a code. Try again.' }, { status: 500 });
  }

  const emailResult = await sendOtpEmail({
    to: leader.email,
    leaderName: leader.name || 'there',
    code,
  });

  if (!emailResult.success) {
    console.error('[circle-summary] OTP email send failed:', emailResult.error);
    return NextResponse.json(
      { error: 'Could not send the code email. Try again or contact your ACPD.' },
      { status: 500 }
    );
  }

  return genericOk;
}
