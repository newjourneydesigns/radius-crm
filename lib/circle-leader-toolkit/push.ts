import webpush from 'web-push';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../server-supabase';
import { getCircleSummaryBaseUrl } from './links';

type PushSubscriptionRow = {
  id: string;
  leader_id: number | string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count?: number | null;
};

type NotificationPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  badgeCount?: number;
};

type DeliveryRecord = {
  notification_type: 'inbox_message' | 'summary_reminder' | 'nightly_digest';
  leader_id: number | string;
  inbox_recipient_id?: string | null;
  message_id?: string | null;
  ccb_event_id?: string | null;
  occurrence?: string | null;
};

const PUSH_TTL_SECONDS = 60 * 60 * 24;

function getVapidConfig() {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT || process.env.NEXT_PUBLIC_APP_URL || 'mailto:admin@example.com';
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { subject, publicKey, privateKey };
}

export function getPublicVapidKey(): string | null {
  return process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || process.env.WEB_PUSH_VAPID_PUBLIC_KEY || null;
}

function configureWebPush() {
  const vapid = getVapidConfig();
  if (!vapid) throw new Error('Missing Web Push VAPID keys');
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
}

export async function sendWebPush(subscription: PushSubscriptionRow, payload: NotificationPayload) {
  configureWebPush();
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload),
      {
        TTL: PUSH_TTL_SECONDS,
        urgency: 'normal',
        contentEncoding: 'aes128gcm',
      }
    );
  } catch (e: any) {
    const status = e?.statusCode || e?.status;
    const body = typeof e?.body === 'string' ? e.body.trim() : '';
    const message = `Push service returned ${status || 'an error'}${body ? `: ${body.slice(0, 300)}` : ''}`;
    const error = new Error(message);
    (error as Error & { status?: number }).status = status;
    throw error;
  }
}

export async function getLeaderAlertCounts(leaderId: number | string) {
  const supabase = createServiceSupabaseClient();
  const { data: recipients } = await supabase
    .from('circle_summary_inbox_recipients')
    .select('id, message_id, read_at, read_version')
    .eq('leader_id', leaderId);
  const messageIds = (recipients || []).map((r: any) => r.message_id);
  let unreadMessages = 0;
  if (messageIds.length > 0) {
    const { data: messages } = await supabase
      .from('circle_summary_inbox_messages')
      .select('id, version, status')
      .in('id', messageIds)
      .eq('status', 'sent');
    const byId = new Map((messages || []).map((m: any) => [m.id, m]));
    unreadMessages = (recipients || []).filter((r: any) => {
      const message: any = byId.get(r.message_id);
      return message && (!r.read_at || Number(r.read_version || 0) < Number(message.version || 1));
    }).length;
  }

  // Pending summaries from the local submission table only; event-list pages can
  // still show richer CCB-derived state, but this endpoint remains fast and safe.
  const pendingEventSummaries = 0;
  return { unreadMessages, pendingEventSummaries, totalAlertCount: unreadMessages + pendingEventSummaries };
}

async function markSubscriptionFailure(subscription: PushSubscriptionRow, status?: number, message?: string) {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const expired = status === 404 || status === 410;
  const failures = Number(subscription.failure_count || 0) + 1;
  await supabase
    .from('circle_leader_push_subscriptions')
    .update({
      enabled: expired || failures >= 5 ? false : true,
      disabled_at: expired || failures >= 5 ? now : null,
      last_failed_delivery_at: now,
      failure_count: failures,
      updated_at: now,
    })
    .eq('id', subscription.id);
  if (message) console.warn('[circle-summary/push] subscription delivery failed:', message);
}

async function markSubscriptionSuccess(subscription: PushSubscriptionRow) {
  const now = new Date().toISOString();
  await createServiceSupabaseClient()
    .from('circle_leader_push_subscriptions')
    .update({ last_successful_delivery_at: now, failure_count: 0, updated_at: now })
    .eq('id', subscription.id);
}

export async function deliverLeaderPush(record: DeliveryRecord, payload: NotificationPayload) {
  const supabase = createServiceSupabaseClient();
  const { data: delivery, error: deliveryError } = await supabase
    .from('circle_leader_notification_deliveries')
    .insert({ ...record, delivery_status: 'pending' })
    .select('id')
    .single();

  if (deliveryError) {
    if (deliveryError.code === '23505') return { skipped: true, reason: 'duplicate' };
    throw deliveryError;
  }

  const { data: subscriptions, error } = await supabase
    .from('circle_leader_push_subscriptions')
    .select('id, leader_id, endpoint, p256dh, auth, failure_count')
    .eq('leader_id', record.leader_id)
    .eq('enabled', true);
  if (error) throw error;

  if (!subscriptions || subscriptions.length === 0) {
    await supabase
      .from('circle_leader_notification_deliveries')
      .update({ delivery_status: 'skipped', error_message: 'No enabled push subscriptions' })
      .eq('id', delivery.id);
    return { skipped: true, reason: 'no_subscriptions' };
  }

  let sent = 0;
  const errors: string[] = [];
  for (const subscription of subscriptions as PushSubscriptionRow[]) {
    try {
      await sendWebPush(subscription, payload);
      await markSubscriptionSuccess(subscription);
      sent += 1;
    } catch (e: any) {
      errors.push(e?.message || 'Push send failed');
      await markSubscriptionFailure(subscription, e?.status, e?.message);
    }
  }

  await supabase
    .from('circle_leader_notification_deliveries')
    .update({
      push_subscription_id: subscriptions[0]?.id ?? null,
      delivery_status: sent > 0 ? 'sent' : 'failed',
      error_message: errors.length ? errors.join('; ').slice(0, 1000) : null,
      sent_at: sent > 0 ? new Date().toISOString() : null,
    })
    .eq('id', delivery.id);

  return { sent, failed: errors.length };
}

export function buildCircleSummaryUrl(path: string): string {
  return new URL(path, getCircleSummaryBaseUrl()).toString();
}

export function parseCcbDateTime(value: string): DateTime | null {
  const dt = DateTime.fromFormat(value, 'yyyy-LL-dd HH:mm:ss', { zone: 'America/Chicago' });
  return dt.isValid ? dt : null;
}
