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
 * Runs at 10:15 UTC (~5:15 AM CDT), chosen to sit clear of every other CCB
 * job: after prewarm-circle-summary's paced loop (09:00) has finished, off the
 * hourly sync-attendance-recent (:30 — 10:30 would collide), and 45 minutes
 * before sync-attendance (11:00) consumes the fresh ids.
 *
 * `force=true` re-discovers every active leader, not just NULL ones — the
 * whole point is that a stale list cannot be told from a current one without
 * asking CCB. Safe to force nightly: the route keeps a leader's existing ids
 * when the CCB lookup fails, and only writes NULL when a lookup SUCCEEDS and
 * genuinely finds no events. ~1 CCB call per leader, 2s apart.
 *
 * Requires CRON_SECRET; the route also accepts it as Bearer auth.
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
    const response = await fetch(`${appUrl}/api/ccb/discover-events/?force=true`, {
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
      `Event discovery complete: ${result.processed} leaders, ${result.discovered} with events, ` +
        `${result.noEvents} with none, ${result.errors} errors`
    );
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Event discovery failed:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
});

export { handler };
