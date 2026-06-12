import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/** Netlify Scheduled Function — push reminders for timed Today items. */
const handler = schedule('*/5 * * * *', async () => {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }
  const appUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  try {
    const response = await fetch(`${appUrl}/api/today/push-reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({}),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error('[today-push-reminders] API error:', result);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed', details: result }) };
    }
    console.log(`[today-push-reminders] users=${result.usersChecked} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, result }) };
  } catch (error) {
    console.error('[today-push-reminders] runtime error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal', message: error instanceof Error ? error.message : 'unknown' }) };
  }
});

export { handler };
