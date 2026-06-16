// Shared client-side types + a token-authenticated fetch helper for the ACPD
// messaging feature. All requests carry the Supabase access token so the API
// routes can verify the caller is an ACPD.

import { DateTime } from 'luxon';
import { supabase } from './supabase';

export interface AcpdDirectoryUser {
  id: string;
  name: string;
  email: string;
}

export interface AcpdConversationSummary {
  id: string;
  kind: 'channel' | 'dm' | 'group';
  title: string;
  otherUser: AcpdDirectoryUser | null;
  memberCount?: number;
  lastMessage: { body: string; senderId: string | null; createdAt: string } | null;
  lastMessageAt: string;
  unreadCount: number;
}

export interface AcpdMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderName: string;
  body: string;
  createdAt: string;
  likeCount?: number;
  likedByMe?: boolean;
}

export interface AcpdOverview {
  me: { id: string; name: string; email: string };
  conversations: AcpdConversationSummary[];
  directory: AcpdDirectoryUser[];
  unreadTotal: number;
}

/** Event other parts of the app can listen to / dispatch to refresh the unread badge. */
export const ACPD_UNREAD_EVENT = 'radius:acpd-unread';

/** Initials for an avatar (e.g. "Trip Ochenski" → "TO"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Compact timestamp for the conversation list (time today, weekday this week, else date). */
export function formatListTime(iso: string): string {
  const dt = DateTime.fromISO(iso);
  if (!dt.isValid) return '';
  const now = DateTime.now();
  if (dt.hasSame(now, 'day')) return dt.toFormat('h:mm a');
  if (now.diff(dt, 'days').days < 7) return dt.toFormat('ccc');
  if (dt.hasSame(now, 'year')) return dt.toFormat('LLL d');
  return dt.toFormat('LL/dd/yy');
}

/** Full timestamp shown beside a message (time today, else date + time). */
export function formatMessageTime(iso: string): string {
  const dt = DateTime.fromISO(iso);
  if (!dt.isValid) return '';
  const now = DateTime.now();
  if (dt.hasSame(now, 'day')) return dt.toFormat('h:mm a');
  if (now.diff(dt, 'days').days < 7) return dt.toFormat('ccc h:mm a');
  return dt.toFormat('LLL d, h:mm a');
}

/** Day divider label for grouping messages (Today / Yesterday / date). */
export function formatDayDivider(iso: string): string {
  const dt = DateTime.fromISO(iso);
  if (!dt.isValid) return '';
  const now = DateTime.now();
  if (dt.hasSame(now, 'day')) return 'Today';
  if (dt.hasSame(now.minus({ days: 1 }), 'day')) return 'Yesterday';
  if (dt.hasSame(now, 'year')) return dt.toFormat('cccc, LLL d');
  return dt.toFormat('cccc, LLL d, yyyy');
}

export async function acpdFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${token ?? ''}`,
  };
  if (init?.body) headers['Content-Type'] = 'application/json';
  return fetch(path, { ...init, headers, cache: 'no-store' });
}
