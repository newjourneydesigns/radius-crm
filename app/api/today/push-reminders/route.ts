import { NextResponse } from 'next/server';
import { runUserTimedReminders } from '../../../../lib/todayPushReminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Invoked by the today-push-reminders Netlify scheduled function every
// 5 minutes. Sends Web Push reminders ~10 minutes before timed cards and
// follow-ups to users who enabled reminders on the Today page.
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runUserTimedReminders();
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('Today push reminders error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
