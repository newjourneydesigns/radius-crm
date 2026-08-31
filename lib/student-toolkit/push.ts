/**
 * Web Push for the Student Leader Toolkit.
 *
 * Forked from lib/circle-leader-toolkit/push.ts over the `student_*` tables.
 * The two genuinely table-agnostic pieces — `sendWebPush` (takes a subscription
 * row) and `getPublicVapidKey` (reads env) — are imported and re-exported
 * rather than copied, so there is one VAPID configuration in the app.
 *
 * Everything else is student-specific: the subscription/preference/delivery
 * tables FK to `student_leaders`, and the deep link has to land on the Student
 * Toolkit host. A notification that opens the Circle Leader Toolkit is worse
 * than no notification at all.
 */

import { createServiceSupabaseClient } from '../server-supabase';
import { getStudentToolkitBaseUrl } from './links';
import { studentToolkitLeaderPath } from './paths';
import { getPublicVapidKey, sendWebPush } from '../circle-leader-toolkit/push';

export { getPublicVapidKey, sendWebPush };

export type StudentPushSubscriptionRow = {
  id: number | string;
  student_leader_id: number | string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count?: number | null;
};

export type StudentNotificationPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  badgeCount?: number;
};

export type StudentNotificationType = 'inbox_message' | 'roster_absence';

export type StudentDeliveryRecord = {
  notification_type: StudentNotificationType;
  student_leader_id: number | string;
  inbox_recipient_id?: number | string | null;
  message_id?: string | null;
};

/**
 * A push service that has rejected this endpoint repeatedly is not coming back
 * — the subscription is retired so every later send skips it instead of
 * re-failing. 404/410 means the browser already dropped it, so retire at once.
 */
const MAX_CONSECUTIVE_FAILURES = 5;

/** Absolute URL on the Student Toolkit host. */
export function buildStudentToolkitUrl(path: string): string {
  return new URL(path, getStudentToolkitBaseUrl()).toString();
}

/** Deep link to a student leader's own inbox, trailing slash included. */
export function studentInboxUrl(studentLeaderId: number | string): string {
  return buildStudentToolkitUrl(`${studentToolkitLeaderPath(studentLeaderId, 'inbox')}/`);
}

/**
 * `sendWebPush` is typed for the circle subscription row. It only ever reads
 * `endpoint`, `p256dh` and `auth`, so adapt the student row's shape rather than
 * forking a second copy of the VAPID send path.
 */
function toSendableSubscription(subscription: StudentPushSubscriptionRow) {
  return {
    id: String(subscription.id),
    leader_id: subscription.student_leader_id,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    auth: subscription.auth,
    failure_count: subscription.failure_count ?? 0,
  };
}

/** Unread inbox count for the tab dot and the app badge. */
export async function getStudentAlertCounts(studentLeaderId: number | string) {
  const supabase = createServiceSupabaseClient();
  const { data: recipients } = await supabase
    .from('student_inbox_recipients')
    .select('id, message_id, read_at, read_version')
    .eq('student_leader_id', studentLeaderId);

  const messageIds = (recipients || []).map((row: any) => row.message_id);
  let unreadMessages = 0;

  if (messageIds.length > 0) {
    // Only messages that are actually sent count — an unsent or still-scheduled
    // message must never light up the dot.
    const { data: messages } = await supabase
      .from('circle_summary_inbox_messages')
      .select('id, version, status')
      .in('id', messageIds)
      .eq('status', 'sent');
    const byId = new Map((messages || []).map((message: any) => [message.id, message]));
    unreadMessages = (recipients || []).filter((row: any) => {
      const message: any = byId.get(row.message_id);
      // An edited message bumps its version, which makes an already-read row
      // unread again — that is how staff re-surface a correction.
      return message && (!row.read_at || Number(row.read_version || 0) < Number(message.version || 1));
    }).length;
  }

  return { unreadMessages, totalAlertCount: unreadMessages };
}

async function markSubscriptionFailure(
  subscription: StudentPushSubscriptionRow,
  status?: number,
  message?: string
) {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const expired = status === 404 || status === 410;
  const failures = Number(subscription.failure_count || 0) + 1;
  const retire = expired || failures >= MAX_CONSECUTIVE_FAILURES;

  await supabase
    .from('student_push_subscriptions')
    .update({
      enabled: !retire,
      disabled_at: retire ? now : null,
      last_failed_delivery_at: now,
      failure_count: failures,
    })
    .eq('id', subscription.id);

  if (message) console.warn('[student-toolkit/push] delivery failed:', message);
}

async function markSubscriptionSuccess(subscription: StudentPushSubscriptionRow) {
  await createServiceSupabaseClient()
    .from('student_push_subscriptions')
    .update({
      last_successful_delivery_at: new Date().toISOString(),
      failure_count: 0,
    })
    .eq('id', subscription.id);
}

/**
 * Send one notification to every device a student leader has enabled, and log
 * the attempt.
 *
 * The delivery row is written first: a unique index on `inbox_recipient_id`
 * turns a retry into a 23505 and returns `skipped`, so a re-run of the send
 * path can never double-notify.
 */
export async function deliverStudentPush(
  record: StudentDeliveryRecord,
  payload: StudentNotificationPayload
) {
  const supabase = createServiceSupabaseClient();
  const { data: delivery, error: deliveryError } = await supabase
    .from('student_notification_deliveries')
    .insert({ ...record, delivery_status: 'pending' })
    .select('id')
    .single();

  if (deliveryError) {
    if (deliveryError.code === '23505') return { skipped: true, reason: 'duplicate' };
    throw deliveryError;
  }

  const { data: subscriptions, error } = await supabase
    .from('student_push_subscriptions')
    .select('id, student_leader_id, endpoint, p256dh, auth, failure_count')
    .eq('student_leader_id', record.student_leader_id)
    .eq('enabled', true);
  if (error) throw error;

  if (!subscriptions || subscriptions.length === 0) {
    await supabase
      .from('student_notification_deliveries')
      .update({ delivery_status: 'skipped', error_message: 'No enabled push subscriptions' })
      .eq('id', delivery.id);
    return { skipped: true, reason: 'no_subscriptions' };
  }

  let sent = 0;
  const errors: string[] = [];
  for (const subscription of subscriptions as StudentPushSubscriptionRow[]) {
    try {
      await sendWebPush(toSendableSubscription(subscription), payload);
      await markSubscriptionSuccess(subscription);
      sent += 1;
    } catch (e: any) {
      errors.push(e?.message || 'Push send failed');
      await markSubscriptionFailure(subscription, e?.status, e?.message);
    }
  }

  await supabase
    .from('student_notification_deliveries')
    .update({
      push_subscription_id: subscriptions[0]?.id ?? null,
      delivery_status: sent > 0 ? 'sent' : 'failed',
      error_message: errors.length ? errors.join('; ').slice(0, 1000) : null,
      sent_at: new Date().toISOString(),
    })
    .eq('id', delivery.id);

  return { sent, failed: errors.length };
}
