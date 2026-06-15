import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/**
 * Netlify Scheduled Function — daily inbox alerts.
 *
 * Runs once each morning (12:00 UTC ≈ 6–7am Central) and asks the app to
 * create birthday + due-follow-up notifications for each director's inbox.
 * The route itself is idempotent, so an extra run never double-posts.
 */
const handler = schedule('0 12 * * *', async () => {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }

  try {
    const appUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET;

    const response = await fetch(`${appUrl}/api/notifications/daily-alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('Daily alerts API error:', result);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create daily alerts', details: result }) };
    }

    console.log(`Daily inbox alerts processed: created=${result.created}, checked=${result.checked}`);
    return { statusCode: 200, body: JSON.stringify({ message: 'Daily alerts processed', result }) };
  } catch (error: any) {
    console.error('Error in daily alerts scheduled function:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', message: error.message }) };
  }
});

export { handler };
