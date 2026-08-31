import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/**
 * Netlify Scheduled Function — nightly CCB pull for the Student Leader Toolkit.
 *
 * Runs at 10:00 UTC (~5 AM CDT), deliberately between prewarm-circle-summary
 * (09:00) and sync-attendance (11:00) so the three CCB jobs never overlap and
 * compete for the shared daily budget.
 *
 * Calls /api/student-toolkit/sync, which walks the CCB groups staff mapped in
 * student_ministry_groups and fills student_directory_cache and
 * student_attendance. The toolkit's roster reads only those caches, so a room
 * full of leaders opening the app on a Wednesday night never touches CCB.
 *
 * A no-op until student ministry provides the group IDs — the route reports
 * that plainly rather than returning a misleading success.
 */
const handler = schedule('0 10 * * *', async () => {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }

  if (process.env.NEXT_PUBLIC_STUDENT_TOOLKIT_ENABLED !== 'true') {
    return { statusCode: 200, body: 'student toolkit disabled' };
  }

  const appUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET is not configured; skipping student attendance sync.');
    return { statusCode: 500, body: JSON.stringify({ error: 'CRON_SECRET missing' }) };
  }

  try {
    const response = await fetch(`${appUrl}/api/student-toolkit/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Student attendance sync API error:', result);
      return { statusCode: response.status, body: JSON.stringify(result) };
    }

    console.log('Student attendance sync:', result.message || 'complete');
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Student attendance sync failed:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
});

export { handler };
