// Server-side fan-out of Web Push for inbox notifications.
//
// Two entry points, same core:
//   • By id — fired instantly by a Supabase Database Webhook on INSERT into
//     notifications (the snappy path).
//   • Scan — fired by the dispatch-push cron as a backstop, in case a webhook
//     ever fails to deliver.
//
// Both "claim" rows with a conditional UPDATE (push_sent_at IS NULL → now())
// before sending, so the webhook and the cron can never double-send the same
// row. Team messages are skipped here — they push instantly from the message
// API and are stamped push_sent_at at insert time.

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

type SupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

// Push a set of already-claimed rows to their recipients' devices.
async function sendForRows(supabase: SupabaseClient, rows: PendingRow[]): Promise<number> {
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));

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
  for (const n of rows) {
    for (const sub of subsByUser.get(n.user_id) || []) {
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
  return sent;
}

const SELECT = 'id, user_id, type, title, body, link';

export async function dispatchPendingNotificationPush(
  opts: { id?: string } = {}
): Promise<{ pending: number; sent: number; configured: boolean }> {
  // Bail before claiming anything if push isn't configured, so rows stay
  // pending and a later run can deliver them once the keys are set.
  if (!configureWebPush()) return { pending: 0, sent: 0, configured: false };

  const supabase = createServiceSupabaseClient();
  const nowIso = new Date().toISOString();
  let claimed: PendingRow[];

  if (opts.id) {
    // Webhook path: claim the single inserted row (if still unpushed + not a message).
    const { data } = await supabase
      .from('notifications')
      .update({ push_sent_at: nowIso })
      .eq('id', opts.id)
      .is('push_sent_at', null)
      .neq('type', 'message')
      .select(SELECT);
    claimed = (data || []) as PendingRow[];
  } else {
    // Backstop path: find unpushed candidates, then claim them atomically.
    const { data: cand } = await supabase
      .from('notifications')
      .select('id')
      .is('push_sent_at', null)
      .neq('type', 'message')
      .order('created_at', { ascending: true })
      .limit(200);
    const ids = (cand || []).map((c) => (c as { id: string }).id);
    if (ids.length === 0) return { pending: 0, sent: 0, configured: true };
    const { data } = await supabase
      .from('notifications')
      .update({ push_sent_at: nowIso })
      .in('id', ids)
      .is('push_sent_at', null)
      .select(SELECT);
    claimed = (data || []) as PendingRow[];
  }

  if (claimed.length === 0) return { pending: 0, sent: 0, configured: true };
  const sent = await sendForRows(supabase, claimed);
  return { pending: claimed.length, sent, configured: true };
}
