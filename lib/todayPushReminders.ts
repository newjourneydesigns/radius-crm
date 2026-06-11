// Server-side engine for RADIUS user push reminders. Runs from the
// /api/today/push-reminders cron route every 5 minutes and notifies users
// ~10 minutes before each timed item on their Today timeline: board cards
// with a due time and follow-ups with a follow-up time.

import webpush from 'web-push';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from './server-supabase';

const TZ = 'America/Chicago';
const LEAD_MINUTES = 10;     // notify this many minutes before the item
const GRACE_MINUTES = 10;    // still notify if a cron run was missed
const PUSH_TTL_SECONDS = 60 * 60; // reminders are stale after an hour
const DELIVERY_LOG_RETENTION_DAYS = 14;

type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count?: number | null;
};

type ReminderPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  icon?: string;
};

type TimedItem = {
  itemKey: string;
  dueAt: DateTime;
  payload: ReminderPayload;
};

function configureWebPush(): boolean {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT || process.env.NEXT_PUBLIC_APP_URL || 'mailto:admin@example.com';
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function formatTime(dt: DateTime): string {
  return dt.toFormat(dt.minute === 0 ? 'h a' : 'h:mm a');
}

function parseDueAt(date: string, time: string): DateTime | null {
  const normalized = time.length === 5 ? `${time}:00` : time;
  const dt = DateTime.fromISO(`${date}T${normalized}`, { zone: TZ });
  return dt.isValid ? dt : null;
}

async function markSubscriptionFailure(sub: SubscriptionRow, status?: number) {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const expired = status === 404 || status === 410;
  const failures = Number(sub.failure_count || 0) + 1;
  await supabase
    .from('user_push_subscriptions')
    .update({
      enabled: !(expired || failures >= 5),
      disabled_at: expired || failures >= 5 ? now : null,
      last_failed_delivery_at: now,
      failure_count: failures,
      updated_at: now,
    })
    .eq('id', sub.id);
}

async function markSubscriptionSuccess(sub: SubscriptionRow) {
  const now = new Date().toISOString();
  await createServiceSupabaseClient()
    .from('user_push_subscriptions')
    .update({ last_successful_delivery_at: now, failure_count: 0, updated_at: now })
    .eq('id', sub.id);
}

async function sendToSubscription(sub: SubscriptionRow, payload: ReminderPayload) {
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { TTL: PUSH_TTL_SECONDS, urgency: 'high', contentEncoding: 'aes128gcm' }
  );
}

/** Collect a user's timed items whose reminder moment falls in the current window. */
async function collectDueItems(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  user: { id: string; name: string },
  now: DateTime,
  today: string
): Promise<TimedItem[]> {
  const items: TimedItem[] = [];

  const inWindow = (dueAt: DateTime) => {
    const fireAt = dueAt.minus({ minutes: LEAD_MINUTES });
    return now >= fireAt && now <= dueAt.plus({ minutes: GRACE_MINUTES });
  };

  // ── Board cards: user's own boards + cards assigned to them ──
  const [{ data: boardsRaw }, { data: assignmentsRaw }] = await Promise.all([
    supabase.from('project_boards').select('id, title').eq('user_id', user.id),
    supabase.from('card_assignments').select('card_id').eq('user_id', user.id),
  ]);
  const boards = (boardsRaw || []) as { id: string; title: string }[];
  const boardMap = new Map(boards.map(b => [b.id, b.title]));
  const boardIds = boards.map(b => b.id);
  const assignedIds = ((assignmentsRaw || []) as { card_id: string }[]).map(a => a.card_id);

  type CardRow = { id: string; title: string; due_date: string; due_time: string; board_id: string | null };
  const cardSelect = 'id, title, due_date, due_time, board_id';
  const [ownedCards, assignedCards] = await Promise.all([
    boardIds.length > 0
      ? supabase.from('board_cards').select(cardSelect)
          .in('board_id', boardIds).eq('is_complete', false)
          .eq('due_date', today).not('due_time', 'is', null)
      : Promise.resolve({ data: [] as CardRow[] }),
    assignedIds.length > 0
      ? supabase.from('board_cards').select(cardSelect)
          .in('id', assignedIds).eq('is_complete', false)
          .eq('due_date', today).not('due_time', 'is', null)
      : Promise.resolve({ data: [] as CardRow[] }),
  ]);

  const cardRows = new Map<string, CardRow>();
  for (const c of [(ownedCards.data || []), (assignedCards.data || [])].flat() as CardRow[]) {
    cardRows.set(c.id, c);
  }

  for (const card of Array.from(cardRows.values())) {
    const dueAt = parseDueAt(card.due_date, card.due_time);
    if (!dueAt || !inWindow(dueAt)) continue;
    items.push({
      itemKey: `card:${card.id}:${today}`,
      dueAt,
      payload: {
        title: card.title,
        body: `Due at ${formatTime(dueAt)}${boardMap.has(card.board_id || '') ? ` · ${boardMap.get(card.board_id || '')}` : ''}`,
        url: '/today',
        tag: `today-card-${card.id}`,
        icon: '/apple-touch-icon.png',
      },
    });
  }

  // ── Follow-ups with times for this user's leaders ──
  const { data: followUpsRaw } = await supabase
    .from('circle_leaders')
    .select('id, name, campus, follow_up_date, follow_up_time')
    .eq('acpd', user.name)
    .eq('follow_up_required', true)
    .eq('follow_up_date', today)
    .not('follow_up_time', 'is', null);

  for (const f of (followUpsRaw || []) as { id: number; name: string; campus?: string | null; follow_up_date: string; follow_up_time: string }[]) {
    const dueAt = parseDueAt(f.follow_up_date, f.follow_up_time);
    if (!dueAt || !inWindow(dueAt)) continue;
    items.push({
      itemKey: `followup:${f.id}:${today}`,
      dueAt,
      payload: {
        title: `Follow up · ${f.name}`,
        body: `At ${formatTime(dueAt)}${f.campus ? ` · ${f.campus}` : ''}`,
        url: '/today',
        tag: `today-fu-${f.id}`,
        icon: '/apple-touch-icon.png',
      },
    });
  }

  return items;
}

