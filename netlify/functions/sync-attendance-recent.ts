import { schedule } from '@netlify/functions';
import { runAttendanceSync } from '../../lib/netlify/runAttendanceSync';

/**
 * Netlify Scheduled Function — recent-window CCB attendance sync
 *
 * Most circle leaders record their summary in CCB rather than through the
 * RADIUS form, so RADIUS only learns of it on the next pull. While that pull
 * ran once a day the lag reached ~24h — long enough to flag leaders who had
 * reported on time as overdue on the Event Summary Tracker, and long enough to
 * make any "how late were they" reporting measure our polling rather than their
 * behaviour.
 *
 * Runs at :30 past every hour over a 14-day window, holding the lag under an
 * hour. Offset from the 11:00 UTC full pass so the two never upsert the same
 * rows at once. 1 CCB API call per run.
 */
const RECENT_WINDOW_DAYS = 14;

const handler = schedule('30 * * * *', async () => runAttendanceSync(RECENT_WINDOW_DAYS));

export { handler };
