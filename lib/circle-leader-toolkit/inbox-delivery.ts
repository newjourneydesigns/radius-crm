/**
 * Shared delivery helpers for Circle Summary inbox messages.
 *
 * Used by the admin send/edit route (immediate send, send-now, resend) and by
 * the scheduled-delivery cron route. "Delivering" a message means resolving the
 * current set of eligible target leaders, (re)writing per-leader recipient rows,
 * and firing push notifications. Recipient resolution happens at delivery time so
 * group/campus/ACPD membership is always correct as of send.
 */

import { createServiceSupabaseClient } from '../server-supabase';
import { buildCircleSummaryUrl, deliverLeaderPush } from './push';

export type TargetType = 'all' | 'campus' | 'acpd' | 'leader';

export type LeaderTarget = {
  id: number | string;
  name: string;
  campus: string | null;
  acpd: string | null;
  ccb_group_id: string | number | null;
  status: string | null;
  circle_summary_access_enabled?: boolean | null;
};

const INELIGIBLE_STATUSES = new Set(['archive', 'archived']);

export function isEligibleLeader(leader: LeaderTarget): boolean {
  const status = (leader.status || '').trim().toLowerCase();
  if (INELIGIBLE_STATUSES.has(status)) return false;
  if (leader.circle_summary_access_enabled === false) return false;
  return true;
}

export function parseLeaderTargetIds(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function loadTargetLeaders(targetType: TargetType, targetValue: string | null) {
  const supabase = createServiceSupabaseClient();
  let query = supabase
    .from('circle_leaders')
    .select('id, name, campus, acpd, ccb_group_id, status, circle_summary_access_enabled')
    .order('name');

  if (targetType === 'campus') {
    if (!targetValue) return [];
    query = query.eq('campus', targetValue);
  } else if (targetType === 'acpd') {
    if (!targetValue) return [];
    query = query.eq('acpd', targetValue);
  } else if (targetType === 'leader') {
    const ids = parseLeaderTargetIds(targetValue);
    if (ids.length === 0) return [];
    query = query.in('id', ids);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data || []) as LeaderTarget[]).filter(isEligibleLeader);
}

export async function insertRevision({
  messageId,
  version,
  title,
  bodyHtml,
  editedBy,
}: {
  messageId: string;
  version: number;
  title: string;
  bodyHtml: string;
  editedBy: string;
}) {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from('circle_summary_inbox_message_revisions')
    .insert({
      message_id: messageId,
      version,
      title,
      body_html: bodyHtml,
      edited_by: editedBy,
    });
  if (error) throw error;
}

async function sendInboxPushes(
  message: { id: string; title: string },
  recipients: Array<{ id: string; leader_id: number | string }>,
  leadersById: Map<string, LeaderTarget>
) {
  const supabase = createServiceSupabaseClient();
  const leaderIds = recipients.map((recipient) => recipient.leader_id);
  if (leaderIds.length === 0) return;

  const { data: prefs } = await supabase
    .from('circle_leader_notification_preferences')
    .select('leader_id, inbox_push_enabled')
    .in('leader_id', leaderIds)
    .eq('inbox_push_enabled', true);
  const enabledLeaderIds = new Set((prefs || []).map((pref: any) => String(pref.leader_id)));

  await Promise.all(
    recipients
      .filter((recipient) => enabledLeaderIds.has(String(recipient.leader_id)))
      .map((recipient) => {
        const leader = leadersById.get(String(recipient.leader_id));
        const groupId = leader?.ccb_group_id ? String(leader.ccb_group_id) : 'events';
        return deliverLeaderPush(
          {
            notification_type: 'inbox_message',
            leader_id: recipient.leader_id,
            inbox_recipient_id: recipient.id,
            message_id: message.id,
          },
          {
            title: 'New message in Circle Leader Toolkit',
            body: `You have a new message: ${message.title}`,
            url: buildCircleSummaryUrl(`/circle-leader-toolkit/${encodeURIComponent(groupId)}/inbox`),
            tag: `circle-inbox-${recipient.id}`,
          }
        ).catch((error) => {
          console.warn('[circle-summary-inbox] push failed:', error?.message || error);
        });
      })
  );
}

async function replaceRecipients(messageId: string, leaders: LeaderTarget[]) {
  const supabase = createServiceSupabaseClient();
  const { error: deleteError } = await supabase
    .from('circle_summary_inbox_recipients')
    .delete()
    .eq('message_id', messageId);
  if (deleteError) throw deleteError;

  if (leaders.length === 0) return;

  const recipientRows = leaders.map((leader) => ({
    message_id: messageId,
    leader_id: leader.id,
  }));
  const { error: recipientError } = await supabase
    .from('circle_summary_inbox_recipients')
    .insert(recipientRows);
  if (recipientError) throw recipientError;
}

/**
 * Delivers a message to a resolved set of leaders: replaces its recipient rows
 * and fires inbox pushes for leaders who have inbox push enabled. Idempotent —
 * safe for first send, resend, send-now, and scheduled delivery.
 */
export async function deliverToLeaders(
  message: { id: string; title: string },
  leaders: LeaderTarget[]
) {
  const supabase = createServiceSupabaseClient();
  await replaceRecipients(message.id, leaders);

  if (leaders.length === 0) return;

  const { data: recipients } = await supabase
    .from('circle_summary_inbox_recipients')
    .select('id, leader_id')
    .eq('message_id', message.id);
  const leadersById = new Map(leaders.map((leader) => [String(leader.id), leader]));
  await sendInboxPushes(message, recipients || [], leadersById);
}
