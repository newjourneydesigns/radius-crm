'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import Modal from '../ui/Modal';
import Avatar from './Avatar';
import {
  type AcpdConversationSummary,
  type AcpdDirectoryUser,
  type AcpdMessage,
} from '../../lib/acpdMessagingClient';

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: AcpdMessage | null;
  sourceLabel: string;
  conversations: AcpdConversationSummary[];
  directory: AcpdDirectoryUser[];
  onForward: (target: { conversationId?: string; userId?: string }) => Promise<boolean>;
}

export default function ForwardMessageModal({
  isOpen,
  onClose,
  message,
  sourceLabel,
  conversations,
  directory,
  onForward,
}: ForwardMessageModalProps) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  // Directors who don't already have a DM in the list (avoid duplicate rows).
  const dmUserIds = new Set(
    conversations.filter((c) => c.kind === 'dm' && c.otherUser).map((c) => c.otherUser!.id)
  );

  const q = query.trim().toLowerCase();
  const matchedConversations = useMemo(
    () => conversations.filter((c) => !q || c.title.toLowerCase().includes(q)),
    [conversations, q]
  );
  const matchedDirectory = useMemo(
    () =>
      directory.filter(
        (u) => !dmUserIds.has(u.id) && (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      ),
    [directory, dmUserIds, q]
  );

  const run = async (target: { conversationId?: string; userId?: string }) => {
    setBusy(true);
    const ok = await onForward(target);
    setBusy(false);
    if (ok) {
      setQuery('');
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Forward message" size="md">
      {message && (
        <div className="mb-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{message.senderName}</p>
          <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[13px] text-slate-300">{message.body}</p>
        </div>
      )}

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Forward to…"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-vc-500/40 focus:outline-none focus:ring-1 focus:ring-vc-500/30"
        />
      </div>

      <div className="max-h-80 space-y-0.5 overflow-y-auto">
        {matchedConversations.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={busy}
            onClick={() => run({ conversationId: c.id })}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05] disabled:opacity-50"
          >
            <Avatar name={c.title} seed={c.otherUser?.id} channel={c.kind === 'channel'} size="md" />
            <span className="truncate text-[14px] font-medium text-slate-100">{c.title}</span>
          </button>
        ))}

        {matchedDirectory.length > 0 && (
          <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Start a new conversation
          </p>
        )}
        {matchedDirectory.map((u) => (
          <button
            key={u.id}
            type="button"
            disabled={busy}
            onClick={() => run({ userId: u.id })}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05] disabled:opacity-50"
          >
            <Avatar name={u.name} seed={u.id} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-slate-100">{u.name}</p>
              <p className="truncate text-[12px] text-slate-500">{u.email}</p>
            </div>
          </button>
        ))}

        {matchedConversations.length === 0 && matchedDirectory.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-slate-500">No matches.</p>
        )}
      </div>
    </Modal>
  );
}
