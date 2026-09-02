import { schedule } from '@netlify/functions';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/**
 * Netlify Scheduled Function — nightly re-discovery of each circle leader's
 * CCB event ids into `circle_leaders.ccb_event_ids`.
 *
 * Why this exists: the attendance sync (and everything downstream of it — the
 * Event Summary Tracker, the compliance KPI, and the toolkit's fast read path)
 * only tracks the event ids in that column. Discovery used to run ONCE: the
 * route defaults to filling leaders whose list is NULL and never revisits a
 * populated one. So when a CCB event was renamed or re-created, the leader's
 * list silently went stale, the sync stopped seeing their meetings, and a
 * summary they filed on time read as missing (toolkit: PENDING; tracker: late).
 *
 * Runs at 10:15 UTC (~5:15 AM CDT): after prewarm-circle-summary (09:00) has
 * refreshed the cached calendars this reads, and 45 minutes before
 * sync-attendance (11:00) consumes the fresh ids.
 *
 * Uses ?source=calendar, NOT the CCB walk. The first version of this job
 * called the route with ?force=true, which fetches event ids and a roster
 * from CCB per leader, 2s apart — four-plus minutes for the church. Netlify
 * terminates synchronous function invocations at 10s (free) / 26s (paid),
 * and `maxDuration` does not lift that ceiling; the run 504'd partway
 * through every time (observed from a browser on the day it shipped), and
 * because leader order is stable it would have re-done the same prefix
 * nightly and never reached the tail. Calendar mode makes no CCB calls at
 * all: it unions the event ids already in ccb_group_events_cache into each
 * leader's list in three Supabase queries. Seconds, no ceiling to hit.
 *
 * Requires CRON_SECRET; the route also accepts a signed-in admin.
 */
const handler = schedule('15 10 * * *', async () => {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }

  const appUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET is not configured; skipping event discovery.');
    return { statusCode: 500, body: JSON.stringify({ error: 'CRON_SECRET missing' }) };
  }

  try {
    const response = await fetch(`${appUrl}/api/ccb/discover-events/?source=calendar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Event discovery API error:', result);
      return { statusCode: response.status, body: JSON.stringify(result) };
    }

    console.log(
      `Event discovery (calendar) complete: ${result.leaders} leaders, ${result.updated} updated, ` +
        `${result.unchanged} unchanged, ${result.noCalendar} without a cached calendar, ${result.errors} errors`
    );
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Event discovery failed:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
});

export { handler };
