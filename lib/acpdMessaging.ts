// Server-side helpers for ACPD team messaging. All mutations (sending a
// message, creating a DM, joining the team channel) run here through the
// service-role client so we can bump conversation activity and fan out Web
// Push to the other participants' devices.

import webpush from 'web-push';
import { NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from './server-supabase';

export type AcpdProfile = { id: string; name: string; email: string; role: string };

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

// 'ACPD' is the app's admin role (see AuthContext.isAdmin). users.role is a
// Postgres enum that has no 'admin' value, so never reference one in SQL.
const ACPD_ROLES = ['ACPD'];

/**
 * Resolve the signed-in user from the Authorization header and confirm they
 * are an ACPD/admin. Returns either the profile or a ready-to-send error
 * response, mirroring the requireRadiusUser pattern used elsewhere.
 */
export async function requireAcpd(
  request: Request
): Promise<{ profile: AcpdProfile; response: null } | { profile: null; response: NextResponse }> {
  const authUser = await getUserFromAuthHeader(request);
  if (!authUser) {
    return { profile: null, response: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  }

  const supabase = createServiceSupabaseClient();
  const { data: profile } = await supabase
    .from('users')
    .select('id, name, email, role')
    .eq('id', authUser.id)
    .single();

  if (!profile || !ACPD_ROLES.includes(profile.role)) {
    return { profile: null, response: NextResponse.json({ error: 'ACPD access required' }, { status: 403 }) };
  }

  return { profile: profile as AcpdProfile, response: null };
}

/** The single shared team channel, created by the migration. */
export async function getTeamChannelId(supabase: ServiceClient): Promise<string | null> {
  const { data } = await supabase
    .from('acpd_conversations')
    .select('id')
    .eq('kind', 'channel')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** Ensure a user has a membership row for a conversation (idempotent). */
export async function ensureMembership(supabase: ServiceClient, conversationId: string, userId: string) {
  await supabase
    .from('acpd_conversation_members')
    .upsert(
      { conversation_id: conversationId, user_id: userId },
      { onConflict: 'conversation_id,user_id', ignoreDuplicates: true }
    );
}

/**
 * Find (or create) the 1-on-1 DM conversation between two users. A DM is
 * uniquely identified by having exactly its two members, so we look for a
 * 'dm' conversation both users already belong to before creating a new one.
 */
export async function getOrCreateDm(
  supabase: ServiceClient,
  userA: string,
  userB: string
): Promise<string> {
  const { data: mine } = await supabase
    .from('acpd_conversation_members')
    .select('conversation_id, acpd_conversations!inner(kind)')
    .eq('user_id', userA)
    .eq('acpd_conversations.kind', 'dm');

  const candidateIds = (mine || []).map((row: { conversation_id: string }) => row.conversation_id);

  if (candidateIds.length > 0) {
    const { data: shared } = await supabase
      .from('acpd_conversation_members')
      .select('conversation_id')
      .eq('user_id', userB)
      .in('conversation_id', candidateIds)
      .limit(1)
      .maybeSingle();
    if (shared?.conversation_id) return shared.conversation_id;
  }

  const { data: created, error } = await supabase
    .from('acpd_conversations')
    .insert({ kind: 'dm', created_by: userA })
    .select('id')
    .single();
  if (error || !created) throw error || new Error('Failed to create conversation');

  await supabase.from('acpd_conversation_members').insert([
    { conversation_id: created.id, user_id: userA },
    { conversation_id: created.id, user_id: userB },
  ]);

  return created.id;
}

/**
 * Create a group conversation with the creator plus the given members. With
 * exactly one other member this is really a DM, so we reuse getOrCreateDm to
 * avoid duplicate 1-on-1 threads.
 */
export async function createGroup(
  supabase: ServiceClient,
  creatorId: string,
  memberIds: string[]
): Promise<string> {
  const others = Array.from(new Set(memberIds.filter((id) => id && id !== creatorId)));
  if (others.length === 0) throw new Error('Pick at least one person');
  if (others.length === 1) return getOrCreateDm(supabase, creatorId, others[0]);

  const { data: created, error } = await supabase
    .from('acpd_conversations')
    .insert({ kind: 'group', created_by: creatorId })
    .select('id')
    .single();
  if (error || !created) throw error || new Error('Failed to create group');

  const rows = [creatorId, ...others].map((uid) => ({ conversation_id: created.id, user_id: uid }));
  await supabase.from('acpd_conversation_members').insert(rows);

  return created.id;
}

/** Permanently delete a DM/group conversation (cascades messages, members,
 *  reactions). The shared team channel can't be deleted. */
export async function deleteConversation(supabase: ServiceClient, conversationId: string): Promise<void> {
  const { data: conv } = await supabase
    .from('acpd_conversations')
    .select('kind')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return;
  if (conv.kind === 'channel') throw new Error('The team channel cannot be deleted');
  await supabase.from('acpd_conversations').delete().eq('id', conversationId);
}

/** Toggle the caller's 💚 like on a message. Returns the resulting state. */
export async function toggleReaction(
  supabase: ServiceClient,
  messageId: string,
  userId: string
): Promise<{ liked: boolean }> {
  const { data: existing } = await supabase
    .from('acpd_message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', '💚')
    .maybeSingle();

  if (existing) {
    await supabase.from('acpd_message_reactions').delete().eq('id', existing.id);
    return { liked: false };
  }
  await supabase
    .from('acpd_message_reactions')
    .insert({ message_id: messageId, user_id: userId, emoji: '💚' });
  return { liked: true };
}

/** Whether a user belongs to a conversation. */
export async function isConversationMember(
  supabase: ServiceClient,
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

/** Edit your own message; stamps edited_at. */
export async function editMessage(
  supabase: ServiceClient,
  messageId: string,
  userId: string,
  body: string
): Promise<{ id: string; body: string; edited_at: string } | null> {
  const { data: msg } = await supabase
    .from('acpd_messages')
    .select('sender_id')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg) return null;
  if (msg.sender_id !== userId) throw new Error('You can only edit your own messages');

  const { data } = await supabase
    .from('acpd_messages')
    .update({ body, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select('id, body, edited_at')
    .single();
  return data as { id: string; body: string; edited_at: string };
}

/** Pin or unpin a message (any member of the conversation may pin). */
export async function setPin(
  supabase: ServiceClient,
  messageId: string,
  userId: string,
  pinned: boolean
): Promise<void> {
  const { data: msg } = await supabase
    .from('acpd_messages')
    .select('conversation_id')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg) throw new Error('Message not found');
  if (!(await isConversationMember(supabase, msg.conversation_id, userId))) {
    throw new Error('Not a member of this conversation');
  }
  await supabase
    .from('acpd_messages')
    .update(pinned ? { pinned_at: new Date().toISOString(), pinned_by: userId } : { pinned_at: null, pinned_by: null })
    .eq('id', messageId);
}

/** Mute or unmute a conversation for a member (silences message push; an
 *  @mention still pushes). */
export async function setMute(
  supabase: ServiceClient,
  conversationId: string,
  userId: string,
  muted: boolean
): Promise<void> {
  await supabase
    .from('acpd_conversation_members')
    .update({ muted })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
}

/**
 * Create 'mention' inbox notifications (which also push, bypassing conversation
 * mute) for any conversation members named with @first or @full name in the body.
 */
export async function notifyMentions(
  supabase: ServiceClient,
  opts: {
    conversationId: string;
    senderId: string;
    senderName: string;
    body: string;
    isChannel: boolean;
  }
): Promise<void> {
  if (!opts.body.includes('@')) return;

  const { data: members } = await supabase
    .from('acpd_conversation_members')
    .select('user_id, users:user_id (id, name)')
    .eq('conversation_id', opts.conversationId)
    .neq('user_id', opts.senderId);

  const lower = opts.body.toLowerCase();
  const title = opts.isChannel
    ? `${opts.senderName} mentioned you in ACPD Team`
    : `${opts.senderName} mentioned you`;
  const preview = opts.body.length > 140 ? `${opts.body.slice(0, 139)}…` : opts.body;

  for (const row of (members || []) as any[]) {
    const u = row.users;
    if (!u?.id || !u?.name) continue;
    const full = String(u.name).toLowerCase();
    const first = full.split(/\s+/)[0];
    if (!(lower.includes(`@${full}`) || (first && lower.includes(`@${first}`)))) continue;

    await supabase.rpc('create_notification', {
      p_user_id: u.id,
      p_type: 'mention',
      p_title: title,
      p_body: preview,
      p_link: '/messages',
      p_actor_id: opts.senderId,
      p_entity_type: 'conversation',
      p_entity_id: opts.conversationId,
    });
  }
}

function configureWebPush(): boolean {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT || process.env.NEXT_PUBLIC_APP_URL || 'mailto:admin@example.com';
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/**
 * Notify every member of a conversation (except the sender) about a new
 * message via Web Push. Best-effort — delivery failures are swallowed so they
 * never block the send.
 */
export async function sendMessagePush(
  supabase: ServiceClient,
  opts: {
    conversationId: string;
    senderId: string;
    senderName: string;
    body: string;
    isChannel: boolean;
  }
): Promise<void> {
  if (!configureWebPush()) return;

  // Skip members who muted this conversation — an @mention still reaches them
  // separately via its own 'mention' notification.
  const { data: members } = await supabase
    .from('acpd_conversation_members')
    .select('user_id')
    .eq('conversation_id', opts.conversationId)
    .neq('user_id', opts.senderId)
    .eq('muted', false);

  const recipientIds = (members || []).map((m: { user_id: string }) => m.user_id);
  if (recipientIds.length === 0) return;

  const { data: subs } = await supabase
    .from('user_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', recipientIds)
    .eq('enabled', true);

  if (!subs || subs.length === 0) return;

  const title = opts.isChannel ? `ACPD Team · ${opts.senderName}` : opts.senderName;
  const preview = opts.body.length > 140 ? `${opts.body.slice(0, 139)}…` : opts.body;
  const payload = JSON.stringify({
    title,
    body: preview,
    url: '/messages',
    tag: `acpd-conversation-${opts.conversationId}`,
    icon: '/apple-touch-icon.png',
  });

  await Promise.all(
    subs.map(async (sub: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60, urgency: 'high' }
        );
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await supabase
            .from('user_push_subscriptions')
            .update({ enabled: false, disabled_at: new Date().toISOString() })
            .eq('id', sub.id);
        }
      }
    })
  );
}
