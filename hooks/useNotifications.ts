'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import {
  INBOX_UNREAD_EVENT,
  type NotificationRow,
  type NotificationType,
} from '../lib/notificationsClient';

export type InboxView = 'all' | 'unread' | 'archived';

// Drives the /inbox page: loads the user's notifications, filters by read state
// and type, and supports mark read/unread, archive/restore, and delete — all
// direct Supabase mutations under RLS. Realtime keeps the list fresh.

export function useNotifications() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<InboxView>('all');
  const [search, setSearch] = useState('');
  // Multi-select type filter. Empty set = show all types.
  const [typeFilters, setTypeFilters] = useState<Set<NotificationType>>(new Set());

  const toggleType = useCallback((t: NotificationType) => {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const clearTypes = useCallback(() => setTypeFilters(new Set()), []);

  const broadcastUnread = useCallback((rows: NotificationRow[]) => {
    const count = rows.filter((n) => !n.read_at && !n.archived_at).length;
    window.dispatchEvent(new CustomEvent(INBOX_UNREAD_EVENT, { detail: { count } }));
  }, []);

  const load = useCallback(
    async (which: InboxView) => {
      if (!userId) return;
      setLoading(true);
      try {
        let query = supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(200);
        query = which === 'archived' ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
        const { data } = await query;
        setItems((data as NotificationRow[]) || []);
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    if (userId) load(view);
  }, [userId, view, load]);

  // Realtime: refresh whatever view is showing, and keep the badge in sync.
  useRealtimeSubscription(
    'inbox-page',
    userId ? [{ table: 'notifications', filter: `user_id=eq.${userId}` }] : [],
    () => { load(view); },
    Boolean(userId)
  );

  const patchLocal = useCallback(
    (id: string, changes: Partial<NotificationRow>, removeIf?: (n: NotificationRow) => boolean) => {
      setItems((prev) => {
        const next = prev
          .map((n) => (n.id === id ? { ...n, ...changes } : n))
          .filter((n) => (removeIf ? !removeIf(n) : true));
        broadcastUnread(next);
        return next;
      });
    },
    [broadcastUnread]
  );

  const nowIso = () => new Date().toISOString();

  const markRead = useCallback(async (id: string) => {
    patchLocal(id, { read_at: nowIso() });
    await supabase.from('notifications').update({ read_at: nowIso() }).eq('id', id);
  }, [patchLocal]);

  const markUnread = useCallback(async (id: string) => {
    patchLocal(id, { read_at: null });
    await supabase.from('notifications').update({ read_at: null }).eq('id', id);
  }, [patchLocal]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const stamp = nowIso();
    setItems((prev) => {
      const next = prev.map((n) => (n.read_at ? n : { ...n, read_at: stamp }));
      broadcastUnread(next);
      return next;
    });
    await supabase
      .from('notifications')
      .update({ read_at: stamp })
      .eq('user_id', userId)
      .is('read_at', null)
      .is('archived_at', null);
  }, [userId, broadcastUnread]);

  const archive = useCallback(async (id: string) => {
    // Drop from the current (non-archived) view.
    patchLocal(id, { archived_at: nowIso() }, view !== 'archived' ? (n) => n.id === id : undefined);
    await supabase.from('notifications').update({ archived_at: nowIso() }).eq('id', id);
  }, [patchLocal, view]);

  const restore = useCallback(async (id: string) => {
    patchLocal(id, { archived_at: null }, view === 'archived' ? (n) => n.id === id : undefined);
    await supabase.from('notifications').update({ archived_at: null }).eq('id', id);
  }, [patchLocal, view]);

  const remove = useCallback(async (id: string) => {
    setItems((prev) => {
      const next = prev.filter((n) => n.id !== id);
      broadcastUnread(next);
      return next;
    });
    await supabase.from('notifications').delete().eq('id', id);
  }, [broadcastUnread]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((n) => {
      if (view === 'unread' && n.read_at) return false;
      if (typeFilters.size > 0 && !typeFilters.has(n.type)) return false;
      if (q && !`${n.title} ${n.body ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, view, typeFilters, search]);

  const unreadCount = useMemo(
    () => items.filter((n) => !n.read_at && !n.archived_at).length,
    [items]
  );

  return {
    items: filtered,
    loading,
    view,
    setView,
    search,
    setSearch,
    typeFilters,
    toggleType,
    clearTypes,
    unreadCount,
    markRead,
    markUnread,
    markAllRead,
    archive,
    restore,
    remove,
  };
}
