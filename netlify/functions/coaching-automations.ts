import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';
import { isCoachingAutomationsEnabled } from '../../lib/circle-leader-toolkit/coaching/feature-flag';

/**
 * Netlify Scheduled Function — Circle Leader coaching automations.
 *
 * Runs once daily (13:00 UTC ≈ 8am America/Chicago). Evaluates each leader's
 * roster/attendance signals and delivers life-giving coaching nudges to their
 * Toolkit inbox. Weekly automations dedupe on an ISO-week bucket, so a daily
 * tick fires them at most once per week.
 *
 * Idempotent: backed by the coaching_automation_sends table.
 *
 * Gated by the coaching automations feature flag — while the feature is off this
 * tick is a no-op and no nudges are sent.
 */
const handler = schedule('0 13 * * *', async () => {
  if (!isCoachingAutomationsEnabled()) {
    return { statusCode: 200, body: 'coaching automations feature disabled' };
  }
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }
  console.log('[coaching-automations] tick');

  const appUrl =
    process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  try {
    const response = await fetch(`${appUrl}/api/circle-leader-toolkit/coaching-automations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[coaching-automations] API error:', result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed', details: result }),
      };
    }

    console.log(
      `[coaching-automations] sent=${result.sentCount} eligibleLeaders=${result.eligibleLeaders} errors=${result.errors?.length ?? 0}`
    );
    return { statusCode: 200, body: JSON.stringify({ ok: true, result }) };
  } catch (error: any) {
    console.error('[coaching-automations] runtime error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal', message: error.message }),
    };
  }
});

export { handler };
