'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Share2,
  CheckCircle2,
  Calendar,
  ExternalLink,
  Check,
  X,
} from 'lucide-react';
import { PrayerSessionLog, PrayerKind } from '../../lib/supabase';
import PrayerSessionLogList from './PrayerSessionLogList';

function formatRelativeDay(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  }
  if (diffDays < 0 && diffDays > -30) return `${Math.abs(diffDays)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeAgoFromTimestamp(ts: string) {
  const now = new Date();
  const d = new Date(ts);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function isOverdue(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  return d.getTime() < today.getTime();
}

export interface PrayerRowData {
  id: number;
  content: string;
  user_id: string;
  is_shared: boolean;
  pray_date?: string | null;
  created_at: string;
  // Leader-only
  leader_id?: number;
  leader_name?: string;
  leader_campus?: string;
  leader_acpd?: string;
}

interface PrayerRowProps {
  kind: PrayerKind;
  data: PrayerRowData;
  isOwner: boolean;
  currentUserId: string | null;
  logs: PrayerSessionLog[];
  draftLogId: number | null;
  onContentSave: (id: number, content: string) => Promise<void> | void;
  onDelete: (id: number) => Promise<void> | void;
  onShareToggle: (id: number, next: boolean) => Promise<void> | void;
  onAnswered: (id: number) => Promise<void> | void;
  onDueDateSave: (id: number, due: string | null) => Promise<void> | void;
  onLogPrayer: (id: number) => Promise<void> | void;
  onLogNoteSave: (logId: number, note: string) => Promise<void> | void;
  onLogDelete: (logId: number) => Promise<void> | void;
  onDraftDismiss: () => void;
}

export default function PrayerRow({
  kind,
  data,
  isOwner,
  currentUserId,
  logs,
  draftLogId,
  onContentSave,
  onDelete,
  onShareToggle,
  onAnswered,
  onDueDateSave,
  onLogPrayer,
  onLogNoteSave,
  onLogDelete,
  onDraftDismiss,
}: PrayerRowProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(data.content);
  const [showDueEditor, setShowDueEditor] = useState(false);
  const [dueValue, setDueValue] = useState(data.pray_date || '');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Auto-open history when a new draft log appears
  useEffect(() => {
    if (draftLogId) setHistoryOpen(true);
  }, [draftLogId]);

  const sessionCount = logs.length;
  const lastLog = logs[0];

  const handleSaveEdit = async () => {
    if (!editText.trim()) return;
    await onContentSave(data.id, editText.trim());
    setEditing(false);
  };

  const handleSaveDue = async () => {
    await onDueDateSave(data.id, dueValue || null);
    setShowDueEditor(false);
  };

  const handleClearDue = async () => {
    setDueValue('');
    await onDueDateSave(data.id, null);
    setShowDueEditor(false);
  };

  const handleDeleteClick = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    await onDelete(data.id);
    setConfirmDelete(false);
    setMenuOpen(false);
  };

  return (
    <div className="group py-4 border-b border-white/[0.05]">
      {/* Header line: leader name (leader only) + due date */}
      {kind === 'leader' && data.leader_name && (
        <div className="flex items-baseline gap-2 mb-1 min-w-0">
          <Link
            href={`/circle/${data.leader_id}`}
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors truncate"
          >
            {data.leader_name}
          </Link>
          {data.leader_campus && (
            <span className="text-xs text-slate-500 truncate">· {data.leader_campus}</span>
          )}
          {data.pray_date && (
            <span
              className={`ml-auto flex-shrink-0 text-xs ${
                isOverdue(data.pray_date) ? 'text-rose-400' : 'text-amber-300/80'
              }`}
            >
              Due {formatRelativeDay(data.pray_date)}
            </span>
          )}
        </div>
      )}

      {kind === 'general' && data.pray_date && (
        <div className="flex justify-end mb-1">
          <span
            className={`text-xs ${
              isOverdue(data.pray_date) ? 'text-rose-400' : 'text-amber-300/80'
            }`}
          >
            Due {formatRelativeDay(data.pray_date)}
          </span>
        </div>
      )}

      {/* Body */}
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveEdit();
              }
              if (e.key === 'Escape') {
                setEditText(data.content);
                setEditing(false);
              }
            }}
            rows={2}
            autoFocus
            className="w-full rounded-xl px-3 py-2.5 text-[15px] text-slate-100 resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveEdit}
              disabled={!editText.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold bg-vc-500/15 text-vc-300 ring-1 ring-vc-500/25 hover:bg-vc-500/25 active:scale-95 transition disabled:opacity-30 disabled:hover:bg-vc-500/15"
            >
              <Check strokeWidth={2} className="w-3.5 h-3.5" /> Save
            </button>
            <button
              onClick={() => {
                setEditText(data.content);
                setEditing(false);
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium text-slate-400 ring-1 ring-white/[0.1] hover:text-white hover:bg-white/[0.06] active:scale-95 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[15px] text-slate-100 leading-relaxed whitespace-pre-wrap">
          {data.content}
        </p>
      )}

      {/* Due date editor */}
      {showDueEditor && isOwner && !editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            value={dueValue}
            onChange={(e) => setDueValue(e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
          />
          <button
            onClick={handleSaveDue}
            className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-vc-500/15 text-vc-300 ring-1 ring-vc-500/25 hover:bg-vc-500/25 active:scale-95 transition"
          >
            <Check strokeWidth={2} className="w-3.5 h-3.5" /> Save
          </button>
          {data.pray_date && (
            <button
              onClick={handleClearDue}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 ring-1 ring-white/[0.1] hover:text-rose-300 hover:bg-rose-500/10 active:scale-95 transition"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => {
              setDueValue(data.pray_date || '');
              setShowDueEditor(false);
            }}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 ring-1 ring-white/[0.1] hover:text-white hover:bg-white/[0.06] active:scale-95 transition"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Meta + actions */}
      {!editing && (
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap min-w-0">
            {sessionCount > 0 && lastLog ? (
              <>
                <span>Last prayed {timeAgoFromTimestamp(lastLog.created_at)}</span>
                <span className="text-slate-700">·</span>
                <span>
                  {sessionCount} session{sessionCount === 1 ? '' : 's'}
                </span>
                <span className="text-slate-700">·</span>
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="text-slate-400 hover:text-slate-200 transition-colors underline-offset-2 hover:underline"
                >
                  {historyOpen ? 'Hide history' : 'View history'}
                </button>
              </>
            ) : (
              <span className="text-slate-600">No prayer sessions yet</span>
            )}
            {data.is_shared && !isOwner && (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-slate-500">Shared</span>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            {isOwner && (
              <button
                onClick={() => onLogPrayer(data.id)}
                className="inline-flex items-center justify-center rounded-full px-3.5 py-2 text-xs font-semibold bg-vc-500/15 text-vc-300 ring-1 ring-vc-500/25 hover:bg-vc-500/25 active:scale-95 transition"
              >
                Pray
              </button>
            )}

            {/* Always-visible quick actions */}
            {isOwner && (
              <button
                onClick={() => setEditing(true)}
                className="h-8 w-8 flex items-center justify-center rounded-lg ring-1 ring-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.06] active:scale-95 transition"
                aria-label="Edit prayer"
              >
                <Pencil strokeWidth={1.8} className="w-4 h-4" />
              </button>
            )}
            {isOwner && (
              <button
                onClick={() => {
                  setDueValue(data.pray_date || '');
                  setShowDueEditor(true);
                }}
                className={`h-8 w-8 flex items-center justify-center rounded-lg ring-1 active:scale-95 transition ${
                  data.pray_date
                    ? 'text-amber-300 ring-amber-300/30 bg-amber-300/10 hover:bg-amber-300/15'
                    : 'text-slate-400 ring-white/[0.08] hover:text-white hover:bg-white/[0.06]'
                }`}
                aria-label="Set due date"
              >
                <Calendar strokeWidth={1.8} className="w-4 h-4" />
              </button>
            )}

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="h-8 w-8 flex items-center justify-center rounded-lg ring-1 ring-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.06] active:scale-95 transition"
                aria-label="More actions"
              >
                <MoreHorizontal strokeWidth={1.8} className="w-4 h-4" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 min-w-[200px] rounded-lg bg-[#1a1c22] border border-white/[0.1] shadow-xl py-1">
                  {isOwner && (
                    <>
                      <button
                        onClick={() => {
                          setEditing(true);
                          setMenuOpen(false);
                        }}
                        className="w-full min-h-[44px] flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left sm:hidden"
                      >
                        <Pencil strokeWidth={1.5} className="w-4 h-4 text-slate-500" />
                        Edit prayer
                      </button>
                      <button
                        onClick={() => {
                          setDueValue(data.pray_date || '');
                          setShowDueEditor(true);
                          setMenuOpen(false);
                        }}
                        className="w-full min-h-[44px] flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
                      >
                        <Calendar strokeWidth={1.5} className="w-4 h-4 text-slate-500" />
                        {data.pray_date ? 'Edit due date' : 'Set due date'}
                      </button>
                      <button
                        onClick={() => {
                          onShareToggle(data.id, !data.is_shared);
                          setMenuOpen(false);
                        }}
                        className="w-full min-h-[44px] flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
                      >
                        <Share2 strokeWidth={1.5} className="w-4 h-4 text-slate-500" />
                        {data.is_shared ? 'Make private' : 'Share with team'}
                      </button>
                      <button
                        onClick={() => {
                          onAnswered(data.id);
                          setMenuOpen(false);
                        }}
                        className="w-full min-h-[44px] flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
                      >
                        <CheckCircle2 strokeWidth={1.5} className="w-4 h-4 text-slate-500" />
                        Mark answered
                      </button>
                    </>
                  )}
                  {kind === 'leader' && data.leader_id && (
                    <Link
                      href={`/circle/${data.leader_id}`}
                      onClick={() => setMenuOpen(false)}
                      className="w-full min-h-[44px] flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                    >
                      <ExternalLink strokeWidth={1.5} className="w-4 h-4 text-slate-500" />
                      Open in Radius
                    </Link>
                  )}
                  {isOwner && (
                    <button
                      onClick={handleDeleteClick}
                      className={`w-full min-h-[44px] flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors text-left ${
                        confirmDelete
                          ? 'text-rose-300 bg-rose-500/10'
                          : 'text-slate-300 hover:bg-white/[0.06] hover:text-rose-300'
                      }`}
                    >
                      <Trash2 strokeWidth={1.5} className="w-4 h-4" />
                      {confirmDelete ? 'Tap again to delete' : 'Delete prayer'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {historyOpen && (
        <PrayerSessionLogList
          logs={logs}
          draftLogId={draftLogId}
          isOwnerOf={(log) => !!currentUserId && log.user_id === currentUserId}
          onNoteSave={onLogNoteSave}
          onDelete={onLogDelete}
          onDraftDismiss={onDraftDismiss}
        />
      )}
    </div>
  );
}
