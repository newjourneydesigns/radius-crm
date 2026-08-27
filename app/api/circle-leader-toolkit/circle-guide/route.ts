/**
 * Latest Circle Guide.
 *
 *   GET  — signed-in leader; returns the cached guide link.
 *   POST — cron only; re-resolves the newest guide from valleycreek.plus.
 *
 * Lives under /api/circle-leader-toolkit/ because middleware.ts 404s every
 * other API path on the dedicated toolkit host.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import {
  readCircleGuideLink,
  refreshCircleGuideCache,
} from '../../../../lib/circle-leader-toolkit/circle-guide';

export const dynamic = 'force-dynamic';

function isCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  // Fail closed: a missing CRON_SECRET must never authorize the caller.
  if (!cronSecret) return false;
  return req.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  return NextResponse.json({ guide: await readCircleGuideLink() });
}

export async function POST(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await refreshCircleGuideCache();
  // A failed lookup is reported, not thrown: the previous guide is still
  // cached and still being served, so this is not a 500 condition.
  return NextResponse.json(result);
}
