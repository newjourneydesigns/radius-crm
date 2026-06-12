import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/**
 * Netlify Scheduled Function — Circle Summary reminders.
 *
 * Runs every 15 minutes. Sends a single reminder email ~30 minutes after each
 * Circle starts, nudging the leader to submit their summary.
 *
 * Idempotent: backed by the circle_reminder_sends table (one email per occurrence).
 */
const handler = schedule('*/15 * * * *', async () => {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }
  console.log('[circle-reminders] tick');

  const appUrl =
    process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  try {
    const response = await fetch(`${appUrl}/api/circle-leader-toolkit/reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[circle-reminders] API error:', result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed', details: result }),
      };
    }

    console.log(
      `[circle-reminders] sent=${result.sentCount} eligibleLeaders=${result.eligibleLeaders} errors=${result.errors?.length ?? 0}`
    );
    return { statusCode: 200, body: JSON.stringify({ ok: true, result }) };
  } catch (error: any) {
    console.error('[circle-reminders] runtime error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal', message: error.message }),
    };
  }
});

export { handler };
