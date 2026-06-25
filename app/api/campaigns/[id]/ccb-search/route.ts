import { NextRequest, NextResponse } from 'next/server';
import { getUserFromAuthHeader } from '../../../../../lib/server-supabase';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ individuals: [] });

  const ctx = await getCCBRequestContext(req, {
    module: 'Follow-Up Campaigns',
    action: 'Individual Search',
    direction: 'pull',
  });
  const ccb = createCCBClient(ctx);

  try {
    const results = await ccb.searchIndividuals(q);
    return NextResponse.json({ individuals: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
