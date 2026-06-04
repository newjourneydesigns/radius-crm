import { schedule } from '@netlify/functions';

/** Netlify Scheduled Function — post-event Circle Summary push reminders. */
const handler = schedule('*/5 * * * *', async () => {
  const appUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  try {
    const response = await fetch(`${appUrl}/api/circle-leader-toolkit/summary-push-reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({}),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error('[circle-summary-push-reminders] API error:', result);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed', details: result }) };
    }
    console.log(`[circle-summary-push-reminders] sent=${result.sentCount} eligibleLeaders=${result.eligibleLeaders} errors=${result.errors?.length ?? 0}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, result }) };
  } catch (error: any) {
    console.error('[circle-summary-push-reminders] runtime error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal', message: error.message }) };
  }
});

export { handler };
