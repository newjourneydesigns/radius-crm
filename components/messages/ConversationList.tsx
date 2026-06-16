'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Bell, ChevronLeft, Search, X } from 'lucide-react';
import Avatar from './Avatar';
import {
  formatListTime,
  type AcpdConversationSummary,
  type AcpdSearchResult,
} from '../../lib/acpdMessagingClient';

interface ConversationListProps {
  conversations: AcpdConversationSummary[];
  selectedId: string | null;
  meId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNewMessage: () => void;
  onExit: () => void;
  onSearchMessages: (q: string) => Promise<AcpdSearchResult[]>;
  showNotifPrompt: boolean;
  onEnableNotifications: () => void;
}

export default function ConversationList({
  conversations,
  selectedId,
  meId,
  loading,
  onSelect,
  onNewMessage,
  onExit,
  onSearchMessages,
  showNotifPrompt,
  onEnableNotifications,
}: ConversationListProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AcpdSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const q = query.trim();

  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations) map.set(c.id, c.title);
    return map;
  }, [conversations]);

  // Conversations whose title matches (instant, local).
  const matchedConversations = useMemo(() => {
    if (!q) return conversations;
    const lower = q.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(lower));
  }, [conversations, q]);

  // Debounced message-body search (server).
  const searchRef = useRef(onSearchMessages);
  searchRef.current = onSearchMessages;
  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchRef.current(q);
      setResults(r);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex h-full w-full flex-col bg-[#15171d] md:bg-transparent">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 pb-3"
        style={{ paddingTop: 'max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))' }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onExit}
            className="-ml-1.5 grid h-8 w-8 place-items-center rounded-full text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Back"
            title="Back"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
          </button>
          <h1 className="text-lg font-semibold text-white">Messages</h1>
        </div>
        <button
          type="button"
          onClick={onNewMessage}
          className="grid h-8 w-8 place-items-center rounded-full bg-vc-fab text-white transition-transform hover:scale-105 active:scale-95"
          aria-label="New message"
          title="New message"
        >
          <Plus className="h-5 w-5" strokeWidth={2.2} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-vc-500/40 focus:outline-none focus:ring-1 focus:ring-vc-500/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-slate-500 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {showNotifPrompt && (
        <button
          type="button"
          onClick={onEnableNotifications}
          className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl bg-vc-500/10 px-3 py-2.5 text-left ring-1 ring-vc-400/25 transition-colors hover:bg-vc-500/15"
        >
          <Bell className="h-4 w-4 shrink-0 text-vc-300" strokeWidth={1.8} />
          <span className="text-[12.5px] leading-tight text-vc-100">
            Turn on notifications so you don’t miss a message.
          </span>
        </button>
      )}

      {/* List / search results */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {q ? (
          <div className="space-y-3 pt-1">
            {matchedConversations.length > 0 && (
              <div>
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Conversations</p>
                {matchedConversations.map((conv) => (
                  <ConversationRow key={conv.id} conv={conv} active={conv.id === selectedId} meId={meId} onSelect={onSelect} />
                ))}
              </div>
            )}

            <div>
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Messages</p>
              {searching ? (
                <p className="px-2 py-3 text-[13px] text-slate-500">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-2 py-3 text-[13px] text-slate-500">
                  {matchedConversations.length === 0 ? 'No matches.' : 'No matching messages.'}
                </p>
              ) : (
                results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onSelect(r.conversationId)}
                    className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <Avatar name={r.senderName} seed={r.senderId || r.senderName} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13.5px] font-medium text-slate-200">
                          {r.senderName}
                          <span className="text-slate-500"> · {titleById.get(r.conversationId) || 'Conversation'}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-500">{formatListTime(r.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[12.5px] text-slate-400">{r.body}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : loading && conversations.length === 0 ? (
          <div className="space-y-1 px-1 pt-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl px-2 py-3">
                <div className="h-10 w-10 rounded-2xl bg-white/[0.06]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-white/[0.06]" />
                  <div className="h-2.5 w-2/3 rounded bg-white/[0.04]" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationRow key={conv.id} conv={conv} active={conv.id === selectedId} meId={meId} onSelect={onSelect} />
          ))
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  conv,
  active,
  meId,
  onSelect,
}: {
  conv: AcpdConversationSummary;
  active: boolean;
  meId: string | null;
  onSelect: (id: string) => void;
}) {
  const isOwnLast = conv.lastMessage?.senderId === meId;
  const preview = conv.lastMessage
    ? `${isOwnLast ? 'You: ' : ''}${conv.lastMessage.body}`
    : conv.kind === 'channel'
      ? 'Say hello to the team'
      : 'No messages yet';
  return (
    <button
      type="button"
      onClick={() => onSelect(conv.id)}
      className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
        active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
      }`}
    >
      <Avatar
        name={conv.title}
        seed={conv.otherUser?.id}
        channel={conv.kind === 'channel'}
        group={conv.kind === 'group'}
        size="lg"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[14px] font-semibold ${active ? 'text-white' : 'text-slate-200'}`}>
            {conv.title}
          </span>
          <span className="shrink-0 text-[11px] text-slate-500">
            {conv.lastMessage ? formatListTime(conv.lastMessage.createdAt) : ''}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className={`truncate text-[12.5px] ${conv.unreadCount > 0 ? 'font-medium text-slate-300' : 'text-slate-500'}`}>
            {preview}
          </span>
          {conv.unreadCount > 0 && (
            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-vc-500 px-1.5 text-[11px] font-semibold text-white">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
