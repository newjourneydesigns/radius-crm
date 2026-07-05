import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/**
 * Netlify Scheduled Function — nightly Circle Leader Toolkit health check.
 *
 * Runs at 09:45 UTC (≈4:45am CDT / 3:45am CST), 45 minutes after the 09:00 UTC
 * prewarm so the CCB calendar/attendance cache it reads is fresh. Leaders with
 * unsubmitted event summaries or unread inbox messages get one digest push
 * whose badgeCount updates the app-icon badge on installed PWAs overnight.
 */
const handler = schedule('45 9 * * *', async () => {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }
  const appUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  try {
    const response = await fetch(`${appUrl}/api/circle-leader-toolkit/health-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({}),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error('[circle-toolkit-health-check] API error:', result);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed', details: result }) };
    }
    console.log(
      `[circle-toolkit-health-check] checked=${result.checkedLeaders} sent=${result.sentCount} skipped=${result.skipped?.length ?? 0} errors=${result.errors?.length ?? 0}`
    );
    return { statusCode: 200, body: JSON.stringify({ ok: true, result }) };
  } catch (error: any) {
    console.error('[circle-toolkit-health-check] runtime error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal', message: error.message }) };
  }
});

export { handler };
