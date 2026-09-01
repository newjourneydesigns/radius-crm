import { scheduledFunctionsDisabled } from './scheduledFunctionsDisabled';

/**
 * Invoke POST /api/ccb/sync-attendance on behalf of a scheduled function.
 *
 * Two schedules share this: an hourly pass over a recent window, and a daily
 * pass over the full semester that backfills anything the narrow window missed.
 * `lookbackDays === null` means the full semester range.
 */
export async function runAttendanceSync(lookbackDays: number | null) {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }

  const label = lookbackDays === null ? 'full semester' : `last ${lookbackDays} days`;
  console.log(`Running circle attendance sync (${label})...`);

  try {
    const appUrl =
      process.env.URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET;
    const query = lookbackDays === null ? '' : `?lookbackDays=${lookbackDays}`;

    const response = await fetch(`${appUrl}/api/ccb/sync-attendance${query}`, {
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
      `Attendance sync complete (${label}): ${result.leadersProcessed} leaders, ` +
        `${result.synced} occurrences synced, ${result.noRecordFilled} no-record gaps filled, ` +
        `${result.errors} errors`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Attendance sync complete', result }),
    };
  } catch (error: unknown) {
    console.error('Error in attendance sync scheduled function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}
