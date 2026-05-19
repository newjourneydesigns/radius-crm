import { schedule } from '@netlify/functions';

/**
 * Netlify Scheduled Function — Circle Summary cache prewarm.
 *
 * Runs every 10 minutes. Calls /api/circle-summary/prewarm which iterates
 * active Circle Leaders' CCB groups and refreshes the shared Supabase cache
 * (ccb_group_events_cache). Leader requests then serve from Supabase instead
 * of paying a 1–3s CCB round trip, even on cold serverless instances.
 */
const handler = schedule('*/10 * * * *', async () => {
  console.log('Running Circle Summary prewarm...');

  try {
    const appUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('CRON_SECRET is not configured; skipping prewarm.');
      return { statusCode: 500, body: JSON.stringify({ error: 'CRON_SECRET missing' }) };
    }

    const response = await fetch(`${appUrl}/api/circle-summary/prewarm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Prewarm API error:', result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Prewarm failed', details: result }),
      };
    }

    console.log(
      `Prewarm complete: groups=${result.groups}, warmed=${result.warmed}, errors=${result.errors?.length ?? 0}`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Prewarm complete', result }),
    };
  } catch (error: any) {
    console.error('Error in prewarm scheduled function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', message: error.message }),
    };
  }
});

export { handler };
