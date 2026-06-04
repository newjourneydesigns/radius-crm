/**
 * POST /api/circle-leader-toolkit/magic-link
 *
 * Leader-facing endpoint. Returns a 7-day magic link for the currently signed-in
 * Circle leader. The link signs the leader into Circle Summary only; it does
 * not create a Supabase app session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, MAGIC_LINK_TTL_MS } from '../../../../lib/leader-tokens';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { getCircleSummaryBaseUrl } from '../../../../lib/circle-leader-toolkit/links';

export const dynamic = 'force-dynamic';
const MAGIC_LINK_TTL_SECONDS = Math.floor(MAGIC_LINK_TTL_MS / 1000);

export async function POST(req: NextRequest) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const groupId = leader.ccb_group_id != null ? String(leader.ccb_group_id) : '';
  if (!groupId) {
    return NextResponse.json(
      { error: 'This Circle is not linked yet. Contact your Circle team for help.' },
      { status: 400 },
    );
  }

  const targetPath = `/circle-leader-toolkit/${encodeURIComponent(groupId)}/events`;
  const token = createSessionToken(leader.id, MAGIC_LINK_TTL_MS, {
    sessionMaxAgeSeconds: MAGIC_LINK_TTL_SECONDS,
  });
  const url = new URL('/api/circle-leader-toolkit/auth/link', getCircleSummaryBaseUrl(req));
  url.searchParams.set('t', token);
  url.searchParams.set('next', targetPath);

  return NextResponse.json({
    ok: true,
    url: url.toString(),
    targetPath,
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString(),
    expiresInDays: 7,
  });
}
