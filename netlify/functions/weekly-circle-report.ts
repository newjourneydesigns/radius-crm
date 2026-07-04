import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/**
 * Netlify Scheduled Function — Weekly Circle Report
 *
 * Runs Monday at 13:00 UTC (8am CDT / 7am CST — Monday morning Central
 * year-round). Calls /api/weekly-report-email, which emails every ACPD user an
 * executive summary of the last completed Sunday–Saturday week.
 */
const handler = schedule('0 13 * * 1', async () => {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }
  console.log('Running weekly circle report scheduled function...');

  try {
    const appUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET;

    const response = await fetch(`${appUrl}/api/weekly-report-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': cronSecret ? `Bearer ${cronSecret}` : '',
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Weekly circle report API error:', result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to send weekly circle report', details: result }),
      };
    }

    console.log(`Weekly circle report processed: sent=${result.sent}, errors=${result.errors?.length ?? 0}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Weekly circle report processed', result }),
    };
  } catch (error: any) {
    console.error('Error in weekly circle report scheduled function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', message: error.message }),
    };
  }
});

export { handler };
