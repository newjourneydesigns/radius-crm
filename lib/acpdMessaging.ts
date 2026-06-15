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

  const { data: members } = await supabase
    .from('acpd_conversation_members')
    .select('user_id')
    .eq('conversation_id', opts.conversationId)
    .neq('user_id', opts.senderId);

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
