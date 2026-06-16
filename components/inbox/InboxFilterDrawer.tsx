'use client';

import { useEffect } from 'react';
import { Check, X } from 'lucide-react';
import NotificationIcon from './NotificationIcon';
import { NOTIFICATION_TYPE_META, type NotificationType } from '../../lib/notificationsClient';

const TYPES: NotificationType[] = [
  'message',
  'card_assignment',
  'card_comment',
  'board_share',
  'notebook_share',
  'birthday',
  'follow_up',
];

interface InboxFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selected: Set<NotificationType>;
  onToggle: (type: NotificationType) => void;
  onClear: () => void;
}

// Bottom-sheet drawer for picking which notification types to show. Multi-select
// via checkboxes; no selection means every type is shown.
export default function InboxFilterDrawer({
  isOpen,
  onClose,
  selected,
  onToggle,
  onClear,
}: InboxFilterDrawerProps) {
  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <div
      className={`fixed inset-0 z-[10010] transition-opacity duration-300 ${
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        role="dialog"
        aria-label="Filter notifications"
        className={`absolute inset-x-0 bottom-0 mx-auto max-w-2xl rounded-t-3xl border-t border-white/[0.08] bg-[#15171d] shadow-2xl shadow-black/50 transition-transform duration-300 ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {/* Grab handle */}
        <div className="flex justify-center pt-3">
          <div className="h-1 w-10 rounded-full bg-white/15" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-[15px] font-semibold text-white">Filter by type</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClear}
              disabled={selected.size === 0}
              className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        {/* Type rows */}
        <div className="max-h-[60vh] overflow-y-auto px-3 pb-4">
          {TYPES.map((t) => {
            const checked = selected.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => onToggle(t)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <NotificationIcon type={t} />
                <span className="flex-1 text-[14px] font-medium text-slate-200">
                  {NOTIFICATION_TYPE_META[t].label}
                </span>
                <span
                  className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border transition-colors ${
                    checked ? 'border-vc-500 bg-vc-500 text-white' : 'border-white/20 bg-transparent'
                  }`}
                >
                  {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
