'use client';

import { useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import Modal from '../ui/Modal';
import Avatar from './Avatar';
import { type AcpdDirectoryUser } from '../../lib/acpdMessagingClient';

interface NewMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  directory: AcpdDirectoryUser[];
  /** Start a conversation with the selected people (one → DM, more → group). */
  onStart: (userIds: string[]) => Promise<void>;
}

export default function NewMessageModal({ isOpen, onClose, directory, onStart }: NewMessageModalProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [directory, query]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => {
    setSelected(new Set());
    setQuery('');
  };

  const handleStart = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    await onStart(Array.from(selected));
    setBusy(false);
    reset();
    onClose();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const count = selected.size;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New message" size="md">
      <p className="mb-3 text-[13px] text-slate-400">
        Pick one person for a direct message, or several to start a group.
      </p>

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

      <div className="max-h-72 space-y-0.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-slate-500">
            {directory.length === 0 ? 'No other ACPDs to message yet.' : 'No directors match that search.'}
          </p>
        ) : (
          filtered.map((u) => {
            const checked = selected.has(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
              >
                <Avatar name={u.name} seed={u.id} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-slate-100">{u.name}</p>
                  <p className="truncate text-[12px] text-slate-500">{u.email}</p>
                </div>
                <span
                  className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border transition-colors ${
                    checked ? 'border-vc-500 bg-vc-500 text-white' : 'border-white/20'
                  }`}
                >
                  {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
        <span className="text-[12.5px] text-slate-500">
          {count === 0 ? 'No one selected' : count === 1 ? '1 person · direct message' : `${count} people · group`}
        </span>
        <button
          type="button"
          onClick={handleStart}
          disabled={count === 0 || busy}
          className="rounded-xl bg-vc-fab px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
        >
          {busy ? 'Starting…' : 'Start conversation'}
        </button>
      </div>
    </Modal>
  );
}
