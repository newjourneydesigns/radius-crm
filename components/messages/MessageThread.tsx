'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import {
  ChevronLeft, SendHorizontal, Heart, MoreVertical, MoreHorizontal, Forward,
  Trash2, Pin, Pencil, BellOff, Bell, X, Tag,
} from 'lucide-react';
import Avatar from './Avatar';
import Modal from '../ui/Modal';
import {
  formatMessageTime,
  formatDayDivider,
  type AcpdConversationSummary,
  type AcpdMessage,
  type AcpdMember,
} from '../../lib/acpdMessagingClient';

interface MessageThreadProps {
  conversation: AcpdConversationSummary;
  messages: AcpdMessage[];
  members: AcpdMember[];
  muted: boolean;
  meId: string | null;
  meName: string;
  loading: boolean;
  sending: boolean;
  error: string | null;
  onSend: (text: string) => Promise<boolean>;
  onBack: () => void;
  onForward: (message: AcpdMessage) => void;
  onToggleLike: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onEditMessage: (messageId: string, body: string) => Promise<boolean>;
  onTogglePin: (messageId: string, pinned: boolean) => void;
  onToggleMute: (conversationId: string, muted: boolean) => void;
  onRename: (conversationId: string, title: string) => void;
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

// Highlight @mentions in a message body.
function renderBody(text: string) {
  return text.split(/(@[A-Za-z][\w]*)/g).map((part, i) =>
    /^@[A-Za-z]/.test(part) ? (
      <span key={i} className="font-semibold text-emerald-300">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function MessageThread({
  conversation,
  messages,
  members,
  muted,
  meId,
  loading,
  sending,
  error,
  onSend,
  onBack,
  onForward,
  onToggleLike,
  onDeleteMessage,
  onDeleteConversation,
  onEditMessage,
  onTogglePin,
  onToggleMute,
  onRename,
}: MessageThreadProps) {
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState<AcpdMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isChannel = conversation.kind === 'channel';
  const isGroup = conversation.kind === 'group';

  const openRename = () => {
    setMenuOpen(false);
    setRenameDraft(conversation.title === 'Group' ? '' : conversation.title);
    setRenaming(true);
  };
  const saveRename = () => {
    onRename(conversation.id, renameDraft);
    setRenaming(false);
  };

  const handleDeleteConversation = () => {
    setMenuOpen(false);
    if (window.confirm('Delete this conversation for everyone? This can’t be undone.')) {
      onDeleteConversation(conversation.id);
    }
  };

  // Stick to the bottom as messages arrive or the conversation changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, conversation.id]);

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

  // Latest pinned message (for the banner).
  const pinned = useMemo(() => {
    const list = messages.filter((m) => m.pinnedAt);
    return list.length ? list[list.length - 1] : null;
  }, [messages]);

  // Read receipts: the last message I sent, and who else has read up to it.
  const lastMineId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].senderId === meId) return messages[i].id;
    return null;
  }, [messages, meId]);

