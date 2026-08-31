import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';
import {
  generateOtpCode,
  hashOtpCode,
  normalizeEmail,
  OTP_TTL_MS,
} from '../../../../../lib/leader-tokens';
import { sendOtpEmail } from '../../../../../lib/student-toolkit/email';
import { isStudentToolkitAccessEnabled } from '../../../../../lib/student-toolkit/session';

export const dynamic = 'force-dynamic';

// Rate limit: 5 codes per leader per hour, 10 per IP per hour
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_LEADER = 5;
const RATE_LIMIT_MAX_PER_IP = 10;

function getRequestIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded || req.headers.get('x-real-ip') || '';
  return /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : null;
}

export async function POST(req: Request) {
  let body: { identifier?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = (body.identifier || '').trim();
  if (!raw) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  // Email only — deliberately no phone branch. The circle and teams toolkits
  // match a phone with a coarse `LIKE %last-ten%` and fall back to whichever
  // leader sorts first when several share the number. Student leaders are
  // routinely minors on a family phone, so that tie-break would hand a sibling's
  // account to whoever asked first. An email is the one identifier that is
  // theirs alone.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return NextResponse.json(
      { error: 'Enter the email address on your student leader profile.' },
      { status: 400 }
    );
  }

  const supabase = createServiceSupabaseClient();

  // Per-IP limit — enforced before the leader lookup so identifier probing is
  // throttled even when no leader matches.
  const requestIp = getRequestIp(req);
  const rateWindowSince = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  if (requestIp) {
    const { count: ipCount } = await supabase
      .from('student_otp_codes')
      .select('id', { count: 'exact', head: true })
      .eq('request_ip', requestIp)
      .gt('created_at', rateWindowSince);
    if ((ipCount || 0) >= RATE_LIMIT_MAX_PER_IP) {
      return NextResponse.json(
        { error: 'Too many codes requested. Please wait a bit and try again.' },
        { status: 429 }
      );
    }
  }

  // Ordered by id so request-code and verify-code resolve the same leader when
  // a household shares one email address.
  const { data: leaders, error: lookupError } = await supabase
    .from('student_leaders')
    .select('id, name, email, status, toolkit_access_enabled')
    .ilike('email', normalizeEmail(raw))
    .order('id', { ascending: true })
    .limit(10);

  if (lookupError) {
    console.error('[student-toolkit] Leader lookup failed:', lookupError);
    return NextResponse.json({ error: 'Lookup failed. Try again.' }, { status: 500 });
  }

  // Always respond with the same shape so we don't leak whether a leader exists.
  const genericOk = NextResponse.json({
    ok: true,
    message: "If we found a matching student leader, we've sent a 6-digit code to their email.",
  });

  const leader = (leaders || []).find((l) => l.email && isStudentToolkitAccessEnabled(l));
  if (!leader) return genericOk;

  const { count } = await supabase
    .from('student_otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('student_leader_id', leader.id)
    .gt('created_at', rateWindowSince);

  if ((count || 0) >= RATE_LIMIT_MAX_PER_LEADER) {
    return NextResponse.json(
      { error: 'Too many codes requested. Please wait a bit and try again.' },
      { status: 429 }
    );
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { error: insertError } = await supabase.from('student_otp_codes').insert({
    student_leader_id: leader.id,
    code_hash: codeHash,
    expires_at: expiresAt,
    request_ip: requestIp,
  });
  if (insertError) {
    console.error('[student-toolkit] OTP insert failed:', insertError);
    return NextResponse.json({ error: 'Could not generate a code. Try again.' }, { status: 500 });
  }

  const emailResult = await sendOtpEmail({
    to: leader.email as string,
    leaderName: leader.name || 'there',
    code,
  });

  if (!emailResult.success) {
    console.error('[student-toolkit] OTP email send failed:', emailResult.error);
    return NextResponse.json(
      { error: 'Could not send the code email. Try again or contact your student pastor.' },
      { status: 500 }
    );
  }

  return genericOk;
}
