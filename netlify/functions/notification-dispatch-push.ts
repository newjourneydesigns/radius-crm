import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/**
 * Netlify Scheduled Function — inbox push dispatch.
 *
 * Backstop for the Supabase Database Webhook, which pushes each inbox
 * notification the instant it's created. This runs every 30 minutes and Web
 * Pushes any rows the webhook didn't deliver (e.g. a transient webhook
 * failure). Normally a no-op. Team messages are excluded — they push instantly
 * from the message API.
 */
const handler = schedule('*/30 * * * *', async () => {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }

  try {
    const appUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET;

    const response = await fetch(`${appUrl}/api/notifications/dispatch-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('Push dispatch API error:', result);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to dispatch push', details: result }) };
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'Push dispatched', result }) };
  } catch (error: any) {
    console.error('Error in push dispatch scheduled function:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', message: error.message }) };
  }
});

export { handler };
