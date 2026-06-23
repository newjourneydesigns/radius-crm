import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { requireAcpd, getTeamChannelId, ensureMembership, groupTitleFrom } from '../../../../lib/acpdMessaging';

export const dynamic = 'force-dynamic';

type DirectoryUser = { id: string; name: string; email: string };
type ConversationRow = {
  id: string;
  kind: string;
  title: string | null;
  last_message_at: string | null;
};
type MemberWithUserRow = {
  conversation_id: string;
  user_id: string;
  users: DirectoryUser | DirectoryUser[] | null;
};
type MessagePreviewRow = {
  conversation_id: string;
  body: string;
  sender_id: string | null;
  created_at: string;
};
type ConversationSummary = {
  id: string;
  kind: string;
  title: string;
  otherUser: DirectoryUser | null;
  memberCount: number;
  lastMessage: { body: string; senderId: string | null; createdAt: string } | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

function singleUser(value: DirectoryUser | DirectoryUser[] | null | undefined): DirectoryUser | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

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

  let conversations: ConversationSummary[] = [];

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
    for (const row of (allMembers || []) as MemberWithUserRow[]) {
      const user = singleUser(row.users);
      if (row.user_id === me || !user) continue;
      const list = othersByConv.get(row.conversation_id) || [];
      list.push(user);
      othersByConv.set(row.conversation_id, list);
    }

    const convRows = (convs || []) as ConversationRow[];
    const unreadFloor = new Date(0).toISOString();
    const lastReadValues = conversationIds.map((id) => lastReadById.get(id) || unreadFloor);
    const earliestLastRead = lastReadValues.length > 0
      ? lastReadValues.reduce((earliest, value) => value < earliest ? value : earliest)
      : unreadFloor;
    const previewLimit = Math.max(conversationIds.length * 20, 50);

    const [{ data: previewRows }, { data: unreadRows }] = await Promise.all([
      supabase
        .from('acpd_messages')
        .select('conversation_id, body, sender_id, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .limit(previewLimit),
      supabase
        .from('acpd_messages')
        .select('conversation_id, created_at')
        .in('conversation_id', conversationIds)
        .gt('created_at', earliestLastRead)
        .neq('sender_id', me),
    ]);

    const lastMessageByConv = new Map<string, MessagePreviewRow>();
    for (const msg of (previewRows || []) as MessagePreviewRow[]) {
      if (!lastMessageByConv.has(msg.conversation_id)) {
        lastMessageByConv.set(msg.conversation_id, msg);
      }
    }

    const missingPreviewIds = convRows
      .filter((conv) => conv.last_message_at && !lastMessageByConv.has(conv.id))
      .map((conv) => conv.id);

    if (missingPreviewIds.length > 0) {
      await Promise.all(missingPreviewIds.map(async (conversationId) => {
        const { data } = await supabase
          .from('acpd_messages')
          .select('conversation_id, body, sender_id, created_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) lastMessageByConv.set(conversationId, data as MessagePreviewRow);
      }));
    }

    const unreadByConv = new Map<string, number>();
    for (const msg of (unreadRows || []) as Array<{ conversation_id: string; created_at: string }>) {
      const lastReadAt = lastReadById.get(msg.conversation_id) || unreadFloor;
      if (msg.created_at <= lastReadAt) continue;
      unreadByConv.set(msg.conversation_id, (unreadByConv.get(msg.conversation_id) || 0) + 1);
    }

    conversations = convRows.map((conv) => {
        const others = othersByConv.get(conv.id) || [];
        const isChannel = conv.kind === 'channel';
        const isGroup = conv.kind === 'group';

        const groupTitle = conv.title || groupTitleFrom(others);
        const lastMsg = lastMessageByConv.get(conv.id);

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
          unreadCount: unreadByConv.get(conv.id) || 0,
        };
      });

    // Channel first, then DMs by most recent activity.
    conversations.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'channel' ? -1 : 1;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      return bTime - aTime;
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
