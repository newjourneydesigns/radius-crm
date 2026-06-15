'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acpdFetch,
  ACPD_UNREAD_EVENT,
  type AcpdOverview,
  type AcpdConversationSummary,
  type AcpdMessage,
} from '../lib/acpdMessagingClient';
import { useRealtimeSubscription } from './useRealtimeSubscription';

// Drives the Messages page: loads the conversation list + directory, the active
// thread, sends messages, starts DMs, and keeps everything live via Supabase
// Realtime on the acpd_messages table (RLS scopes events to the user's own
// conversations).

export function useAcpdMessaging(enabled: boolean) {
  const [overview, setOverview] = useState<AcpdOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AcpdMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  // Name lookup for resolving senders on realtime-delivered messages.
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    if (overview?.me) map.set(overview.me.id, overview.me.name);
    for (const u of overview?.directory || []) map.set(u.id, u.name);
    return map;
  }, [overview]);
  const nameByIdRef = useRef(nameById);
  nameByIdRef.current = nameById;

  const broadcastUnread = useCallback((total: number) => {
    window.dispatchEvent(new CustomEvent(ACPD_UNREAD_EVENT, { detail: { count: total } }));
  }, []);

  const loadOverview = useCallback(async (): Promise<AcpdOverview | null> => {
    try {
      const res = await acpdFetch('/api/acpd-messages/overview');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Could not load messages');
      }
      const data = (await res.json()) as AcpdOverview;
      setOverview(data);
      broadcastUnread(data.unreadTotal);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load messages');
      return null;
    } finally {
      setLoadingOverview(false);
    }
  }, [broadcastUnread]);

  const loadThread = useCallback(async (conversationId: string) => {
    setLoadingThread(true);
    try {
      const res = await acpdFetch(`/api/acpd-messages/messages?conversationId=${conversationId}`);
      if (!res.ok) throw new Error('Could not load this conversation');
      const data = await res.json();
      if (selectedIdRef.current === conversationId) {
        setMessages(data.messages || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this conversation');
    } finally {
      setLoadingThread(false);
    }
  }, []);

  const selectConversation = useCallback((conversationId: string) => {
    setSelectedId(conversationId);
    setMessages([]);
    setError(null);
    // Optimistically clear this conversation's unread badge.
    setOverview((prev) => {
      if (!prev) return prev;
      const conversations = prev.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      );
      const unreadTotal = conversations.reduce((s, c) => s + c.unreadCount, 0);
      broadcastUnread(unreadTotal);
      return { ...prev, conversations, unreadTotal };
    });
    loadThread(conversationId);
  }, [broadcastUnread, loadThread]);

  const sendMessage = useCallback(async (text: string): Promise<boolean> => {
    const conversationId = selectedIdRef.current;
    const trimmed = text.trim();
    if (!conversationId || !trimmed) return false;
    setSending(true);
    setError(null);
    try {
      const res = await acpdFetch('/api/acpd-messages/messages', {
        method: 'POST',
        body: JSON.stringify({ conversationId, body: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Message failed to send');
      }
      const { message } = (await res.json()) as { message: AcpdMessage };
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      loadOverview();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Message failed to send');
      return false;
    } finally {
      setSending(false);
    }
  }, [loadOverview]);

  const startDm = useCallback(async (userId: string): Promise<void> => {
    setError(null);
    try {
      const res = await acpdFetch('/api/acpd-messages/dm', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Could not start conversation');
      }
      const { conversationId } = (await res.json()) as { conversationId: string };
      await loadOverview();
      selectConversation(conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start conversation');
    }
  }, [loadOverview, selectConversation]);

  // Forward a message into another conversation (existing one, or a new/looked-up
  // DM with a director), then jump to that thread so you see it land.
  const forwardMessage = useCallback(
    async (
      original: AcpdMessage,
      sourceLabel: string,
      target: { conversationId?: string; userId?: string }
    ): Promise<boolean> => {
      setError(null);
      try {
        let conversationId = target.conversationId || null;
        if (!conversationId && target.userId) {
          const res = await acpdFetch('/api/acpd-messages/dm', {
            method: 'POST',
            body: JSON.stringify({ userId: target.userId }),
          });
          if (!res.ok) {
            const b = await res.json().catch(() => ({}));
            throw new Error(b?.error || 'Could not open that conversation');
          }
          conversationId = ((await res.json()) as { conversationId: string }).conversationId;
        }
        if (!conversationId) return false;

        const body = `↪︎ Forwarded from ${sourceLabel} — ${original.senderName}:\n${original.body}`;
        const res = await acpdFetch('/api/acpd-messages/messages', {
          method: 'POST',
          body: JSON.stringify({ conversationId, body }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b?.error || 'Could not forward the message');
        }
        await loadOverview();
        selectConversation(conversationId);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not forward the message');
        return false;
      }
    },
    [loadOverview, selectConversation]
  );

  // Initial load.
  useEffect(() => {
    if (!enabled) return;
    loadOverview();
  }, [enabled, loadOverview]);

  // Realtime: append messages for the open thread and keep the sidebar fresh.
  useRealtimeSubscription(
    'acpd-messaging',
    [{ table: 'acpd_messages', event: 'INSERT' }],
    (payload) => {
      const row = payload.new as {
        id: string; conversation_id: string; sender_id: string | null; body: string; created_at: string;
      };
      if (!row?.id) return;

      if (row.conversation_id === selectedIdRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          return [
            ...prev,
            {
              id: row.id,
              conversationId: row.conversation_id,
              senderId: row.sender_id,
              senderName: (row.sender_id && nameByIdRef.current.get(row.sender_id)) || 'Unknown',
              body: row.body,
              createdAt: row.created_at,
            },
          ];
        });
        // Reading the open thread in realtime clears its unread server-side.
        acpdFetch('/api/acpd-messages/read', {
          method: 'POST',
          body: JSON.stringify({ conversationId: row.conversation_id }),
        }).catch(() => {});
      }

      loadOverview();
    },
    enabled,
  );

  const conversations: AcpdConversationSummary[] = overview?.conversations || [];
  const selectedConversation = conversations.find((c) => c.id === selectedId) || null;

  return {
    me: overview?.me || null,
    conversations,
    directory: overview?.directory || [],
    selectedId,
    selectedConversation,
    messages,
    loadingOverview,
    loadingThread,
    sending,
    error,
    selectConversation,
    sendMessage,
    startDm,
    forwardMessage,
    clearSelection: () => setSelectedId(null),
  };
}
