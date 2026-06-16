import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/** Netlify Scheduled Function — delivers due scheduled Circle Summary inbox messages.
 *  Runs every 5 minutes; scheduled messages go out within ~5 min of their time. */
const handler = schedule('*/5 * * * *', async () => {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }
  const appUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  try {
    const response = await fetch(`${appUrl}/api/circle-leader-toolkit/deliver-scheduled-inbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({}),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error('[deliver-scheduled-inbox] API error:', result);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed', details: result }) };
    }
    console.log(`[deliver-scheduled-inbox] delivered=${result.delivered} due=${result.due} errors=${result.errors?.length ?? 0}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, result }) };
  } catch (error: any) {
    console.error('[deliver-scheduled-inbox] runtime error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal', message: error.message }) };
  }
});

export { handler };
