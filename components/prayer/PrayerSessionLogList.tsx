'use client';

import { useState, useEffect } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { PrayerSessionLog } from '../../lib/supabase';

function formatLogDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface PrayerSessionLogListProps {
  logs: PrayerSessionLog[];
  draftLogId: number | null;
  isOwnerOf: (log: PrayerSessionLog) => boolean;
  onNoteSave: (logId: number, note: string) => Promise<void> | void;
  onDelete: (logId: number) => Promise<void> | void;
  onDraftDismiss: () => void;
}

export default function PrayerSessionLogList({
  logs,
  draftLogId,
  isOwnerOf,
  onNoteSave,
  onDelete,
  onDraftDismiss,
}: PrayerSessionLogListProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  // Auto-edit any newly created draft log
  useEffect(() => {
    if (draftLogId && editingId !== draftLogId) {
      setEditingId(draftLogId);
      setEditValue('');
    }
  }, [draftLogId, editingId]);

  const handleBlur = (log: PrayerSessionLog) => {
    const trimmed = editValue.trim();
    const original = log.note ?? '';
    if (trimmed !== original.trim()) {
      // Fire-and-forget — parent does optimistic update
      void onNoteSave(log.id, trimmed);
    }
    setEditingId(null);
    setEditValue('');
    if (draftLogId === log.id) onDraftDismiss();
  };

  const handleDelete = (logId: number) => {
    void onDelete(logId);
  };

  if (logs.length === 0) return null;

  return (
    <ul className="mt-2 pl-3 border-l border-white/[0.06] space-y-2.5">
      {logs.map((log) => {
        const owned = isOwnerOf(log);
        const isEditing = editingId === log.id;

        return (
          <li key={log.id} className="text-sm">
            <div className="flex items-baseline gap-2 text-xs text-slate-500">
              <span>{formatLogDate(log.prayed_on)}</span>
              {owned && !isEditing && (
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(log.id);
                      setEditValue(log.note ?? '');
                    }}
                    className="h-8 w-8 flex items-center justify-center rounded-lg ring-1 ring-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.06] active:scale-95 transition"
                    aria-label="Edit note"
                  >
                    <Pencil strokeWidth={1.5} className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(log.id)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg ring-1 ring-white/[0.08] text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 active:scale-95 transition"
                    aria-label="Delete log"
                  >
                    <Trash2 strokeWidth={1.5} className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="mt-1">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleBlur(log)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setEditingId(null);
                      setEditValue('');
                      if (draftLogId === log.id) onDraftDismiss();
                    }
                  }}
                  placeholder="Add a note about this prayer time (optional)"
                  rows={2}
                  autoFocus
                  className="w-full rounded-xl px-3 py-2 text-[14px] text-slate-200 placeholder-slate-500 resize-none"
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => handleBlur(log)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold bg-vc-500/15 text-vc-300 ring-1 ring-vc-500/25 hover:bg-vc-500/25 active:scale-95 transition"
                  >
                    <Check strokeWidth={2} className="w-3.5 h-3.5" /> Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setEditValue('');
                      if (draftLogId === log.id) onDraftDismiss();
                    }}
                    className="inline-flex items-center justify-center rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-400 ring-1 ring-white/[0.1] hover:text-white hover:bg-white/[0.06] active:scale-95 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : log.note ? (
              <p className="mt-0.5 text-[14px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                {log.note}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
