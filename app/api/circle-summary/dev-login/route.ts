/**
 * Dev-only auth bypass. Issues a leader session cookie for a given leader_id
 * without going through the OTP flow.
 *
 * Refuses to run in production. Always remove or gate behind a stronger guard
 * before deploying.
 */

import { NextResponse } from 'next/server';
import { attachSessionCookie } from '../../../../lib/circle-summary/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Disabled in production.' }, { status: 403 });
  }

  const url = new URL(req.url);
  const leaderIdRaw = url.searchParams.get('leader_id');
  const redirectTo = url.searchParams.get('redirect') || '/circle-summary/events';

  if (!leaderIdRaw) {
    return NextResponse.json(
      { error: 'Pass ?leader_id=NNN (and optional &redirect=/path).' },
      { status: 400 }
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data: leader, error } = await supabase
    .from('circle_leaders')
    .select('id, name, email')
    .eq('id', leaderIdRaw)
    .single();

  if (error || !leader) {
    return NextResponse.json({ error: error?.message || 'Leader not found.' }, { status: 404 });
  }

  console.log('[circle-summary] DEV bypass login as leader', leader.id, leader.name);

  return attachSessionCookie(
    NextResponse.redirect(new URL(redirectTo, req.url)),
    leader.id
  );
}
