import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/**
 * Netlify Scheduled Function — weekly CCB pull for the Student Leader Toolkit.
 *
 * Twice on Thursday UTC, which is Wednesday night + Thursday morning locally:
 *
 *   03:00 UTC — Wed 10 PM CDT / 9 PM CST. The run leaders feel: student
 *               circles and movement nights meet Wednesday at 7 PM and
 *               everyone who is going to check in has by 8 PM, so this puts
 *               the night's attendance in the roster the same evening instead
 *               of holding it until the next morning.
 *   10:00 UTC — Thu 5 AM CDT / 4 AM CST. The safety net: if the evening run
 *               failed, this catches it before anyone opens the app Thursday.
 *               Kept in the original slot, between prewarm-circle-summary
 *               (09:00) and sync-attendance (11:00), so the three CCB jobs
 *               never overlap on the shared daily budget.
 *
 * Cron is UTC and does not shift with daylight saving, so both times are
 * chosen to sit clear of the 8 PM check-in cutoff in BOTH regimes — the
 * evening run lands at 10 PM in summer and 9 PM in winter. Moving it an hour
 * earlier would make it 8 PM CST in winter, right on the cutoff.
 *
 * Weekly rather than daily on purpose. Every run re-pulls the ENTIRE term
 * (termStartDate → today) and upserts, so it is a full idempotent rebuild, not
 * an incremental window — skipping days loses no attendance. Wednesday is the
 * only night these groups meet, so the other five daily runs found nothing new.
 * What they did still refresh is the directory half (who is in the CCB group),
 * which can change any day; if mid-week roster edits turn out to be common,
 * either restore a daily cadence or add a directory-only refresh. Staff can
 * always run it on demand from Admin → Student Groups in the meantime.
 *
 * Calls /api/student-toolkit/sync, which walks the CCB groups staff mapped in
 * student_ministry_groups and fills student_directory_cache and
 * student_attendance. The toolkit's roster reads only those caches, so a room
 * full of leaders opening the app on a Wednesday night never touches CCB.
 *
 * A no-op until student ministry provides the group IDs — the route reports
 * that plainly rather than returning a misleading success.
 */
const handler = schedule('0 3,10 * * 4', async () => {
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
