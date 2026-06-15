'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { INBOX_UNREAD_EVENT } from '../lib/notificationsClient';

// Unread notification count for the Inbox nav badge. Counts the user's
// non-archived, unread notifications. Stays live via Realtime, window focus,
// and the inbox's own broadcast (radius:inbox-unread).

export function useInboxUnreadCount(): number {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [count, setCount] = useState(0);
  const channelId = useId();

  const refresh = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }
    const { count: c } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)
      .is('archived_at', null);
    if (typeof c === 'number') setCount(c);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    refresh();

    const onFocus = () => refresh();
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ count?: number }>).detail;
      if (detail && typeof detail.count === 'number') setCount(detail.count);
      else refresh();
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener(INBOX_UNREAD_EVENT, onEvent as EventListener);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(INBOX_UNREAD_EVENT, onEvent as EventListener);
    };
  }, [userId, refresh]);

  useRealtimeSubscription(
    `inbox-badge-${channelId}`,
    userId ? [{ table: 'notifications', filter: `user_id=eq.${userId}` }] : [],
    () => { refresh(); },
    Boolean(userId),
  );

  return count;
}
