import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/**
 * Netlify Scheduled Function — Refresh the Latest Circle Guide
 *
 * Calls /api/circle-leader-toolkit/circle-guide, which re-reads the newest guide
 * from valleycreek.plus into circle_guide_cache so the toolkit's Events page can
 * serve it without an external round trip.
 *
 * Timed to the promise we make leaders: the new guide is available by 1pm Central
 * on Sunday. Netlify cron is fixed UTC while Central shifts with DST, so the three
 * hours cover both offsets — 17:00 and 18:00 UTC each land at or before 1pm Central
 * in summer and winter alike, and 19:00 is the retry for when the source CDN was
 * still serving a pre-publish copy (its age has been observed at several hours).
 *
 * Monday repeats the set so a Sunday where every attempt failed recovers the next
 * morning instead of leaving the card a week stale. Six ranged 256KB requests a
 * week, down from the 28 an every-6-hours schedule was spending.
 *
 * A failed run leaves the previous guide in place, so a miss is never visible
 * to leaders.
 */
const handler = schedule('0 17,18,19 * * 0,1', async () => {
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