export type ReminderRunResult = {
  usersChecked: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export async function runUserTimedReminders(): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { usersChecked: 0, sent: 0, skipped: 0, failed: 0, errors: [] };
  if (!configureWebPush()) {
    result.errors.push('Missing Web Push VAPID keys');
    return result;
  }

  const supabase = createServiceSupabaseClient();
  const now = DateTime.now().setZone(TZ);
  const today = now.toISODate() as string;

  // Users with at least one active device subscription
  const { data: subsRaw, error: subsError } = await supabase
    .from('user_push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, failure_count')
    .eq('enabled', true);
  if (subsError) {
    result.errors.push(subsError.message);
    return result;
  }

  const subs = (subsRaw || []) as SubscriptionRow[];
  if (subs.length === 0) return result;

  const subsByUser = new Map<string, SubscriptionRow[]>();
  for (const sub of subs) {
    const list = subsByUser.get(sub.user_id) || [];
    list.push(sub);
    subsByUser.set(sub.user_id, list);
  }

  const userIds = Array.from(subsByUser.keys());
  const { data: usersRaw } = await supabase
    .from('users')
    .select('id, name')
    .in('id', userIds);
  const users = (usersRaw || []) as { id: string; name: string }[];

  for (const user of users) {
    result.usersChecked += 1;
    try {
      const items = await collectDueItems(supabase, user, now, today);
      for (const item of items) {
        // Claim the delivery first — the unique (user_id, item_key) constraint
        // makes this run-once even across overlapping cron invocations.
        const { data: delivery, error: claimError } = await supabase
          .from('user_reminder_deliveries')
          .insert({ user_id: user.id, item_key: item.itemKey, delivery_status: 'pending' })
          .select('id')
          .single();
        if (claimError) {
          if (claimError.code === '23505') { result.skipped += 1; continue; }
          throw claimError;
        }

        let sent = 0;
        const sendErrors: string[] = [];
        for (const sub of subsByUser.get(user.id) || []) {
          try {
            await sendToSubscription(sub, item.payload);
            await markSubscriptionSuccess(sub);
            sent += 1;
          } catch (e) {
            const status = (e as { statusCode?: number })?.statusCode;
            sendErrors.push(`${status || 'error'}`);
            await markSubscriptionFailure(sub, status);
          }
        }

        await supabase
          .from('user_reminder_deliveries')
          .update({
            delivery_status: sent > 0 ? 'sent' : 'failed',
            error_message: sendErrors.length ? sendErrors.join('; ').slice(0, 500) : null,
            sent_at: sent > 0 ? new Date().toISOString() : null,
          })
          .eq('id', delivery.id);

        if (sent > 0) result.sent += 1;
        else result.failed += 1;
      }
    } catch (e) {
      result.errors.push(`user ${user.id}: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  // Trim the delivery log so it doesn't grow forever
  await supabase
    .from('user_reminder_deliveries')
    .delete()
    .lt('created_at', now.minus({ days: DELIVERY_LOG_RETENTION_DAYS }).toISO());

  return result;
}
