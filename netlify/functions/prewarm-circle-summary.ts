import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/**
 * Netlify Scheduled Function — Daily CCB bulk sync.
 *
 * Runs once a day at 09:00 UTC (~4 AM CDT / 3 AM CST). Calls
 * /api/circle-leader-toolkit/prewarm which makes ONE bulk attendance_profiles call
 * plus per-group calendar events, and writes them to `ccb_group_events_cache`.
 *
 * Reads (Circle Summary, dashboard auto-update) serve from that cache by
 * default with a 24h freshness window.
 *
 * History: previously ran every 10 min and bled CCB's rate limit; rewritten
 * 2026-05-20 after that incident.
 */
const handler = schedule('0 9 * * *', async () => {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }
  console.log('Running daily CCB bulk sync...');

  try {
    const appUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('CRON_SECRET is not configured; skipping bulk sync.');
      return { statusCode: 500, body: JSON.stringify({ error: 'CRON_SECRET missing' }) };
    }

    const response = await fetch(`${appUrl}/api/circle-leader-toolkit/prewarm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Daily bulk sync API error:', result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Bulk sync failed', details: result }),
      };
    }

    console.log(
      `Daily bulk sync complete: groups=${result.groups}, warmed=${result.warmed}, bulkAttendance=${result.bulkAttendanceFetched}, breaker=${result.breakerTripped}, errors=${result.errors?.length ?? 0}`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Daily bulk sync complete', result }),
    };
  } catch (error: any) {
    console.error('Error in daily bulk sync scheduled function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', message: error.message }),
    };
  }
});

export { handler };
