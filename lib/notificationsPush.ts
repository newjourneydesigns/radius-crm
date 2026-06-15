// Server-side fan-out of Web Push for inbox notifications. Run from the
// /api/notifications/dispatch-push cron route every minute: it finds rows that
// haven't been pushed yet (excluding team messages, which push instantly from
// the message API), sends a push to each recipient's devices, and stamps
// push_sent_at so they're never re-sent.

import webpush from 'web-push';
import { createServiceSupabaseClient } from './server-supabase';

type PendingRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
};

type SubRow = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

function configureWebPush(): boolean {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT || process.env.NEXT_PUBLIC_APP_URL || 'mailto:admin@example.com';
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function dispatchPendingNotificationPush(): Promise<{
  pending: number;
  sent: number;
  configured: boolean;
}> {
  const supabase = createServiceSupabaseClient();

  const { data: pendingRaw } = await supabase
    .from('notifications')
    .select('id, user_id, type, title, body, link')
    .is('push_sent_at', null)
    .neq('type', 'message')
    .order('created_at', { ascending: true })
    .limit(200);

  const pending = (pendingRaw || []) as PendingRow[];
  if (pending.length === 0) return { pending: 0, sent: 0, configured: true };

  // No VAPID keys → mark handled so we don't spin, but report not-configured.
  if (!configureWebPush()) {
    await supabase
      .from('notifications')
      .update({ push_sent_at: new Date().toISOString() })
      .in('id', pending.map((p) => p.id));
    return { pending: pending.length, sent: 0, configured: false };
  }

  const userIds = Array.from(new Set(pending.map((p) => p.user_id)));

  // Devices per user.
  const { data: subsRaw } = await supabase
    .from('user_push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)
    .eq('enabled', true);
  const subsByUser = new Map<string, SubRow[]>();
  for (const s of (subsRaw || []) as SubRow[]) {
    const list = subsByUser.get(s.user_id) || [];
    list.push(s);
    subsByUser.set(s.user_id, list);
  }

  // Unread inbox count per user, for the app-icon badge.
  const badgeByUser = new Map<string, number>();
  await Promise.all(
    userIds.map(async (uid) => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .is('read_at', null)
        .is('archived_at', null);
      badgeByUser.set(uid, count || 0);
    })
  );

  let sent = 0;
  for (const n of pending) {
    const subs = subsByUser.get(n.user_id) || [];
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: n.title,
            body: n.body || '',
            url: n.link || '/inbox',
            tag: `inbox-${n.id}`,
            icon: '/apple-touch-icon.png',
            badgeCount: badgeByUser.get(n.user_id) || 0,
          }),
          { TTL: 60 * 60, urgency: 'normal' }
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await supabase
            .from('user_push_subscriptions')
            .update({ enabled: false, disabled_at: new Date().toISOString() })
            .eq('id', sub.id);
        }
      }
    }
  }

  // Mark every pending row handled, whether or not the user had a device.
  await supabase
    .from('notifications')
    .update({ push_sent_at: new Date().toISOString() })
    .in('id', pending.map((p) => p.id));

  return { pending: pending.length, sent, configured: true };
}
