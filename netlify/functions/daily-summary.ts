import { schedule } from '@netlify/functions';

/**
 * Netlify Scheduled Function - Personal Daily Digest
 *
 * Runs every hour.
 * Calls /api/daily-summary which checks each user's frequency setting
 * (every N hours starting at 12am CST) and sends digests only to users
 * whose current time slot matches their configured frequency.
 */
const handler = schedule('0 * * * *', async (event) => {
  console.log('Running personal digest scheduled function (hourly check)...');

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
