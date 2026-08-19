import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/**
 * Netlify Scheduled Function — Rebuild the CCB Group Search Cache
 *
 * Runs nightly at 8:00 UTC (3:00 AM CDT / 2:00 AM CST — Netlify cron is fixed
 * UTC, so the church-local hour shifts with DST like the repo's other crons).
 * Calls /api/ccb/sync-group-cache, which pages through CCB `group_profiles`
 * (include_participants=false) and rebuilds the ccb_group_cache table that
 * /api/ccb/group-search answers from.
 *
 * CCB cost: ceil(total groups / 100) API calls, once a day, through the
 * shared daily budget guard. A budget-skipped or partial sweep leaves
 * yesterday's cache serving (the API reports complete: false).
 */
const handler = schedule('0 8 * * *', async () => {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }
  console.log('Running CCB group cache sweep...');

  try {
    const appUrl =
      process.env.URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET;

    const response = await fetch(`${appUrl}/api/ccb/sync-group-cache`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: cronSecret ? `Bearer ${cronSecret}` : '',
      },
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Group cache sweep API error:', result);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to sync group cache',
          details: result,
        }),
      };
    }

    console.log(
      `Group cache sweep ${result.complete ? 'complete' : 'incomplete'}: ` +
        `${result.pagesFetched} pages, ${result.groupsUpserted} groups upserted, ` +
        `${result.staleDeleted} stale deleted` +
        (result.reason ? ` (${result.reason})` : '')
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Group cache sweep finished', result }),
    };
  } catch (error) {
    console.error('Error in group cache sweep scheduled function:', error);
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
