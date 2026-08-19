import { NextRequest, NextResponse } from 'next/server';
import { syncCCBGroupCache } from '../../../../lib/ccb/group-cache-sync';
import { CCBDailyBudgetError, CCBCircuitBreakerError } from '../../../../lib/ccb/ccb-client';

export const dynamic = 'force-dynamic';
// A full sweep is tens of sequential CCB calls; give it room beyond the
// default function timeout.
export const maxDuration = 300;

// ════════════════════════════════════════════════════════════════════
// POST /api/ccb/sync-group-cache — rebuild the CCB group search cache
//
// Pages through CCB v1 `group_profiles` (include_participants=false,
// 100/page) and rebuilds ccb_group_cache for /api/ccb/group-search.
// Rows the sweep didn't touch are deleted ONLY after a complete sweep.
//
// Called nightly by netlify/functions/sync-group-cache.ts. For a manual
// run (e.g. the first cache fill), invoke it the same way:
//
//   curl -X POST "$APP_URL/api/ccb/sync-group-cache" \
//     -H "Authorization: Bearer $CRON_SECRET"
//
// CCB cost: ceil(total groups / 100) API calls, through the shared
// daily budget guard. If the guard reports the day is spent, the sweep
// skips and yesterday's cache keeps serving (complete: false).
// ════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  // Auth — fail closed. Called only by the Netlify scheduled function (or an
  // operator), which sends `Bearer ${CRON_SECRET}`. If the secret is
  // unconfigured we must reject, not run the sync unauthenticated.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncCCBGroupCache({
      module: 'Group Search Cache',
      action: 'Nightly Group Sweep',
      direction: 'pull',
    });

    console.log(
      `Group cache sweep ${result.complete ? 'complete' : 'INCOMPLETE'}: ` +
        `${result.pagesFetched} pages, ${result.groupsUpserted} groups upserted, ` +
        `${result.staleDeleted} stale deleted` +
        (result.reason ? ` (${result.reason})` : '')
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    // A budget/breaker trip on the very first call surfaces here (nothing was
    // swept). Report it as a skipped sweep, not a server failure.
    if (error instanceof CCBDailyBudgetError || error instanceof CCBCircuitBreakerError) {
      console.warn('Group cache sweep skipped:', error.message);
      return NextResponse.json({
        success: true,
        complete: false,
        pagesFetched: 0,
        groupsUpserted: 0,
        staleDeleted: 0,
        syncedAt: null,
        reason: error.message,
      });
    }
    console.error('CCB Group Cache Sync Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to sync CCB group cache',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
