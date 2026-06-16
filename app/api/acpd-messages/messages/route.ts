import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { requireAcpd, sendMessagePush, notifyMentions, editMessage, groupTitleFrom } from '../../../../lib/acpdMessaging';

export const dynamic = 'force-dynamic';

const MAX_BODY_LENGTH = 4000;

async function isMember(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  conversationId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('acpd_conversation_members')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data);
}

// GET /api/acpd-messages/messages?conversationId=… — the full thread plus its
// participants. Marks the conversation read for the caller.
export async function GET(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  const conversationId = req.nextUrl.searchParams.get('conversationId');
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  if (!(await isMember(supabase, conversationId, profile.id))) {
    return NextResponse.json({ error: 'Not a member of this conversation' }, { status: 403 });
  }

  const [{ data: messages }, { data: members }, { data: convRow }] = await Promise.all([
    supabase
      .from('acpd_messages')
      .select('id, conversation_id, sender_id, body, created_at, edited_at, pinned_at, pinned_by, users:sender_id (id, name)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }),
    supabase
      .from('acpd_conversation_members')
      .select('user_id, last_read_at, muted, users:user_id (id, name, email)')
      .eq('conversation_id', conversationId),
    supabase
      .from('acpd_conversations')
      .select('id, kind, title, last_message_at')
      .eq('id', conversationId)
      .maybeSingle(),
  ]);

  // Snapshot the caller's mute + everyone's last-read (for read receipts) BEFORE
  // we advance the caller's own last_read_at below.
  const memberRows = (members || []) as any[];
  const myMuted = memberRows.find((m) => m.user_id === profile.id)?.muted ?? false;

  // The conversation's own summary so the thread can render even before it
  // appears in the sidebar overview (e.g. immediately after it's created).
  const others = memberRows.filter((m) => m.user_id !== profile.id).map((m) => m.users).filter(Boolean);
  const isChannel = convRow?.kind === 'channel';
  const isGroup = convRow?.kind === 'group';
  const convTitle = isChannel
    ? convRow?.title || 'ACPD Team'
    : isGroup
      ? convRow?.title || groupTitleFrom(others)
      : others[0]?.name || 'Direct message';
  const conversation = convRow
    ? {
        id: convRow.id,
        kind: convRow.kind,
        title: convTitle,
        otherUser: isChannel || isGroup ? null : others[0] || null,
        memberCount: others.length + 1,
        lastMessage: null,
        lastMessageAt: convRow.last_message_at,
        unreadCount: 0,
      }
    : null;

  // Reading the thread clears its unread state.
  await supabase
    .from('acpd_conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', profile.id);

  // Like (💚) counts per message + whether the caller liked it.
  const messageIds = ((messages || []) as any[]).map((m) => m.id);
  const likeByMessage = new Map<string, { count: number; mine: boolean }>();
  if (messageIds.length > 0) {
    const { data: reactions } = await supabase
      .from('acpd_message_reactions')
      .select('message_id, user_id')
      .in('message_id', messageIds);
    for (const r of (reactions || []) as { message_id: string; user_id: string }[]) {
      const cur = likeByMessage.get(r.message_id) || { count: 0, mine: false };
      cur.count += 1;
      if (r.user_id === profile.id) cur.mine = true;
      likeByMessage.set(r.message_id, cur);
    }
  }

  const shaped = ((messages || []) as any[]).map((m) => {
    const like = likeByMessage.get(m.id);
    return {
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      senderName: m.users?.name || 'Unknown',
      body: m.body,
      createdAt: m.created_at,
      editedAt: m.edited_at || null,
      pinnedAt: m.pinned_at || null,
      pinnedBy: m.pinned_by || null,
      likeCount: like?.count || 0,
      likedByMe: like?.mine || false,
    };
  });

  return NextResponse.json({
    conversation,
    messages: shaped,
    members: memberRows
      .map((m) => (m.users ? { ...m.users, lastReadAt: m.last_read_at } : null))
      .filter(Boolean),
    muted: myMuted,
  });
}

// DELETE /api/acpd-messages/messages?messageId=… — delete your own message.
export async function DELETE(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  const messageId = req.nextUrl.searchParams.get('messageId');
  if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: msg } = await supabase
    .from('acpd_messages')
    .select('id, sender_id')
    .eq('id', messageId)
    .maybeSingle();

  if (!msg) return NextResponse.json({ ok: true }); // already gone
  if (msg.sender_id !== profile.id) {
    return NextResponse.json({ error: 'You can only delete your own messages' }, { status: 403 });
  }

  const { error } = await supabase.from('acpd_messages').delete().eq('id', messageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// POST /api/acpd-messages/messages — send a message to a conversation.
export async function POST(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  let payload: { conversationId?: string; body?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const conversationId = payload.conversationId?.trim();
  const body = payload.body?.trim();
  if (!conversationId) return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
  if (!body) return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
  if (body.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  if (!(await isMember(supabase, conversationId, profile.id))) {
    return NextResponse.json({ error: 'Not a member of this conversation' }, { status: 403 });
  }

  const { data: conversation } = await supabase
    .from('acpd_conversations')
    .select('id, kind')
    .eq('id', conversationId)
    .single();
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const nowIso = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from('acpd_messages')
    .insert({ conversation_id: conversationId, sender_id: profile.id, body })
    .select('id, conversation_id, sender_id, body, created_at')
    .single();
  if (error || !inserted) {
    return NextResponse.json({ error: error?.message || 'Failed to send message' }, { status: 500 });
  }

  // Surface the conversation in everyone's list and mark it read for the sender.
  await Promise.all([
    supabase.from('acpd_conversations').update({ last_message_at: nowIso }).eq('id', conversationId),
    supabase
      .from('acpd_conversation_members')
      .update({ last_read_at: nowIso })
      .eq('conversation_id', conversationId)
      .eq('user_id', profile.id),
  ]);

  await Promise.all([
    sendMessagePush(supabase, {
      conversationId,
      senderId: profile.id,
      senderName: profile.name,
      body,
      isChannel: conversation.kind === 'channel',
    }),
    notifyMentions(supabase, {
      conversationId,
      senderId: profile.id,
      senderName: profile.name,
      body,
      isChannel: conversation.kind === 'channel',
    }),
  ]);

  return NextResponse.json({
    message: {
      id: inserted.id,
      conversationId: inserted.conversation_id,
      senderId: inserted.sender_id,
      senderName: profile.name,
      body: inserted.body,
      createdAt: inserted.created_at,
    },
  });
}

// PATCH /api/acpd-messages/messages — edit your own message.
export async function PATCH(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  let payload: { messageId?: string; body?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messageId = payload.messageId?.trim();
  const body = payload.body?.trim();
  if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
  if (!body) return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
  if (body.length > MAX_BODY_LENGTH) return NextResponse.json({ error: 'Message is too long' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  try {
    const updated = await editMessage(supabase, messageId, profile.id, body);
    if (!updated) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    return NextResponse.json({ message: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to edit message' },
      { status: 400 }
    );
  }
}
