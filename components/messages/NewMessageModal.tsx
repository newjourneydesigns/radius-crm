'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import Modal from '../ui/Modal';
import Avatar from './Avatar';
import { type AcpdDirectoryUser } from '../../lib/acpdMessagingClient';

interface NewMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  directory: AcpdDirectoryUser[];
  onStartDm: (userId: string) => Promise<void>;
}

export default function NewMessageModal({ isOpen, onClose, directory, onStartDm }: NewMessageModalProps) {
  const [query, setQuery] = useState('');
  const [startingId, setStartingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [directory, query]);

  const handlePick = async (userId: string) => {
    setStartingId(userId);
    await onStartDm(userId);
    setStartingId(null);
    setQuery('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New message" size="md">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search directors…"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-vc-500/40 focus:outline-none focus:ring-1 focus:ring-vc-500/30"
        />
      </div>

      <div className="max-h-80 space-y-0.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-slate-500">
            {directory.length === 0 ? 'No other ACPDs to message yet.' : 'No directors match that search.'}
          </p>
        ) : (
          filtered.map((u) => (
            <button
              key={u.id}
              type="button"
              disabled={startingId !== null}
              onClick={() => handlePick(u.id)}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05] disabled:opacity-50"
            >
              <Avatar name={u.name} seed={u.id} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-slate-100">{u.name}</p>
                <p className="truncate text-[12px] text-slate-500">{u.email}</p>
              </div>
              {startingId === u.id && <span className="text-[12px] text-slate-500">Opening…</span>}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
