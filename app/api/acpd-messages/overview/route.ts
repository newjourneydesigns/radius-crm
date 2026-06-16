import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { requireAcpd, getTeamChannelId, ensureMembership, groupTitleFrom } from '../../../../lib/acpdMessaging';

export const dynamic = 'force-dynamic';

type MemberRow = { conversation_id: string; user_id: string; last_read_at: string };

// Returns everything the Messages page needs to render its sidebar: the
// signed-in ACPD's conversations (team channel + DMs) with last-message
// previews and unread counts, plus the directory of other ACPDs they can start
// a new DM with.
export async function GET(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  const supabase = createServiceSupabaseClient();
  const me = profile.id;

  // Everyone belongs to the shared team channel — join on first visit.
  const channelId = await getTeamChannelId(supabase);
  if (channelId) await ensureMembership(supabase, channelId, me);

  // My memberships → the conversations I can see.
  const { data: myMemberships } = await supabase
    .from('acpd_conversation_members')
    .select('conversation_id, last_read_at')
    .eq('user_id', me);

  const myRows = (myMemberships || []) as { conversation_id: string; last_read_at: string }[];
  const conversationIds = myRows.map((r) => r.conversation_id);
  const lastReadById = new Map(myRows.map((r) => [r.conversation_id, r.last_read_at]));

  let conversations: any[] = [];

  if (conversationIds.length > 0) {
    const [{ data: convs }, { data: allMembers }] = await Promise.all([
      supabase
        .from('acpd_conversations')
        .select('id, kind, title, last_message_at')
        .in('id', conversationIds),
      supabase
        .from('acpd_conversation_members')
        .select('conversation_id, user_id, users:user_id (id, name, email)')
        .in('conversation_id', conversationIds),
    ]);

    // Group the "other participants" of each conversation (for DM names).
    const othersByConv = new Map<string, { id: string; name: string; email: string }[]>();
    for (const row of (allMembers || []) as any[]) {
      if (row.user_id === me || !row.users) continue;
      const list = othersByConv.get(row.conversation_id) || [];
      list.push(row.users);
      othersByConv.set(row.conversation_id, list);
    }

    conversations = await Promise.all(
      ((convs || []) as any[]).map(async (conv) => {
        const lastReadAt = lastReadById.get(conv.id) || new Date(0).toISOString();

        const [{ data: lastMsg }, { count }] = await Promise.all([
          supabase
            .from('acpd_messages')
            .select('body, sender_id, created_at')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('acpd_messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .gt('created_at', lastReadAt)
            .neq('sender_id', me),
        ]);

        const others = othersByConv.get(conv.id) || [];
        const isChannel = conv.kind === 'channel';
        const isGroup = conv.kind === 'group';

        const groupTitle = conv.title || groupTitleFrom(others);

        return {
          id: conv.id,
          kind: conv.kind,
          title: isChannel ? conv.title || 'ACPD Team' : isGroup ? groupTitle : others[0]?.name || 'Direct message',
          otherUser: isChannel || isGroup ? null : others[0] || null,
          memberCount: others.length + 1,
          lastMessage: lastMsg
            ? { body: lastMsg.body, senderId: lastMsg.sender_id, createdAt: lastMsg.created_at }
            : null,
          lastMessageAt: conv.last_message_at,
          unreadCount: count || 0,
        };
      })
    );

    // Channel first, then DMs by most recent activity.
    conversations.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'channel' ? -1 : 1;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });
  }

  // Directory of other ACPDs to start a DM with.
  const { data: directory } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('role', 'ACPD')
    .neq('id', me)
    .order('name', { ascending: true });

  const unreadTotal = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return NextResponse.json({
    me: { id: profile.id, name: profile.name, email: profile.email },
    conversations,
    directory: directory || [],
    unreadTotal,
  });
}
