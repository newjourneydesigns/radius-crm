import { NextResponse } from 'next/server';
import { getSessionLeader } from '../../../../lib/circle-summary/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return NextResponse.json({ leader: null });
  return NextResponse.json({ leader });
}
