/**
 * GET /api/student-toolkit/alerts
 * Unread counts for the Inbox tab dot and the installed app's badge.
 *
 * Student leaders submit no event summaries, so unlike the Circle Leader
 * Toolkit there is nothing else to tally here — this stays a single cheap
 * lookup that is safe to poll on every app foreground.
 */

import { NextResponse } from 'next/server';
import { getSessionStudentLeader, unauthorized } from '../../../../lib/student-toolkit/session';
import { getStudentAlertCounts } from '../../../../lib/student-toolkit/push';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  try {
    const counts = await getStudentAlertCounts(leader.id);
    return NextResponse.json(counts);
  } catch (error: any) {
    console.warn('[student-toolkit/alerts] count lookup failed:', error?.message || error);
    // A badge is not worth a failed request — report zero and let the next poll
    // correct it.
    return NextResponse.json({ unreadMessages: 0, totalAlertCount: 0 });
  }
}
