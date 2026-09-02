import { schedule } from '@netlify/functions';
import { runAttendanceSync } from '../../lib/netlify/runAttendanceSync';

/**
 * Netlify Scheduled Function — full-semester CCB attendance backfill
 *
 * Runs daily at 6:00 AM CT (11:00 UTC) from semester start (2026-01-18) to
 * today, backstopping the hourly recent-window pass in
 * sync-attendance-recent.ts. 1 CCB API call.
 */
const handler = schedule('0 11 * * *', async () => runAttendanceSync(null));

export { handler };
