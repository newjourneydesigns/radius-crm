import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { requireAcpd, getTeamChannelId, ensureMembership } from '../../../../lib/acpdMessaging';

export const dynamic = 'force-dynamic';

// GET /api/acpd-messages/unread-count — total unread messages across the
// caller's conversations. Powers the nav badge; kept lightweight for polling.
export async function GET(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  const supabase = createServiceSupabaseClient();
  const me = profile.id;

  const channelId = await getTeamChannelId(supabase);
  if (channelId) await ensureMembership(supabase, channelId, me);

  const { data: memberships } = await supabase
    .from('acpd_conversation_members')
    .select('conversation_id, last_read_at')
    .eq('user_id', me);

  const rows = (memberships || []) as { conversation_id: string; last_read_at: string }[];

  const counts = await Promise.all(
    rows.map(async (row) => {
      const { count } = await supabase
        .from('acpd_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', row.conversation_id)
        .gt('created_at', row.last_read_at || new Date(0).toISOString())
        .neq('sender_id', me);
      return count || 0;
    })
  );

  const total = counts.reduce((sum, n) => sum + n, 0);
  return NextResponse.json({ count: total });
}
