'use client';

import { Plus, Bell } from 'lucide-react';
import Avatar from './Avatar';
import { formatListTime, type AcpdConversationSummary } from '../../lib/acpdMessagingClient';

interface ConversationListProps {
  conversations: AcpdConversationSummary[];
  selectedId: string | null;
  meId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNewMessage: () => void;
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
  showNotifPrompt,
  onEnableNotifications,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col bg-[#15171d] md:bg-transparent">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 md:pt-4">
        <h1 className="text-lg font-semibold text-white">Messages</h1>
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

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {loading && conversations.length === 0 ? (
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
          conversations.map((conv) => {
            const active = conv.id === selectedId;
            const isOwnLast = conv.lastMessage?.senderId === meId;
            const preview = conv.lastMessage
              ? `${isOwnLast ? 'You: ' : ''}${conv.lastMessage.body}`
              : conv.kind === 'channel'
                ? 'Say hello to the team'
                : 'No messages yet';
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelect(conv.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                  active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
                }`}
              >
                <Avatar name={conv.title} seed={conv.otherUser?.id} channel={conv.kind === 'channel'} size="lg" />
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
          })
        )}
      </div>
    </div>
  );
}
