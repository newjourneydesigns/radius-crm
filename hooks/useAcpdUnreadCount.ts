'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { acpdFetch, ACPD_UNREAD_EVENT } from '../lib/acpdMessagingClient';
import { useRealtimeSubscription } from './useRealtimeSubscription';

// Powers the unread badge on the Team Chat nav entry. Counts unread ACPD
// messages across the user's conversations via /api/acpd-messages/unread-count.
//
// Stays roughly live: refreshes on mount, on window focus, every few minutes,
// in realtime when a new message lands, and immediately when the Messages page
// broadcasts an updated count (radius:acpd-unread).

const REFRESH_INTERVAL_MS = 3 * 60 * 1000;

export function useAcpdUnreadCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  // Unique per hook instance so the desktop + mobile navs don't collide on a
  // shared Realtime channel name.
  const channelId = useId();

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await acpdFetch('/api/acpd-messages/unread-count');
      if (!res.ok) return;
      const body = await res.json();
      if (typeof body?.count === 'number') setCount(body.count);
    } catch {
      // Best-effort: keep the last known count on failure.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    refresh();

    const onFocus = () => refresh();
    const onCount = (e: Event) => {
      const detail = (e as CustomEvent<{ count?: number }>).detail;
      if (detail && typeof detail.count === 'number') setCount(detail.count);
      else refresh();
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener(ACPD_UNREAD_EVENT, onCount as EventListener);
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(ACPD_UNREAD_EVENT, onCount as EventListener);
      clearInterval(interval);
    };
  }, [enabled, refresh]);

  // Live bump when any new ACPD message arrives (RLS scopes this to the user's
  // own conversations).
  useRealtimeSubscription(
    `acpd-unread-badge-${channelId}`,
    [{ table: 'acpd_messages', event: 'INSERT' }],
    () => { refresh(); },
    enabled,
  );

  return count;
}
