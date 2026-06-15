// Shared client types + helpers for the Radius user inbox (notifications).
// Notifications are read and mutated directly from the browser under RLS, so
// these mirror the public.notifications / notification_preferences row shapes.

import { DateTime } from 'luxon';

export type NotificationType =
  | 'message'
  | 'card_assignment'
  | 'card_comment'
  | 'board_share'
  | 'notebook_share'
  | 'birthday'
  | 'follow_up';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  notify_messages: boolean;
  notify_card_assignments: boolean;
  notify_card_comments: boolean;
  notify_board_shares: boolean;
  notify_notebook_shares: boolean;
  notify_birthdays: boolean;
  notify_follow_ups: boolean;
}

export const NOTIFICATION_TYPE_META: Record<
  NotificationType,
  { label: string; prefKey: keyof Omit<NotificationPreferences, 'user_id'>; accent: string }
> = {
  message:         { label: 'Messages',         prefKey: 'notify_messages',         accent: 'text-vc-300 bg-vc-500/15' },
  card_assignment: { label: 'Card assignments', prefKey: 'notify_card_assignments', accent: 'text-sky-300 bg-sky-500/15' },
  card_comment:    { label: 'Card comments',    prefKey: 'notify_card_comments',    accent: 'text-violet-300 bg-violet-500/15' },
  board_share:     { label: 'Board shares',     prefKey: 'notify_board_shares',     accent: 'text-amber-300 bg-amber-500/15' },
  notebook_share:  { label: 'Notebook shares',  prefKey: 'notify_notebook_shares',  accent: 'text-orange-300 bg-orange-500/15' },
  birthday:        { label: 'Birthdays',        prefKey: 'notify_birthdays',        accent: 'text-rose-300 bg-rose-500/15' },
  follow_up:       { label: 'Follow-ups',       prefKey: 'notify_follow_ups',       accent: 'text-emerald-300 bg-emerald-500/15' },
};

export const PREFERENCE_ROWS: Array<{
  prefKey: keyof Omit<NotificationPreferences, 'user_id'>;
  label: string;
  description: string;
}> = [
  { prefKey: 'notify_messages', label: 'Team messages', description: 'New messages in the ACPD team channel and DMs.' },
  { prefKey: 'notify_card_assignments', label: 'Card assignments', description: 'When a board card is assigned to you.' },
  { prefKey: 'notify_card_comments', label: 'Card comments', description: 'Comments on cards you own or are assigned to.' },
  { prefKey: 'notify_board_shares', label: 'Board shares', description: 'When a board is shared with you.' },
  { prefKey: 'notify_notebook_shares', label: 'Notebook shares', description: 'When a notebook page is shared with you.' },
  { prefKey: 'notify_birthdays', label: 'Birthday alerts', description: 'Daily heads-up for your leaders’ birthdays.' },
  { prefKey: 'notify_follow_ups', label: 'Follow-up alerts', description: 'Daily heads-up for follow-ups that are due.' },
];

/** Event the inbox broadcasts so the nav badge updates instantly. */
export const INBOX_UNREAD_EVENT = 'radius:inbox-unread';

/** Relative-ish timestamp for an inbox row (e.g. "just now", "3h", "Mon", date). */
export function formatNotificationTime(iso: string): string {
  const dt = DateTime.fromISO(iso);
  if (!dt.isValid) return '';
  const now = DateTime.now();
  const mins = now.diff(dt, 'minutes').minutes;
  if (mins < 1) return 'just now';
  if (mins < 60) return `${Math.floor(mins)}m`;
  const hours = now.diff(dt, 'hours').hours;
  if (hours < 24 && dt.hasSame(now, 'day')) return `${Math.floor(hours)}h`;
  if (now.diff(dt, 'days').days < 7) return dt.toFormat('ccc');
  if (dt.hasSame(now, 'year')) return dt.toFormat('LLL d');
  return dt.toFormat('LL/dd/yy');
}
