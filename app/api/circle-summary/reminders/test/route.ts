/**
 * POST /api/circle-summary/reminders/test
 * Body: { leader_id, kind? }
 *
 * Admin-only. Sends a one-off test reminder email to a specific leader.
 * Does NOT write to circle_reminder_sends — purely for testing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { verifyAdminAccess } from '../../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { createSessionToken, RADIUS_LINK_TTL_MS } from '../../../../../lib/leader-tokens';
import { sendReminderEmail } from '../../../../../lib/circle-summary/email';
import { isCircleSummaryAccessEnabled } from '../../../../../lib/circle-summary/session';
import { getCircleSummaryBaseUrl } from '../../../../../lib/circle-summary/links';

export const dynamic = 'force-dynamic';

const TZ = 'America/Chicago';
export async function POST(req: NextRequest) {
  // Accept either admin session token or CRON_SECRET (dev convenience)
  const auth = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isCron) {
    const { isAdmin, error } = await verifyAdminAccess(req);
    if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
  }

  let body: { leader_id?: number | string; kind?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.leader_id) {
    return NextResponse.json({ error: 'leader_id is required.' }, { status: 400 });
  }

  const kind: 'pre_meeting' | 'follow_up' =
    body.kind === 'pre_meeting' ? 'pre_meeting' : 'follow_up';

  const supabase = createServiceSupabaseClient();
  const { data: leader, error: lookupError } = await supabase
    .from('circle_leaders')
    .select('id, name, email, ccb_group_id, status, circle_summary_access_enabled')
    .eq('id', body.leader_id)
    .single();

  if (lookupError || !leader) {
    return NextResponse.json({ error: lookupError?.message || 'Leader not found' }, { status: 404 });
  }
  if (!isCircleSummaryAccessEnabled(leader)) {
    return NextResponse.json({ error: 'Circle Summary access is disabled for this leader.' }, { status: 403 });
  }
  if (!leader.email) {
    return NextResponse.json({ error: 'Leader has no email address.' }, { status: 400 });
  }

  // Try to find a real event for the meeting date label
  let meetingDateLabel = 'your next Circle meeting';

  if (leader.ccb_group_id) {
    try {
      const now = DateTime.now().setZone(TZ);
      const calStart = now.minus({ days: 7 }).toFormat('yyyy-LL-dd');
      const calEnd = now.plus({ days: 30 }).toFormat('yyyy-LL-dd');
      const ccb = createCCBClient();
      const events = await ccb.getGroupCalendarEvents(String(leader.ccb_group_id), calStart, calEnd);

      // For follow_up: pick most recent past event; for pre_meeting: next upcoming
      const now2 = DateTime.now().setZone(TZ);
      const parsed = events
        .map((e) => ({
          ...e,
          dt: DateTime.fromFormat(e.startDateTime, 'yyyy-LL-dd HH:mm:ss', { zone: TZ }),
        }))
        .filter((e) => e.dt.isValid);

      const target =
        kind === 'follow_up'
          ? parsed.filter((e) => e.dt <= now2).sort((a, b) => b.dt.toMillis() - a.dt.toMillis())[0]
          : parsed.filter((e) => e.dt > now2).sort((a, b) => a.dt.toMillis() - b.dt.toMillis())[0];

      if (target) {
        meetingDateLabel =
          target.dt.toFormat('EEEE, LLL d') + ' at ' + target.dt.toFormat('h:mm a');
      }
    } catch {
      // CCB unavailable — use placeholder label
    }
  }

  const token = createSessionToken(leader.id, RADIUS_LINK_TTL_MS);
  const magicUrl = new URL('/api/circle-summary/auth/link', getCircleSummaryBaseUrl(req));
  magicUrl.searchParams.set('t', token);
  magicUrl.searchParams.set('next', '/circle-summary/events');

  const result = await sendReminderEmail({
    to: leader.email,
    leaderName: leader.name,
    kind,
    meetingDateLabel,
    magicLinkUrl: magicUrl.toString(),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Send failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    sentTo: leader.email,
    leaderName: leader.name,
    kind,
    meetingDateLabel,
    magicLinkUrl: magicUrl.toString(),
  });
}
