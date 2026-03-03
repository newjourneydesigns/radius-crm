'use client';

// =============================================================
// useRadiusAssistant — React hook for the Radius AI assistant
// =============================================================
// Manages conversation state, API calls, voice input, and
// conversation persistence via localStorage + Supabase.
// =============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolAction?: string; // e.g. "created_todo", "added_note"
  timestamp: number;
}

export interface PendingToolCall {
  name: string;
  args: Record<string, unknown>;
  description: string;
}

interface UseRadiusAssistantReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  sendMessage: (text: string) => Promise<void>;
  startNewConversation: () => void;
  isReady: boolean; // true once auth context is available
  lastNavigateTo: string | null; // page path from navigate_to_page tool
  clearNavigateTo: () => void;
  pendingToolCall: PendingToolCall | null;
  isConfirming: boolean;
  confirmToolCall: () => Promise<boolean>; // returns true if write succeeded
  rejectToolCall: () => void;
}

const STORAGE_KEY = 'radius-assistant-conversation-id';
const MESSAGES_STORAGE_KEY = 'radius-assistant-messages';
const RATE_LIMIT_COOLDOWN_MS = 5000; // 5-second cooldown after rate limit

export function useRadiusAssistant(): UseRadiusAssistantReturn {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lastNavigateTo, setLastNavigateTo] = useState<string | null>(null);
  const [pendingToolCall, setPendingToolCall] = useState<PendingToolCall | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isLoadingRef = useRef(false); // Ref to prevent double-send race condition
  const rateLimitedUntilRef = useRef(0); // Timestamp when rate limit expires

  // Load conversation ID and cached messages from localStorage on mount
  useEffect(() => {
    try {
      const savedId = localStorage.getItem(STORAGE_KEY);
      if (savedId) setConversationId(savedId);

      const savedMessages = localStorage.getItem(MESSAGES_STORAGE_KEY);
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Persist conversation ID and messages when they change
  useEffect(() => {
    try {
      if (conversationId) {
        localStorage.setItem(STORAGE_KEY, conversationId);
      }
    } catch {
      // Ignore
    }
  }, [conversationId]);

  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(messages));
      }
    } catch {
      // Ignore
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      // Use ref for instant guard — state can be stale in closures
      if (!text.trim() || !user || isLoadingRef.current) return;

      // Rate limit cooldown
      if (Date.now() < rateLimitedUntilRef.current) {
        const secsLeft = Math.ceil((rateLimitedUntilRef.current - Date.now()) / 1000);
        setError(`Rate limited — please wait ${secsLeft}s before trying again.`);
        return;
      }

      // Clear any pending tool call when sending a new message
      setPendingToolCall(null);

      isLoadingRef.current = true;

      const userMessage: ChatMessage = {
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch('/api/ai-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text.trim(),
            conversationId,
            userId: user.id,
            userName: user.name || user.email || 'User',
            userRole: user.role || 'Viewer',
            userCampus: undefined,
          }),
          signal: controller.signal,
        });

        // Silently handle non-JSON responses (e.g. stale service worker)
        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error('Invalid response from server');
        }

        if (!res.ok) {
          // Set cooldown on rate limit
          if (res.status === 429) {
            rateLimitedUntilRef.current = Date.now() + RATE_LIMIT_COOLDOWN_MS;
          }
          throw new Error(data.error || `Error: ${res.status}`);
        }

        // Handle pending tool call (write action needs confirmation)
        if (data.pendingToolCall) {
          setPendingToolCall(data.pendingToolCall as PendingToolCall);
          if (data.conversationId) {
            setConversationId(data.conversationId);
          }
          return;
        }

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.reply,
          toolAction: data.toolAction,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        if (data.conversationId) {
          setConversationId(data.conversationId);
        }

        // If the AI used the navigate_to_page tool, surface the path
        if (data.navigateTo) {
          setLastNavigateTo(data.navigateTo);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const errorMsg = err instanceof Error ? err.message : 'Something went wrong';
        setError(errorMsg);

        // Add error as a system message so the user sees it in the chat
        const isRateLimit = errorMsg.toLowerCase().includes('rate');
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: isRateLimit
              ? `⏳ ${errorMsg}`
              : `Sorry, I ran into an issue: ${errorMsg}`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [user, conversationId]
  );

  const clearNavigateTo = useCallback(() => setLastNavigateTo(null), []);

  const confirmToolCall = useCallback(async (): Promise<boolean> => {
    if (!pendingToolCall || !user || isConfirming) return false;

    setIsConfirming(true);
    setError(null);

    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmTool: {
            name: pendingToolCall.name,
            args: pendingToolCall.args,
          },
          conversationId,
          userId: user.id,
          userName: user.name || user.email || 'User',
          userRole: user.role || 'Viewer',
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('Invalid response from server');
      }

      if (!res.ok) {
        throw new Error(data.error || `Error: ${res.status}`);
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.reply,
        toolAction: data.toolAction,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setPendingToolCall(null);

      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Something went wrong';
      setError(errorMsg);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, I couldn't complete that action: ${errorMsg}`,
          timestamp: Date.now(),
        },
      ]);
      setPendingToolCall(null);
      return false;
    } finally {
      setIsConfirming(false);
    }
  }, [pendingToolCall, user, conversationId, isConfirming]);

  const rejectToolCall = useCallback(() => {
    setPendingToolCall(null);
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: 'Action cancelled.',
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setLastNavigateTo(null);
    setPendingToolCall(null);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(MESSAGES_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  return {
    messages,
    isLoading,
    error,
    conversationId,
    sendMessage,
    startNewConversation,
    isReady: !!user,
    lastNavigateTo,
    clearNavigateTo,
    pendingToolCall,
    isConfirming,
    confirmToolCall,
    rejectToolCall,
  };
}
