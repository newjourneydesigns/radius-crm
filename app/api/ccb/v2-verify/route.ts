import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { createCCBv2Client } from '../../../../lib/ccb/ccb-v2-client';

export const dynamic = 'force-dynamic';

/**
 * Migration verification: runs the v2 endpoint methods alongside the v1 client
 * for the same group/individual and returns both, so field mappings can be
 * confirmed before flipping CCB_API_VERSION for that endpoint.
 *
 * Gated by CRON_SECRET (?secret=). Requires CCB v2 to be connected
 * (/api/ccb/oauth/start) so a token exists.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (!process.env.CRON_SECRET || searchParams.get('secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let groupId = searchParams.get('groupId')?.trim() || '';
  if (!groupId) {
    const supabase = createServiceSupabaseClient();
    const { data } = await supabase
      .from('circle_leaders')
      .select('ccb_group_id')
      .not('ccb_group_id', 'is', null)
      .limit(1);
    groupId = String(data?.[0]?.ccb_group_id || '').trim();
  }
  if (!groupId) return NextResponse.json({ error: 'No ccb_group_id available; pass ?groupId=' }, { status: 400 });

  const ctx = { module: 'CCB v2 Verify', action: 'parity-diff', direction: 'pull' as const };
  const v1 = createCCBClient(ctx);
  const v2 = createCCBv2Client(ctx);

  const safe = async <T>(label: string, fn: () => Promise<T>) => {
    try { return await fn(); } catch (e: any) { return { __error: `${label}: ${e.message}` } as any; }
  };

  const [v1Parts, v2Parts] = await Promise.all([
    safe('v1 getGroupParticipants', () => v1.getGroupParticipants(groupId)),
    safe('v2 getGroupParticipants', () => v2.getGroupParticipants(groupId)),
  ]);

  const firstId =
    (Array.isArray(v2Parts) && v2Parts[0]?.id) ||
    (Array.isArray(v1Parts) && v1Parts[0]?.id) ||
    '';

  const [v1Ind, v2Ind] = firstId
    ? await Promise.all([
        safe('v1 getIndividualProfile', () => v1.getIndividualProfile(firstId)),
        safe('v2 getIndividualProfile', () => v2.getIndividualProfile(firstId)),
      ])
    : [null, null];

  return NextResponse.json({
    groupId,
    sampleIndividualId: firstId,
    memberCounts: {
      v1: Array.isArray(v1Parts) ? v1Parts.length : v1Parts,
      v2: Array.isArray(v2Parts) ? v2Parts.length : v2Parts,
    },
    individualProfile: { v1: v1Ind, v2: v2Ind },
    sampleMembers: {
      v1: Array.isArray(v1Parts) ? v1Parts.slice(0, 3) : v1Parts,
      v2: Array.isArray(v2Parts) ? v2Parts.slice(0, 3) : v2Parts,
    },
  });
}
