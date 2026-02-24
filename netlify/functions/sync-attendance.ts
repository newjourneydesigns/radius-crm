import { schedule } from '@netlify/functions';

/**
 * Netlify Scheduled Function — Sync Circle Attendance from CCB
 *
 * Runs daily at 6:00 AM CT (11:00 UTC).
 * Calls /api/ccb/sync-attendance which pulls the last 6 months of
 * attendance data from CCB and upserts it into the
 * circle_meeting_occurrences table.
 */
const handler = schedule('0 11 * * *', async (event) => {
  console.log('Running circle attendance sync...');

  try {
    const appUrl =
      process.env.URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET;

    const response = await fetch(`${appUrl}/api/ccb/sync-attendance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: cronSecret ? `Bearer ${cronSecret}` : '',
      },
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Attendance sync API error:', result);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to sync attendance',
          details: result,
        }),
      };
    }

    console.log(
      `Attendance sync complete: ${result.leadersProcessed} leaders, ` +
        `${result.synced} occurrences synced, ${result.noRecordFilled} no-record gaps filled, ` +
        `${result.errors} errors`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Attendance sync complete', result }),
    };
  } catch (error: any) {
    console.error('Error in attendance sync scheduled function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
});

export { handler };
