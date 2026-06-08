/**
 * POST /api/circle-leader-toolkit/notifications/test-email
 * Sends a test reminder email to the current leader's email address.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../../lib/circle-leader-toolkit/session';
import { sendReminderEmail } from '../../../../../lib/circle-leader-toolkit/email';
import { createSessionToken, RADIUS_LINK_TTL_MS } from '../../../../../lib/leader-tokens';
import { getCircleSummaryBaseUrl } from '../../../../../lib/circle-leader-toolkit/links';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  if (!leader.email) {
    return NextResponse.json({ error: 'No email address on your profile.' }, { status: 400 });
  }

  const magicToken = createSessionToken(leader.id, RADIUS_LINK_TTL_MS);
  const magicUrl = new URL('/api/circle-leader-toolkit/auth/link', getCircleSummaryBaseUrl(req));
  magicUrl.searchParams.set('t', magicToken);
  magicUrl.searchParams.set('next', '/circle-leader-toolkit/events');

  const result = await sendReminderEmail({
    to: leader.email,
    leaderName: leader.name || 'Leader',
    kind: 'summary_reminder',
    meetingDateLabel: 'your next Circle meeting',
    magicLinkUrl: magicUrl.toString(),
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || 'Failed to send email' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, sentTo: leader.email });
}
