'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acpdFetch,
  ACPD_UNREAD_EVENT,
  type AcpdOverview,
  type AcpdConversationSummary,
  type AcpdMessage,
  type AcpdMember,
  type AcpdSearchResult,
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
  const [members, setMembers] = useState<AcpdMember[]>([]);
  const [threadConversation, setThreadConversation] = useState<AcpdConversationSummary | null>(null);
  const [muted, setMuted] = useState(false);
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
        setMembers(data.members || []);
        setMuted(Boolean(data.muted));
        if (data.conversation) setThreadConversation(data.conversation as AcpdConversationSummary);
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
    setThreadConversation(null);
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

  // Start a conversation with one or more selected directors (DM or group).
  const startGroup = useCallback(async (userIds: string[]): Promise<void> => {
    setError(null);
    try {
      const res = await acpdFetch('/api/acpd-messages/group', {
        method: 'POST',
        body: JSON.stringify({ userIds }),
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

  // Toggle the caller's 💚 like on a message (optimistic; resync on failure).
  const toggleLike = useCallback(async (messageId: string): Promise<void> => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              likedByMe: !m.likedByMe,
              likeCount: Math.max(0, (m.likeCount || 0) + (m.likedByMe ? -1 : 1)),
            }
          : m
      )
    );
    try {
      const res = await acpdFetch('/api/acpd-messages/react', {
        method: 'POST',
        body: JSON.stringify({ messageId }),
      });
      if (!res.ok) throw new Error('react failed');
    } catch {
      const conv = selectedIdRef.current;
      if (conv) loadThread(conv);
    }
  }, [loadThread]);

  // Delete one of your own messages.
  const deleteMessage = useCallback(async (messageId: string): Promise<void> => {
    const prevMessages = messages;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      const res = await acpdFetch(`/api/acpd-messages/messages?messageId=${messageId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Could not delete the message');
      }
      loadOverview();
    } catch (e) {
      setMessages(prevMessages); // revert
      setError(e instanceof Error ? e.message : 'Could not delete the message');
    }
  }, [messages, loadOverview]);

  // Permanently delete a DM/group conversation for everyone in it.
  const deleteConversation = useCallback(async (conversationId: string): Promise<void> => {
    setOverview((prev) =>
      prev ? { ...prev, conversations: prev.conversations.filter((c) => c.id !== conversationId) } : prev
    );
    if (selectedIdRef.current === conversationId) {
      setSelectedId(null);
      setMessages([]);
    }
    try {
      const res = await acpdFetch(`/api/acpd-messages/conversation?conversationId=${conversationId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Could not delete the conversation');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the conversation');
    } finally {
      loadOverview();
    }
  }, [loadOverview]);

  // Edit one of your own messages.
  const editMessage = useCallback(async (messageId: string, body: string): Promise<boolean> => {
    const trimmed = body.trim();
    if (!trimmed) return false;
    try {
      const res = await acpdFetch('/api/acpd-messages/messages', {
        method: 'PATCH',
        body: JSON.stringify({ messageId, body: trimmed }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error || 'Could not edit the message');
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, body: trimmed, editedAt: new Date().toISOString() } : m))
      );
      loadOverview();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not edit the message');
      return false;
    }
  }, [loadOverview]);

  // Pin / unpin a message (optimistic; resync on failure).
  const togglePin = useCallback(async (messageId: string, pinned: boolean): Promise<void> => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, pinnedAt: pinned ? new Date().toISOString() : null } : m))
    );
    try {
      const res = await acpdFetch('/api/acpd-messages/pin', {
        method: 'POST',
        body: JSON.stringify({ messageId, pinned }),
      });
      if (!res.ok) throw new Error('pin failed');
    } catch {
      const c = selectedIdRef.current;
      if (c) loadThread(c);
    }
  }, [loadThread]);

  // Mute / unmute the open conversation for me.
  const toggleMute = useCallback(async (conversationId: string, nextMuted: boolean): Promise<void> => {
    setMuted(nextMuted);
    try {
      const res = await acpdFetch('/api/acpd-messages/mute', {
        method: 'POST',
        body: JSON.stringify({ conversationId, muted: nextMuted }),
      });
      if (!res.ok) throw new Error('mute failed');
    } catch {
      setMuted(!nextMuted);
    }
  }, []);

  // Search message bodies across my conversations.
  const searchMessages = useCallback(async (q: string): Promise<AcpdSearchResult[]> => {
    if (q.trim().length < 2) return [];
    try {
      const res = await acpdFetch(`/api/acpd-messages/search?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []) as AcpdSearchResult[];
    } catch {
      return [];
    }
  }, []);

  // Initial load.
  useEffect(() => {
    if (!enabled) return;
    loadOverview();
  }, [enabled, loadOverview]);

  // Realtime: append/remove messages for the open thread, refresh likes, and
  // keep the sidebar fresh.
  useRealtimeSubscription(
    'acpd-messaging',
    [
      { table: 'acpd_messages', event: 'INSERT' },
      { table: 'acpd_messages', event: 'DELETE' },
      { table: 'acpd_message_reactions', event: '*' },
    ],
    (payload) => {
      // A like changed somewhere we can see — refresh the open thread's counts.
      if (payload.table === 'acpd_message_reactions') {
        const conv = selectedIdRef.current;
        if (conv) loadThread(conv);
        return;
      }

      // A message was deleted — drop it from the open thread and refresh list.
      if (payload.eventType === 'DELETE') {
        const old = payload.old as { id?: string };
        if (old?.id) setMessages((prev) => prev.filter((m) => m.id !== old.id));
        loadOverview();
        return;
      }

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
              likeCount: 0,
              likedByMe: false,
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
  // Prefer the overview entry, but fall back to the thread's own metadata so a
  // freshly-created conversation renders even before the sidebar list catches up.
  const selectedConversation =
    conversations.find((c) => c.id === selectedId) ||
    (threadConversation && threadConversation.id === selectedId ? threadConversation : null);

  return {
    me: overview?.me || null,
    conversations,
    directory: overview?.directory || [],
    selectedId,
    selectedConversation,
    messages,
    members,
    muted,
    loadingOverview,
    loadingThread,
    sending,
    error,
    selectConversation,
    sendMessage,
    startDm,
    startGroup,
    forwardMessage,
    toggleLike,
    deleteMessage,
    deleteConversation,
    editMessage,
    togglePin,
    toggleMute,
    searchMessages,
    clearSelection: () => setSelectedId(null),
    clearError: () => setError(null),
  };
}