  const seenLabel = (m: AcpdMessage): string | null => {
    const others = (members || []).filter((mem) => mem.id !== meId);
    if (others.length === 0) return null;
    const seen = others.filter((o) => o.lastReadAt && new Date(o.lastReadAt) >= new Date(m.createdAt));
    if (seen.length === 0) return null;
    if (others.length === 1) return 'Seen';
    if (seen.length === others.length) return 'Seen by everyone';
    return `Seen by ${seen.length}`;
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    const ok = await onSend(text);
    if (!ok) setDraft(text);
    textareaRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startEdit = (m: AcpdMessage) => {
    setActionMsg(null);
    setEditingId(m.id);
    setEditDraft(m.body);
  };
  const saveEdit = async () => {
    if (!editingId) return;
    const ok = await onEditMessage(editingId, editDraft);
    if (ok) {
      setEditingId(null);
      setEditDraft('');
    }
  };

  const scrollToMessage = (id: string) => {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const subtitle = isChannel
    ? 'Everyone on the ACPD team'
    : conversation.kind === 'group'
      ? `${conversation.memberCount ?? members.length} members`
      : conversation.otherUser?.email || 'Direct message';

  return (
    <div className="flex h-full w-full flex-col bg-[#0f1117]">
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
        <Avatar
          name={conversation.title}
          seed={conversation.otherUser?.id}
          channel={isChannel}
          group={conversation.kind === 'group'}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-white">
            {conversation.title}
            {muted && <BellOff className="ml-1.5 inline h-3.5 w-3.5 text-slate-500" />}
          </p>
          <p className="truncate text-[12px] text-slate-500">{subtitle}</p>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Conversation options"
            className="grid h-9 w-9 place-items-center rounded-full text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1c22] shadow-2xl shadow-black/50">
                {isGroup && (
                  <button
                    type="button"
                    onClick={openRename}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] text-slate-200 transition-colors hover:bg-white/[0.05]"
                  >
                    <Tag className="h-4 w-4" /> Rename group
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onToggleMute(conversation.id, !muted);
                  }}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] text-slate-200 transition-colors hover:bg-white/[0.05] ${
                    isGroup ? 'border-t border-white/[0.06]' : ''
                  }`}
                >
                  {muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                  {muted ? 'Unmute conversation' : 'Mute conversation'}
                </button>
                {!isChannel && (
                  <button
                    type="button"
                    onClick={handleDeleteConversation}
                    className="flex w-full items-center gap-2.5 border-t border-white/[0.06] px-3.5 py-2.5 text-left text-[13.5px] text-red-400 transition-colors hover:bg-white/[0.05]"
                  >
                    <Trash2 className="h-4 w-4" /> Delete conversation
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pinned banner */}
      {pinned && (
        <button
          type="button"
          onClick={() => scrollToMessage(pinned.id)}
          className="flex items-center gap-2.5 border-b border-white/[0.06] bg-white/[0.03] px-4 py-2 text-left hover:bg-white/[0.05]"
        >
          <Pin className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-300">
            <span className="font-medium text-slate-400">{pinned.senderName}: </span>
            {pinned.body}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onTogglePin(pinned.id, false); }}
            className="shrink-0 text-[11px] font-medium text-slate-500 hover:text-white"
          >
            Unpin
          </span>
        </button>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 md:px-6">
        {loading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Avatar name={conversation.title} seed={conversation.otherUser?.id} channel={isChannel} group={conversation.kind === 'group'} size="lg" />
            <p className="mt-1 line-clamp-2 max-w-full text-[15px] font-semibold text-slate-200">{conversation.title}</p>
            <p className="max-w-xs text-[13px] text-slate-500">
              {isChannel
                ? 'This is the start of the ACPD team channel. Anything you post here is visible to every director.'
                : isGroup
                  ? 'This is the start of your group conversation.'
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
              const liked = !!m.likedByMe;
              const likeCount = m.likeCount || 0;
              const editing = editingId === m.id;
              const subtle = 'opacity-60 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100';
              const actions = (
                <div className="mb-1 flex shrink-0 items-center gap-0.5 self-center">
                  <button
                    type="button"
                    onClick={() => onToggleLike(m.id)}
                    aria-label={liked ? 'Remove like' : 'Like message'}
                    title={liked ? 'Remove like' : 'Like'}
                    className={`flex h-7 items-center gap-1 rounded-full px-1.5 transition-colors ${
                      liked ? 'text-emerald-400' : 'text-slate-500 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {likeCount > 0 ? (
                      <>
                        <span className="text-[12px] leading-none">💚</span>
                        <span className="text-[11px] font-medium">{likeCount}</span>
                      </>
                    ) : (
                      <Heart className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionMsg(m)}
                    aria-label="Message actions"
                    title="More"
                    className={`grid h-7 w-7 place-items-center rounded-full text-slate-500 transition-all hover:bg-white/10 hover:text-white ${subtle}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              );
              return (
                <div
                  key={row.key}
                  id={`msg-${m.id}`}
                  className={`group flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'} ${
                    row.showMeta ? 'mt-3' : 'mt-0.5'
                  }`}
                >
                  {!mine && (
                    <div className="w-8 shrink-0">
                      {row.showMeta && <Avatar name={m.senderName} seed={m.senderId || m.senderName} size="sm" />}
                    </div>
                  )}
                  {mine && !editing && actions}
                  <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {row.showMeta && (isChannel || conversation.kind === 'group') && !mine && (
                      <span className="mb-0.5 ml-1 text-[11px] font-medium text-slate-400">{m.senderName}</span>
                    )}
                    {editing ? (
                      <div className="flex w-[min(78vw,420px)] flex-col gap-2 rounded-2xl bg-white/[0.06] p-2">
                        <textarea
                          autoFocus
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={2}
                          className="resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[14px] text-slate-100 focus:border-vc-500/40 focus:outline-none"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => { setEditingId(null); setEditDraft(''); }}
                            className="rounded-lg px-3 py-1.5 text-[12.5px] text-slate-300 hover:bg-white/10"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={!editDraft.trim()}
                            className="rounded-lg bg-vc-fab px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${
                          mine ? 'rounded-br-md bg-vc-fab text-white' : 'rounded-bl-md bg-white/[0.07] text-slate-100'
                        }`}
                      >
                        {renderBody(m.body)}
                      </div>
                    )}
                    {row.showMeta && !editing && (
                      <span className="mt-1 px-1 text-[10.5px] text-slate-500">
                        {formatMessageTime(m.createdAt)}
                        {m.editedAt && ' · edited'}
                      </span>
                    )}
                    {mine && m.id === lastMineId && seenLabel(m) && (
                      <span className="px-1 text-[10.5px] font-medium text-slate-500">{seenLabel(m)}</span>
                    )}
                  </div>
                  {!mine && !editing && actions}
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
            placeholder={
              isChannel ? 'Message the ACPD team…' : isGroup ? 'Message the group…' : `Message ${conversation.title}…`
            }
            className="max-h-36 flex-1 resize-none truncate rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[14px] text-slate-100 placeholder:text-slate-500 focus:border-vc-500/40 focus:outline-none focus:ring-1 focus:ring-vc-500/30"
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

      {/* Per-message action sheet */}
      {actionMsg && (
        <div className="fixed inset-0 z-[10010]" onClick={() => setActionMsg(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl border-t border-white/[0.08] bg-[#15171d] p-2 shadow-2xl shadow-black/50"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center py-2"><div className="h-1 w-10 rounded-full bg-white/15" /></div>
            <SheetItem icon={<Forward className="h-[18px] w-[18px]" />} label="Forward" onClick={() => { const m = actionMsg; setActionMsg(null); onForward(m); }} />
            <SheetItem
              icon={<Pin className="h-[18px] w-[18px]" />}
              label={actionMsg.pinnedAt ? 'Unpin message' : 'Pin message'}
              onClick={() => { const m = actionMsg; setActionMsg(null); onTogglePin(m.id, !m.pinnedAt); }}
            />
            {actionMsg.senderId === meId && (
              <>
                <SheetItem icon={<Pencil className="h-[18px] w-[18px]" />} label="Edit message" onClick={() => startEdit(actionMsg)} />
                <SheetItem
                  icon={<Trash2 className="h-[18px] w-[18px]" />}
                  label="Delete message"
                  danger
                  onClick={() => { const id = actionMsg.id; setActionMsg(null); onDeleteMessage(id); }}
                />
              </>
            )}
            <button
              type="button"
              onClick={() => setActionMsg(null)}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-medium text-slate-400 hover:bg-white/[0.04]"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rename group */}
      <Modal isOpen={renaming} onClose={() => setRenaming(false)} title="Name this group" size="sm">
        <input
          autoFocus
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); }}
          maxLength={80}
          placeholder="Group name"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-vc-500/40 focus:outline-none focus:ring-1 focus:ring-vc-500/30"
        />
        <p className="mt-2 text-[12px] text-slate-500">Leave blank to use members’ names.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setRenaming(false)}
            className="rounded-lg px-4 py-2 text-[13px] font-medium text-slate-300 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveRename}
            className="rounded-lg bg-vc-fab px-4 py-2 text-[13px] font-semibold text-white"
          >
            Save
          </button>
        </div>
      </Modal>
    </div>
  );
}

function SheetItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[14px] font-medium transition-colors hover:bg-white/[0.05] ${
        danger ? 'text-red-400' : 'text-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
