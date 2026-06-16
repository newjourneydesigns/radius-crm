'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { ChevronLeft, SendHorizontal, Forward } from 'lucide-react';
import Avatar from './Avatar';
import {
  formatMessageTime,
  formatDayDivider,
  type AcpdConversationSummary,
  type AcpdMessage,
} from '../../lib/acpdMessagingClient';

interface MessageThreadProps {
  conversation: AcpdConversationSummary;
  messages: AcpdMessage[];
  meId: string | null;
  loading: boolean;
  sending: boolean;
  error: string | null;
  onSend: (text: string) => Promise<boolean>;
  onBack: () => void;
  onForward: (message: AcpdMessage) => void;
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export default function MessageThread({
  conversation,
  messages,
  meId,
  loading,
  sending,
  error,
  onSend,
  onBack,
  onForward,
}: MessageThreadProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isChannel = conversation.kind === 'channel';

  // Stick to the bottom as messages arrive or the conversation changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, conversation.id]);

  // Auto-grow the composer up to a few lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  const rows = useMemo(() => {
    const out: Array<
      | { type: 'divider'; key: string; label: string }
      | { type: 'message'; key: string; message: AcpdMessage; showMeta: boolean }
    > = [];
    let lastDay = '';
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const day = formatDayDivider(m.createdAt);
      if (day !== lastDay) {
        out.push({ type: 'divider', key: `d-${m.id}`, label: day });
        lastDay = day;
      }
      const prev = messages[i - 1];
      const sameSenderRun =
        prev &&
        prev.senderId === m.senderId &&
        new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS &&
        formatDayDivider(prev.createdAt) === day;
      out.push({ type: 'message', key: m.id, message: m, showMeta: !sameSenderRun });
    }
    return out;
  }, [messages]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    const ok = await onSend(text);
    if (!ok) setDraft(text); // restore so nothing is lost on failure
    textareaRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const subtitle = isChannel
    ? 'Everyone on the ACPD team'
    : conversation.otherUser?.email || 'Direct message';

  return (
    <div className="flex h-full flex-col bg-[#0f1117]">
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b border-white/[0.06] bg-[#15171d]/80 px-3 py-3 backdrop-blur md:px-5"
        style={{ paddingTop: 'max(0.75rem, calc(env(safe-area-inset-top) + 0.25rem))' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 grid h-8 w-8 place-items-center rounded-full text-slate-300 hover:bg-white/[0.06] md:hidden"
          aria-label="Back to conversations"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <Avatar name={conversation.title} seed={conversation.otherUser?.id} channel={isChannel} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-white">{conversation.title}</p>
          <p className="truncate text-[12px] text-slate-500">{subtitle}</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 md:px-6">
        {loading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Avatar name={conversation.title} seed={conversation.otherUser?.id} channel={isChannel} size="lg" />
            <p className="mt-1 text-[15px] font-semibold text-slate-200">{conversation.title}</p>
            <p className="max-w-xs text-[13px] text-slate-500">
              {isChannel
                ? 'This is the start of the ACPD team channel. Anything you post here is visible to every director.'
                : `This is the beginning of your conversation with ${conversation.title}.`}
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-1">
            {rows.map((row) => {
              if (row.type === 'divider') {
                return (
                  <div key={row.key} className="flex items-center justify-center py-3">
                    <span className="rounded-full bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-slate-400">
                      {row.label}
                    </span>
                  </div>
                );
              }
              const m = row.message;
              const mine = m.senderId === meId;
              const forwardBtn = (
                <button
                  type="button"
                  onClick={() => onForward(m)}
                  aria-label="Forward message"
                  title="Forward"
                  className="mb-1 grid h-7 w-7 shrink-0 place-items-center self-center rounded-full text-slate-500 opacity-0 transition-opacity hover:bg-white/10 hover:text-white focus:opacity-100 group-hover:opacity-100"
                >
                  <Forward className="h-4 w-4" />
                </button>
              );
              return (
                <div
                  key={row.key}
                  className={`group flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'} ${
                    row.showMeta ? 'mt-3' : 'mt-0.5'
                  }`}
                >
                  {!mine && (
                    <div className="w-8 shrink-0">
                      {row.showMeta && <Avatar name={m.senderName} seed={m.senderId || m.senderName} size="sm" />}
                    </div>
                  )}
                  {mine && forwardBtn}
                  <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {row.showMeta && isChannel && !mine && (
                      <span className="mb-0.5 ml-1 text-[11px] font-medium text-slate-400">{m.senderName}</span>
                    )}
                    <div
                      className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${
                        mine
                          ? 'rounded-br-md bg-vc-fab text-white'
                          : 'rounded-bl-md bg-white/[0.07] text-slate-100'
                      }`}
                    >
                      {m.body}
                    </div>
                    {row.showMeta && (
                      <span className="mt-1 px-1 text-[10.5px] text-slate-500">{formatMessageTime(m.createdAt)}</span>
                    )}
                  </div>
                  {!mine && forwardBtn}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer */}
      <div
        className="border-t border-white/[0.06] bg-[#15171d] px-3 py-3 md:px-6"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {error && <p className="mb-2 px-1 text-[12px] text-red-400">{error}</p>}
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={isChannel ? 'Message the ACPD team…' : `Message ${conversation.title}…`}
            className="max-h-36 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[14px] text-slate-100 placeholder:text-slate-500 focus:border-vc-500/40 focus:outline-none focus:ring-1 focus:ring-vc-500/30"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-vc-fab text-white transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            aria-label="Send message"
          >
            <SendHorizontal className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
