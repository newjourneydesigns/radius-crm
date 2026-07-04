import { schedule } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { scheduledFunctionsDisabled } from '../../lib/netlify/scheduledFunctionsDisabled';

/**
 * Netlify Scheduled Function — prune dead leader_sessions rows.
 *
 * Every OTP verify / temporary magic-link hit inserts a leader_sessions row and
 * nothing ever removed them, so the table grew without bound. This weekly job
 * deletes rows that can no longer authenticate anyone:
 *   - revoked more than 30 days ago, and
 *   - not seen in over 410 days (past the 400-day session cookie max-age, so the
 *     cookie is already expired client-side).
 * Active sessions are untouched.
 *
 * Runs Sundays at 08:00 UTC. Only on the main RADIUS site (toolkit sites
 * auto-disable cron via scheduledFunctionsDisabled()).
 */
const REVOKED_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const STALE_MS = 410 * 24 * 60 * 60 * 1000;

const handler = schedule('0 8 * * 0', async () => {
  if (scheduledFunctionsDisabled()) {
    return { statusCode: 200, body: 'scheduled functions disabled on this site' };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { statusCode: 500, body: 'Missing Supabase service credentials' };
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const now = Date.now();
  const revokedCutoff = new Date(now - REVOKED_GRACE_MS).toISOString();
  const staleCutoff = new Date(now - STALE_MS).toISOString();

  try {
    const revoked = await supabase
      .from('leader_sessions')
      .delete()
      .not('revoked_at', 'is', null)
      .lt('revoked_at', revokedCutoff)
      .select('id');

    const stale = await supabase
      .from('leader_sessions')
      .delete()
      .lt('last_seen_at', staleCutoff)
      .select('id');

    const revokedDeleted = revoked.data?.length ?? 0;
    const staleDeleted = stale.data?.length ?? 0;
    console.log(`leader_sessions reaper: removed ${revokedDeleted} revoked + ${staleDeleted} stale rows`);

    return {
      statusCode: 200,
      body: JSON.stringify({ revokedDeleted, staleDeleted }),
    };
  } catch (error: any) {
    console.error('leader_sessions reaper failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error?.message || 'reaper failed' }) };
  }
});

export { handler };
