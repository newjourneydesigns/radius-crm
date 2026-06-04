/**
 * POST /api/circle-leader-toolkit/roster/search
 * Body: { query: string }
 * Searches CCB individuals (name or phone) for the roster-add flow.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../../lib/circle-leader-toolkit/session';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  let body: { query?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const query = (body.query || '').trim();
  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'roster_search' })
  );

  try {
    const results = await ccb.searchIndividuals(query);
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ results: [], error: e.message }, { status: 500 });
  }
}
