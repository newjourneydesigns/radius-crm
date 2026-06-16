import { NextRequest, NextResponse } from 'next/server';
import { dispatchPendingNotificationPush } from '../../../../lib/notificationsPush';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

// POST /api/notifications/dispatch-push — fan out Web Push for inbox
// notifications. Two callers:
//   • Supabase Database Webhook on notifications INSERT — sends the new row's
//     payload ({ record: { id } }); we push that single row instantly.
//   • The dispatch-push cron — sends no id; we scan + push any unpushed rows
//     as a backstop. Idempotent either way: rows are claimed via push_sent_at.
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let id: string | undefined;
  try {
    const body = await req.json();
    id = body?.record?.id || body?.id || undefined;
  } catch {
    // No / empty body → scan (cron) path.
  }
  const result = await dispatchPendingNotificationPush(id ? { id } : {});
  return NextResponse.json(result);
}
