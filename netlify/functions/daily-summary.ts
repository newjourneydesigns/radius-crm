import { schedule } from '@netlify/functions';

/**
 * Netlify Scheduled Function - Personal Daily Digest
 *
 * Runs every day at 8:00 AM UTC.
 * Calls /api/daily-summary which sends a personalized digest email
 * to every user who has daily_email_subscribed = true.
 */
const handler = schedule('0 8 * * *', async (event) => {
  console.log('Running personal daily digest scheduled function...');

  try {
    const appUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET;

    const response = await fetch(`${appUrl}/api/daily-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Daily digest API error:', result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to send daily digests', details: result }),
      };
    }

    console.log(`Daily digests processed: sent=${result.sent}, errors=${result.errors?.length ?? 0}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Daily digests processed', result }),
    };
  } catch (error: any) {
    console.error('Error in daily digest scheduled function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', message: error.message }),
    };
  }
});

export { handler };
