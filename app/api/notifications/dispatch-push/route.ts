import { NextRequest, NextResponse } from 'next/server';
import { dispatchPendingNotificationPush } from '../../../../lib/notificationsPush';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

// POST /api/notifications/dispatch-push — fan out Web Push for inbox
// notifications created since the last run. Driven by a Netlify scheduled
// function (every minute). Idempotent: each row is stamped push_sent_at.
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await dispatchPendingNotificationPush();
  return NextResponse.json(result);
}
