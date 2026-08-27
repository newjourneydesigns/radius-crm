import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/**
 * Netlify Scheduled Function — Refresh the Latest Circle Guide
 *
 * Runs every 6 hours. Calls /api/circle-leader-toolkit/circle-guide, which
 * re-reads the newest guide from valleycreek.plus into circle_guide_cache so
 * the toolkit's Events page can serve it without an external round trip.
 *
 * Every 6 hours rather than weekly: guides publish Sunday around 13:00 UTC, but
 * the source is served through a CDN with an observed age of several hours, so
 * a single Sunday run could read a copy cached before the guide went up. Four
 * ranged 256KB requests a day is negligible and bounds staleness to ~6 hours.
 *
 * A failed run leaves the previous guide in place, so a miss is never visible
 * to leaders.
 */
const handler = schedule('0 */6 * * *', async () => {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }

  try {
    const appUrl =
      process.env.URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET;

    const response = await fetch(`${appUrl}/api/circle-leader-toolkit/circle-guide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: cronSecret ? `Bearer ${cronSecret}` : '',
      },
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Circle Guide refresh API error:', result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to refresh Circle Guide', details: result }),
      };
    }

    console.log(
      result.ok
        ? `Circle Guide refreshed: ${result.guide?.title} (${result.guide?.publishedAt})`
        : `Circle Guide refresh kept the previous guide: ${result.error}`
    );

    return { statusCode: 200, body: JSON.stringify({ message: 'Circle Guide refresh finished', result }) };
  } catch (error) {
    console.error('Error in Circle Guide refresh scheduled function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
});

export { handler };
