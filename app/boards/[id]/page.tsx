'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useProjectBoard, FullBoard } from '../../../hooks/useProjectBoard';
import { useAuth } from '../../../contexts/AuthContext';
import ProtectedRoute from '../../../components/ProtectedRoute';
import type { BoardCard, BoardColumn, BoardLabel, BoardMember, CardChecklistGroup, CardPriority, ChecklistTemplate, ColumnAutomationAction, ProjectBoard } from '../../../lib/supabase';
import {
  Plus, ArrowLeft, Search, MoreHorizontal, Trash2, Edit3,
  GripVertical, MessageSquare, CheckSquare, CalendarDays, Tag,
  X, ChevronDown, ChevronLeft, ChevronRight, Clock, User, Flag, AlertCircle, Pencil,
  FolderKanban, Check, Globe, Lock, StickyNote, UserPlus, Download, Copy,
  Zap, ArrowDownAZ, ArrowUpZA, Bold, Italic, Underline, Strikethrough,
  LinkIcon, ExternalLink, Heading, ListBullet, ListOrdered, SlidersHorizontal, Repeat2,
  LayoutDashboard, ChevronsLeft, Circle, Star, ArrowUpRight, Archive,
} from '../../../components/icons/BoardIcons';
import { supabase } from '../../../lib/supabase';
import type { CircleLeader } from '../../../lib/supabase';
import { buildRepeatLabel, type TodoRepeatRule } from '../../../lib/todoRecurrence';
import { DateTime } from 'luxon';
import AssigneePicker from '../../../components/boards/AssigneePicker';
import RichTextEditor from '../../../components/notes/RichTextEditor';
import DictateAndSummarize from '../../../components/notes/DictateAndSummarize';
import { extractTextContacts, type TextContact } from '../../../lib/textContacts';
import { CardDetailModal, PRIORITY_CONFIG, formatTimeAmPm } from '../../../components/boards/CardDetailModal';
import { kanbanStyles } from '../../../components/boards/kanbanStyles';

/* ═══════════════════════════════════════════════════════════
   Column color palette — each column gets a distinct color
   ═══════════════════════════════════════════════════════════ */
const COLUMN_COLORS = [
  '#6366f1', // indigo
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#3b82f6', // blue
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#e11d48', // rose
];


/* ── Time formatting helper ── */
const formatTime12 = (t?: string) => {
  if (!t) return '';
  const m = t.match(/^(\d{1,2}):?(\d{2})?$/);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const min = m[2] || '00';
  if (h === 0) return `12:${min} AM`;
  if (h === 12) return `12:${min} PM`;
  if (h > 12) return `${h - 12}:${min} PM`;
  return `${h}:${min} AM`;
};

/* ═══════════════════════════════════════════════════════════
   Inline Editable Title (double-click to edit)
   ═══════════════════════════════════════════════════════════ */
function InlineEdit({ value, onSave, className }: { value: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
    else setDraft(value);
  };

  if (!editing) {
    return (
      <span
        className={className}
        onDoubleClick={() => { setDraft(value); setEditing(true); }}
        title="Double-click to edit"
        style={{ cursor: 'text' }}
      >
        {value}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      className="kb-inline-edit"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
    />
  );
}


function DueDateQuickPicker({
  dueDate,
  onSave,
  onClose,
}: {
  dueDate: string | null;
  onSave: (dueDate: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    input.focus();
    requestAnimationFrame(() => {
      try {
        input.showPicker?.();
      } catch {
        // Safari and Chromium can reject showPicker when the call no longer has a user gesture.
      }
    });
  }, []);

  const handleChange = async (value: string) => {
    setSaving(true);
    try {
      await onSave(value || null);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setSaving(true);
    try {
      await onSave(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="kb-card-due-picker" onClick={e => e.stopPropagation()}>
      <div className="kb-card-due-picker-label">Due date</div>
      <div className="kb-card-due-picker-row">
        <input
          ref={inputRef}
          className="kb-card-due-picker-input"
          type="date"
          defaultValue={dueDate || ''}
          onChange={e => void handleChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          disabled={saving}
        />
        {dueDate && (
          <button
            className="kb-btn kb-btn-ghost kb-btn-sm"
            type="button"
            onClick={e => void handleClear(e)}
            disabled={saving}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/* Next business day (Mon–Thu). Advances from the given date,
   or from today when no date is set. */
function nextBusinessDay(fromDate: string | null | undefined): string {
  const base = fromDate ? DateTime.fromISO(fromDate) : DateTime.now().startOf('day');
  let next = base.plus({ days: 1 });
  while (next.weekday > 4) {
    next = next.plus({ days: 1 });
  }
  return next.toISODate()!;
}

/* ═══════════════════════════════════════════════════════════
   KanbanCard
   ═══════════════════════════════════════════════════════════ */
function KanbanCard({
  card,
  onClick,
  isDragging,
  onToggleComplete,
  onSnooze,
}: {
  card: BoardCard;
  onClick: () => void;
  isDragging?: boolean;
  onToggleComplete: () => void;
  onSnooze: () => void;
}) {
  const pri = PRIORITY_CONFIG[card.priority] || PRIORITY_CONFIG.medium;
  const labels = card.labels || [];
  const comments = card.comments || [];
  const checklists = card.checklists || [];
  const completedCount = checklists.filter(c => c.is_completed).length;
  const todayStr = new Date().toISOString().split('T')[0];
  const incompleteWithDue = checklists.filter(c => !c.is_completed && c.due_date);
  const checklistOverdue = incompleteWithDue.filter(c => c.due_date! < todayStr).length;
  const checklistDueToday = incompleteWithDue.filter(c => c.due_date === todayStr).length;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dueDate = card.due_date ? new Date(card.due_date + 'T00:00:00') : null;
  const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / 86400000) : null;
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
  const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 2;

  const handleCompleteToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleComplete();
  };

  return (
    <div
      className={`kb-card ${isDragging ? 'dragging' : ''} ${card.is_complete ? 'kb-card-complete' : ''}`}
      onClick={onClick}
      draggable
    >
      {/* Labels */}
      {labels.length > 0 && (
        <div className="kb-card-labels">
          {labels.map(l => (
            <span key={l.id} className="kb-card-label" style={{ background: l.color }} title={l.name}>
              {l.name}
            </span>
          ))}
        </div>
      )}

      {/* Title with complete checkbox */}
      <div className="kb-card-title-row">
        <button
          className={`kb-card-complete-btn ${card.is_complete ? 'checked' : ''}`}
          onClick={handleCompleteToggle}
          title={card.is_complete ? 'Mark incomplete' : 'Mark complete'}
        >
          {card.is_complete ? <Check size={10} /> : null}
        </button>
        <p className={`kb-card-title ${card.is_complete ? 'completed' : ''}`}>{card.title}</p>
      </div>

      {/* Schedule — date/time on its own row with the snooze button directly beneath it */}
      {(card.start_date || card.due_date) && (
        <div className="kb-card-schedule">
          <span className={`kb-card-dates ${isOverdue ? 'overdue' : ''} ${isDueSoon ? 'due-soon' : ''}`}>
            <CalendarDays size={10} />
            {card.start_date && (
              <span>{new Date(card.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            )}
            {card.start_date && card.due_date && <span className="kb-card-date-sep">→</span>}
            {card.due_date && (
              <span>
                {isOverdue ? 'Overdue' : isDueSoon ? (daysUntilDue === 0 ? 'Today' : daysUntilDue === 1 ? 'Tomorrow' : 'In 2 days') : new Date(card.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {card.due_time && ` · ${formatTimeAmPm(card.due_time)} Central`}
              </span>
            )}
          </span>

          {/* Snooze to next business day */}
          {(isOverdue || daysUntilDue === 0) && (
            <button
              className="kb-card-snooze"
              onClick={(e) => { e.stopPropagation(); onSnooze(); }}
              title="Snooze to next business day (Mon–Thu)"
            >
              <Clock size={10} /> Snooze
            </button>
          )}
        </div>
      )}

      {/* Metadata row */}
      <div className="kb-card-meta">
        {/* Repeat indicator */}
        {card.repeat_rule && card.repeat_rule !== 'none' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#33B233', fontSize: 10 }} title={
            card.repeat_rule === 'daily' && card.repeat_days?.length
              ? `Repeats on ${card.repeat_days.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}`
              : buildRepeatLabel((card.repeat_rule as TodoRepeatRule), card.repeat_interval || 1)
          }>
            <Repeat2 size={10} />
          </span>
        )}

        {/* Focus indicator */}
        {card.is_focused && (
          <span title="Focus card" style={{ display: 'inline-flex', alignItems: 'center', color: '#f59e0b' }}>
            <Star size={11} />
          </span>
        )}

        {/* Right side: comment/checklist counts */}
        <span className="kb-card-counts">
          {comments.length > 0 && (
            <span className="kb-card-count"><MessageSquare size={10} /> {comments.length}</span>
          )}
          {checklists.length > 0 && (
            <span className={`kb-card-count ${completedCount === checklists.length ? 'done' : ''} ${checklistOverdue > 0 ? 'overdue' : checklistDueToday > 0 ? 'due-today' : ''}`}>
              <CheckSquare size={10} /> {completedCount}/{checklists.length}
              {checklistOverdue > 0 && <span className="kb-card-cl-badge overdue" title={`${checklistOverdue} overdue`}>{checklistOverdue} overdue</span>}
              {checklistOverdue === 0 && checklistDueToday > 0 && <span className="kb-card-cl-badge due-today" title={`${checklistDueToday} due today`}>{checklistDueToday} today</span>}
            </span>
          )}
        </span>
      </div>

      {/* Assignees */}
      {(card.assignments || []).length > 0 && (
        <div className="kb-card-assignee">
          <User size={10} />
          {(card.assignments || []).map(a => a.users?.name || 'Unknown').join(', ')}
        </div>
      )}

      {/* Linked Circle Leader */}
      {card.linked_leader_id && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10, color: '#56c93f' }}>
          <LinkIcon size={9} />
          <span>Circle Leader</span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Label Manager Modal
   ═══════════════════════════════════════════════════════════ */
const LABEL_COLORS: { hex: string; name: string }[] = [
  { hex: '#ef4444', name: 'Red' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#f59e0b', name: 'Amber' },
  { hex: '#eab308', name: 'Yellow' },
  { hex: '#84cc16', name: 'Lime' },
  { hex: '#22c55e', name: 'Green' },
  { hex: '#14b8a6', name: 'Teal' },
  { hex: '#06b6d4', name: 'Cyan' },
  { hex: '#0ea5e9', name: 'Sky' },
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#6366f1', name: 'Indigo' },
  { hex: '#8b5cf6', name: 'Violet' },
  { hex: '#a855f7', name: 'Purple' },
  { hex: '#d946ef', name: 'Fuchsia' },
  { hex: '#ec4899', name: 'Pink' },
  { hex: '#f43f5e', name: 'Rose' },
  { hex: '#78716c', name: 'Stone' },
  { hex: '#71717a', name: 'Slate' },
];

function LabelManagerModal({
  board,
  onAddLabel,
  onUpdateLabel,
  onDeleteLabel,
  onClose,
}: {
  board: FullBoard;
  onAddLabel: (boardId: string, name: string, color: string) => Promise<any>;
  onUpdateLabel: (boardId: string, labelId: string, updates: { name?: string; color?: string }) => Promise<any>;
  onDeleteLabel: (boardId: string, labelId: string) => Promise<any>;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [showNewColorPicker, setShowNewColorPicker] = useState(false);
  const [showEditColorPicker, setShowEditColorPicker] = useState(false);
  const newNameRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await onAddLabel(board.id, newName.trim(), newColor);
    setNewName('');
    setNewColor('#3b82f6');
    setShowNewColorPicker(false);
  };

  const startEdit = (label: BoardLabel) => {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
    setShowEditColorPicker(false);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await onUpdateLabel(board.id, editingId, { name: editName.trim(), color: editColor });
    setEditingId(null);
    setShowEditColorPicker(false);
  };

  const handleDelete = async (labelId: string, labelName: string) => {
    if (!confirm(`Delete label "${labelName}"? It will be removed from all cards.`)) return;
    await onDeleteLabel(board.id, labelId);
    if (editingId === labelId) setEditingId(null);
  };

  return (
    <div className="kb-modal-overlay" onClick={onClose}>
      <div className="kb-lm-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="kb-lm-header">
          <div className="kb-lm-header-title">
            <Tag size={16} />
            Manage Labels
          </div>
          <button className="kb-detail-close" onClick={onClose} style={{ position: 'static' }}>
            <X size={18} />
          </button>
        </div>

        {/* Create new label */}
        <div className="kb-lm-create">
          <div className="kb-lm-create-row">
            <button
              className="kb-lm-color-btn"
              style={{ '--swatch-color': newColor } as React.CSSProperties}
              onClick={() => setShowNewColorPicker(!showNewColorPicker)}
              title="Pick color"
            />
            <input
              ref={newNameRef}
              className="kb-input"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="New label name..."
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              style={{ flex: 1 }}
            />
            <button
              className="kb-btn kb-btn-primary kb-btn-sm"
              onClick={handleCreate}
              disabled={!newName.trim()}
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {showNewColorPicker && (
            <div className="kb-lm-color-grid">
              {LABEL_COLORS.map(c => (
                <button
                  key={c.hex}
                  className={`kb-lm-color-swatch ${newColor === c.hex ? 'active' : ''}`}
                  style={{ '--swatch-color': c.hex } as React.CSSProperties}
                  onClick={() => { setNewColor(c.hex); setShowNewColorPicker(false); }}
                  title={c.name}
                >
                  {newColor === c.hex && <Check size={10} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Label list */}
        <div className="kb-lm-list">
          {board.labels.length === 0 && (
            <div className="kb-lm-empty">No labels yet. Create one above!</div>
          )}
          {(() => {
            const sorted = [...board.labels].sort((a, b) => a.name.localeCompare(b.name));
            const shortcutMap = new Map(sorted.map((l, i) => [l.id, i < 10 ? (i === 9 ? '0' : String(i + 1)) : null]));
            return sorted.map(label => (
            <div key={label.id} className="kb-lm-item">
              {editingId === label.id ? (
                /* Editing mode */
                <div className="kb-lm-edit-row">
                  <button
                    className="kb-lm-color-btn"
                    style={{ '--swatch-color': editColor } as React.CSSProperties}
                    onClick={() => setShowEditColorPicker(!showEditColorPicker)}
                    title="Pick color"
                  />
                  <input
                    className="kb-input"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveEdit();
                      if (e.key === 'Escape') { setEditingId(null); setShowEditColorPicker(false); }
                    }}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <button className="kb-btn kb-btn-primary kb-btn-sm" onClick={handleSaveEdit}>
                    <Check size={14} />
                  </button>
                  <button className="kb-btn-icon-sm" onClick={() => { setEditingId(null); setShowEditColorPicker(false); }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                /* Display mode */
                <div className="kb-lm-display-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {shortcutMap.get(label.id) && (
                      <kbd style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', flexShrink: 0 }}>
                        {shortcutMap.get(label.id)}
                      </kbd>
                    )}
                    <span className="kb-lm-label-preview" style={{ background: label.color + '22', color: label.color, borderColor: label.color + '44' }}>
                      <span className="kb-label-dot" style={{ background: label.color }} />
                      {label.name}
                    </span>
                  </div>
                  <div className="kb-lm-item-actions">
                    <button className="kb-btn-icon-sm" onClick={() => startEdit(label)} title="Edit label">
                      <Pencil size={13} />
                    </button>
                    <button className="kb-btn-icon-sm" onClick={() => handleDelete(label.id, label.name)} title="Delete label">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
              {editingId === label.id && showEditColorPicker && (
                <div className="kb-lm-color-grid" style={{ marginTop: 8 }}>
                  {LABEL_COLORS.map(c => (
                    <button
                      key={c.hex}
                      className={`kb-lm-color-swatch ${editColor === c.hex ? 'active' : ''}`}
                      style={{ '--swatch-color': c.hex } as React.CSSProperties}
                      onClick={() => { setEditColor(c.hex); setShowEditColorPicker(false); }}
                      title={c.name}
                    >
                      {editColor === c.hex && <Check size={10} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ));
          })()}
        </div>
      </div>
    </div>
  );
}

type SystemUser = { id: string; name: string; email: string };

function BoardShareModal({
  board,
  currentUserId,
  fetchSystemUsers,
  fetchBoardMembers,
  shareBoardWithUsers,
  unshareBoardUser,
  updateBoard,
  onClose,
}: {
  board: ProjectBoard;
  currentUserId?: string;
  fetchSystemUsers: () => Promise<SystemUser[]>;
  fetchBoardMembers: (boardId: string) => Promise<BoardMember[]>;
  shareBoardWithUsers: (boardId: string, userIds: string[]) => Promise<boolean>;
  unshareBoardUser: (boardId: string, userId: string) => Promise<boolean>;
  updateBoard: (boardId: string, updates: Partial<ProjectBoard>) => Promise<ProjectBoard | null>;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [userRows, memberRows] = await Promise.all([
        fetchSystemUsers(),
        fetchBoardMembers(board.id),
      ]);
      setUsers(userRows);
      setMembers(memberRows);
      setSelected(new Set());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load sharing settings.');
    } finally {
      setLoading(false);
    }
  }, [board.id, fetchBoardMembers, fetchSystemUsers]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const memberIds = useMemo(() => new Set(members.map(member => member.user_id)), [members]);
  const owner = users.find(item => item.id === board.user_id);
  const availableUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter(item => item.id !== board.user_id && !memberIds.has(item.id))
      .filter(item => {
        if (!q) return true;
        return item.name?.toLowerCase().includes(q) || item.email?.toLowerCase().includes(q);
      });
  }, [board.user_id, memberIds, query, users]);

  const toggleUser = (userId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleVisible = () => {
    setSelected(prev => {
      const allSelected = availableUsers.length > 0 && availableUsers.every(item => prev.has(item.id));
      if (allSelected) {
        const next = new Set(prev);
        availableUsers.forEach(item => next.delete(item.id));
        return next;
      }
      const next = new Set(prev);
      availableUsers.forEach(item => next.add(item.id));
      return next;
    });
  };

  const handleShareSelected = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    setError('');
    const ok = await shareBoardWithUsers(board.id, Array.from(selected));
    if (ok) await refresh();
    else setError('Could not share the board with the selected users.');
    setSaving(false);
  };

  const handleRemoveMember = async (userId: string) => {
    setSaving(true);
    setError('');
    const ok = await unshareBoardUser(board.id, userId);
    if (ok) await refresh();
    else setError('Could not remove that user from the board.');
    setSaving(false);
  };

  const handleEveryoneToggle = async () => {
    setSaving(true);
    setError('');
    const updated = await updateBoard(board.id, { is_public: !board.is_public });
    if (!updated) setError('Could not update everyone access.');
    setSaving(false);
  };

  return (
    <div className="kb-modal-overlay" onClick={onClose}>
      <div className="kb-share-modal" onClick={e => e.stopPropagation()}>
        <div className="kb-import-header">
          <div className="kb-share-title">
            <UserPlus size={18} style={{ color: '#56c93f' }} />
            <div>
              <h3 className="kb-import-title">Share Board</h3>
              <span>{board.title}</span>
            </div>
          </div>
          <button className="kb-btn-icon-sm" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="kb-share-body">
          <button
            type="button"
            className={`kb-share-everyone ${board.is_public ? 'active' : ''}`}
            onClick={handleEveryoneToggle}
            disabled={saving}
          >
            <div className="kb-share-everyone-icon">
              {board.is_public ? <Globe size={18} /> : <Lock size={18} />}
            </div>
            <div>
              <strong>{board.is_public ? 'Shared with everyone' : 'Private or selected people only'}</strong>
              <span>Everyone access gives all Radius users full board admin rights.</span>
            </div>
            <span className="kb-share-switch">{board.is_public ? 'On' : 'Off'}</span>
          </button>

          <div className="kb-share-section">
            <div className="kb-share-section-header">
              <span>People with access</span>
              <span>{members.length + 1}</span>
            </div>
            <div className="kb-share-member-list">
              <div className="kb-share-member-row">
                <div className="kb-share-avatar"><User size={14} /></div>
                <div className="kb-share-person">
                  <strong>{owner?.name || (board.user_id === currentUserId ? 'You' : 'Board owner')}</strong>
                  <span>{owner?.email || 'Owner'}</span>
                </div>
                <span className="kb-share-role">Owner</span>
              </div>
              {members.map(member => (
                <div key={member.id} className="kb-share-member-row">
                  <div className="kb-share-avatar"><User size={14} /></div>
                  <div className="kb-share-person">
                    <strong>{member.users?.name || (member.user_id === currentUserId ? 'You' : 'Shared user')}</strong>
                    <span>{member.users?.email || 'Full admin'}</span>
                  </div>
                  <button
                    type="button"
                    className="kb-btn kb-btn-ghost kb-btn-sm"
                    onClick={() => handleRemoveMember(member.user_id)}
                    disabled={saving}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="kb-share-section">
            <div className="kb-share-section-header">
              <span>Add people</span>
              <button type="button" className="kb-btn kb-btn-ghost kb-btn-sm" onClick={toggleVisible} disabled={availableUsers.length === 0}>
                {availableUsers.length > 0 && availableUsers.every(item => selected.has(item.id)) ? 'Clear visible' : 'Select visible'}
              </button>
            </div>
            <div className="kb-share-search">
              <Search size={14} />
              <input
                className="kb-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search users..."
              />
            </div>
            <div className="kb-share-user-list">
              {loading ? (
                <div className="kb-import-empty">Loading users...</div>
              ) : availableUsers.length === 0 ? (
                <div className="kb-import-empty">No users available to add</div>
              ) : (
                availableUsers.map(item => (
                  <label key={item.id} className={`kb-share-user-row ${selected.has(item.id) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleUser(item.id)}
                    />
                    <div className="kb-share-person">
                      <strong>{item.name || item.email}</strong>
                      <span>{item.email}</span>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {error && <div className="kb-share-error">{error}</div>}
        </div>

        <div className="kb-import-footer">
          <span className="kb-import-label">
            Selected users get full admin access, including sharing with others.
          </span>
          <button
            type="button"
            className="kb-btn kb-btn-primary kb-btn-sm"
            onClick={handleShareSelected}
            disabled={saving || selected.size === 0}
          >
            <UserPlus size={14} /> Share with {selected.size || 0}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Import Circle Leaders Modal
   ═══════════════════════════════════════════════════════════ */
function ImportLeadersModal({
  board,
  onImport,
  onClose,
}: {
  board: FullBoard;
  onImport: (columnId: string, leaders: CircleLeader[]) => Promise<void>;
  onClose: () => void;
}) {
  const [leaders, setLeaders] = useState<CircleLeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [searchText, setSearchText] = useState('');
  const [targetColumn, setTargetColumn] = useState(board.columns[0]?.id || '');

  // Filter state
  const [filterCampus, setFilterCampus] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCircleType, setFilterCircleType] = useState('');
  const [filterAcpd, setFilterAcpd] = useState('');

  // Unique filter options extracted from loaded data
  const [campuses, setCampuses] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [circleTypes, setCircleTypes] = useState<string[]>([]);
  const [acpds, setAcpds] = useState<string[]>([]);

  // Load leaders + extract filter options
  const fetchLeaders = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('circle_leaders')
        .select('id, name, email, phone, campus, acpd, status, day, time, circle_type')
        .order('name');

      if (filterCampus) q = q.eq('campus', filterCampus);
      if (filterStatus) q = q.eq('status', filterStatus);
      if (filterCircleType) q = q.eq('circle_type', filterCircleType);
      if (filterAcpd) q = q.eq('acpd', filterAcpd);

      const { data, error } = await q;
      if (error) throw error;
      setLeaders(data || []);
      setSelected(new Set());
    } catch {
      setLeaders([]);
    } finally {
      setLoading(false);
    }
  }, [filterCampus, filterStatus, filterCircleType, filterAcpd]);

  // Load filter options on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('circle_leaders')
        .select('campus, acpd, status, circle_type');
      if (data) {
        setCampuses(Array.from(new Set(data.map(d => d.campus).filter(Boolean))).sort());
        setStatuses(Array.from(new Set(data.map(d => d.status).filter(Boolean))).sort());
        setCircleTypes(Array.from(new Set(data.map(d => d.circle_type).filter(Boolean))).sort());
        setAcpds(Array.from(new Set(data.map(d => d.acpd).filter(Boolean))).sort());
      }
    })();
  }, []);

  // Re-fetch when filters change
  useEffect(() => { fetchLeaders(); }, [fetchLeaders]);

  // Name search (client-side on already-filtered set)
  const filtered = searchText
    ? leaders.filter(l => l.name.toLowerCase().includes(searchText.toLowerCase()))
    : leaders;

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(l => l.id)));
  };

  const handleImport = async () => {
    const toImport = filtered.filter(l => selected.has(l.id));
    if (!toImport.length || !targetColumn) return;
    setImporting(true);
    await onImport(targetColumn, toImport);
    setImporting(false);
    onClose();
  };

  return (
    <div className="kb-modal-overlay" onClick={onClose}>
      <div className="kb-import-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="kb-import-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Download size={18} style={{ color: '#56c93f' }} />
            <h3 className="kb-import-title">Import Circle Leaders</h3>
          </div>
          <button className="kb-btn-icon-sm" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Filters */}
        <div className="kb-import-filters">
          <select className="kb-input kb-import-select" value={filterCampus} onChange={e => setFilterCampus(e.target.value)}>
            <option value="">All Campuses</option>
            {campuses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="kb-input kb-import-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="kb-input kb-import-select" value={filterCircleType} onChange={e => setFilterCircleType(e.target.value)}>
            <option value="">All Circle Types</option>
            {circleTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="kb-input kb-import-select" value={filterAcpd} onChange={e => setFilterAcpd(e.target.value)}>
            <option value="">All ACPDs</option>
            {acpds.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Search + select all row */}
        <div className="kb-import-toolbar">
          <div className="kb-search-box" style={{ flex: 1 }}>
            <Search size={13} style={{ color: '#6b7280' }} />
            <input
              className="kb-search-input"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search by name..."
            />
            {searchText && <button className="kb-btn-icon-sm" onClick={() => setSearchText('')}><X size={11} /></button>}
          </div>
          <button className="kb-btn kb-btn-sm kb-btn-ghost" onClick={toggleAll}>
            {selected.size === filtered.length && filtered.length > 0 ? 'Deselect All' : 'Select All'}
          </button>
          <span className="kb-import-count">{selected.size} of {filtered.length} selected</span>
        </div>

        {/* Leader list */}
        <div className="kb-import-list">
          {loading ? (
            <div className="kb-import-empty">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="kb-import-empty">No leaders match the current filters</div>
          ) : (
            filtered.map(leader => (
              <div
                key={leader.id}
                className={`kb-import-row ${selected.has(leader.id) ? 'kb-import-row-selected' : ''}`}
                onClick={() => toggleSelect(leader.id)}
              >
                <div className={`kb-checkbox ${selected.has(leader.id) ? 'checked' : ''}`}>
                  {selected.has(leader.id) && <Check size={11} />}
                </div>
                <div className="kb-import-leader-info">
                  <span className="kb-import-leader-name">{leader.name}</span>
                  <span className="kb-import-leader-meta">
                    {[leader.campus, leader.circle_type, leader.day, formatTime12(leader.time)].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {leader.status && (
                  <span className="kb-import-leader-status">{leader.status}</span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="kb-import-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="kb-import-label">Import into:</label>
            <select className="kb-input kb-import-select" value={targetColumn} onChange={e => setTargetColumn(e.target.value)}>
              {board.columns.map(col => (
                <option key={col.id} value={col.id}>{col.title}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="kb-btn kb-btn-sm" onClick={onClose}>Cancel</button>
            <button
              className="kb-btn kb-btn-primary kb-btn-sm"
              onClick={handleImport}
              disabled={selected.size === 0 || !targetColumn || importing}
            >
              {importing ? 'Importing...' : `Import ${selected.size} Leader${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   List Actions Modal
   ═══════════════════════════════════════════════════════════ */
function ListActionsModal({
  column,
  cards,
  board,
  onUpdateCard,
  onDeleteCard,
  onMoveCard,
  onAddChecklistItem,
  checklistTemplates,
  onApplyTemplate,
  onSortCards,
  onMoveToBoardCards,
  onClose,
}: {
  column: BoardColumn;
  cards: BoardCard[];
  board: FullBoard;
  onUpdateCard: (cardId: string, updates: any) => Promise<void>;
  onDeleteCard: (cardId: string) => Promise<void>;
  onMoveCard: (cardId: string, newColumnId: string) => Promise<void>;
  onAddChecklistItem: (cardId: string, title: string) => Promise<void>;
  checklistTemplates: ChecklistTemplate[];
  onApplyTemplate: (cardId: string, templateId: string) => Promise<void>;
  onSortCards: (columnId: string, direction: 'asc' | 'desc' | 'due_asc' | 'due_desc') => Promise<void>;
  onMoveToBoardCards: (targetBoardId: string, targetColumnId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [bulkDueDate, setBulkDueDate] = useState('');
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [bulkPriority, setBulkPriority] = useState('');
  const [bulkLabel, setBulkLabel] = useState('');
  const [bulkMoveCol, setBulkMoveCol] = useState('');
  const [bulkMoveCompletedCol, setBulkMoveCompletedCol] = useState('');
  const [bulkChecklistItem, setBulkChecklistItem] = useState('');
  const [bulkTemplate, setBulkTemplate] = useState('');
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [allBoards, setAllBoards] = useState<ProjectBoard[]>([]);
  const [bulkTargetBoardId, setBulkTargetBoardId] = useState('');
  const [bulkTargetBoardColumns, setBulkTargetBoardColumns] = useState<{ id: string; title: string }[]>([]);
  const [bulkTargetColumnId, setBulkTargetColumnId] = useState('');

  useEffect(() => {
    supabase.from('users').select('id, name, email').order('name').then(({ data }) => {
      if (data) setUsers(data as { id: string; name: string; email: string }[]);
    });
    supabase.from('project_boards').select('id, title').eq('is_archived', false).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setAllBoards(data as ProjectBoard[]); });
  }, []);

  const handleBulkTargetBoardChange = async (boardId: string) => {
    setBulkTargetBoardId(boardId);
    setBulkTargetColumnId('');
    setBulkTargetBoardColumns([]);
    if (!boardId) return;
    const { data } = await supabase.from('board_columns').select('id, title').eq('board_id', boardId).order('position');
    if (data) {
      setBulkTargetBoardColumns(data);
      if (data.length > 0) setBulkTargetColumnId(data[0].id);
    }
  };

  const otherColumns = board.columns.filter(c => c.id !== column.id);

  const apply = async (label: string, fn: () => Promise<void>, count?: number) => {
    setApplying(true);
    setResult('');
    setConfirmDelete(false);
    try {
      await fn();
      const n = count ?? cards.length;
      setResult(`${label} applied to ${n} card${n !== 1 ? 's' : ''}`);
    } catch {
      setResult('Something went wrong');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="kb-modal-overlay" onClick={onClose}>
      <div className="kb-list-actions-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="kb-import-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="kb-column-dot" style={{ background: column.color }} />
            <h3 className="kb-import-title">List Actions — {column.title}</h3>
            <span className="kb-column-count">{cards.length} cards</span>
          </div>
          <button className="kb-btn-icon-sm" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="kb-list-actions-body">
          {cards.length === 0 ? (
            <div className="kb-import-empty">No cards in this list</div>
          ) : (
            <>
              {/* 1. Set Due Date */}
              <div className="kb-list-action-row">
                <div className="kb-list-action-label"><CalendarDays size={13} /> Set Due Date</div>
                <div className="kb-list-action-controls">
                  <input
                    type="date"
                    className="kb-input"
                    value={bulkDueDate}
                    onChange={e => setBulkDueDate(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="kb-btn kb-btn-primary kb-btn-sm"
                    disabled={!bulkDueDate || applying}
                    onClick={() => apply('Due date', async () => {
                      for (const card of cards) await onUpdateCard(card.id, { due_date: bulkDueDate, due_time: null });
                    })}
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* 2. Strip Due Date */}
              <div className="kb-list-action-row">
                <div className="kb-list-action-label"><CalendarDays size={13} /> Strip Due Date</div>
                <div className="kb-list-action-controls">
                  <button
                    className="kb-btn kb-btn-primary kb-btn-sm"
                    disabled={applying}
                    onClick={() => apply('Strip due date', async () => {
                      for (const card of cards) await onUpdateCard(card.id, { due_date: null, due_time: null });
                    })}
                  >
                    Remove from All
                  </button>
                </div>
              </div>

              {/* 3. Set Assignee */}
              <div className="kb-list-action-row">
                <div className="kb-list-action-label"><User size={13} /> Set Assignee</div>
                <div className="kb-list-action-controls">
                  {users.length > 0 ? (
                    <select
                      className="kb-input kb-import-select"
                      value={bulkAssignee}
                      onChange={e => setBulkAssignee(e.target.value)}
                      style={{ flex: 1 }}
                    >
                      <option value="">Choose a member...</option>
                      {users.map(u => (
                        <option key={u.id} value={u.name}>{u.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="kb-input"
                      value={bulkAssignee}
                      onChange={e => setBulkAssignee(e.target.value)}
                      placeholder="Assignee name..."
                      style={{ flex: 1 }}
                    />
                  )}
                  <button
                    className="kb-btn kb-btn-primary kb-btn-sm"
                    disabled={!bulkAssignee.trim() || applying}
                    onClick={() => apply('Assignee', async () => {
                      for (const card of cards) await onUpdateCard(card.id, { assignee: bulkAssignee.trim() });
                    })}
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* 3. Set Priority */}
              <div className="kb-list-action-row">
                <div className="kb-list-action-label"><Flag size={13} /> Set Priority</div>
                <div className="kb-list-action-controls">
                  <select
                    className="kb-input kb-import-select"
                    value={bulkPriority}
                    onChange={e => setBulkPriority(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">Choose priority...</option>
                    <option value="none">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <button
                    className="kb-btn kb-btn-primary kb-btn-sm"
                    disabled={!bulkPriority || applying}
                    onClick={() => apply('Priority', async () => {
                      const val = bulkPriority === 'none' ? null : bulkPriority;
                      for (const card of cards) await onUpdateCard(card.id, { priority: val });
                    })}
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* 4. Add Label */}
              {board.labels.length > 0 && (
                <div className="kb-list-action-row">
                  <div className="kb-list-action-label"><Tag size={13} /> Add Label</div>
                  <div className="kb-list-action-controls">
                    <select className="kb-input kb-import-select" value={bulkLabel} onChange={e => setBulkLabel(e.target.value)} style={{ flex: 1 }}>
                      <option value="">Choose a label...</option>
                      {board.labels.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                    <button
                      className="kb-btn kb-btn-primary kb-btn-sm"
                      disabled={!bulkLabel || applying}
                      onClick={() => apply('Label', async () => {
                        for (const card of cards) {
                          const existing = (card.labels || []).map(l => l.id);
                          if (!existing.includes(bulkLabel)) {
                            await onUpdateCard(card.id, { label_ids: [...existing, bulkLabel] });
                          }
                        }
                      })}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}

              {/* 5. Sort A-Z / Z-A */}
              <div className="kb-list-action-row">
                <div className="kb-list-action-label"><ArrowDownAZ size={13} /> Sort Cards</div>
                <div className="kb-list-action-controls">
                  <button
                    className="kb-btn kb-btn-primary kb-btn-sm"
                    disabled={applying}
                    onClick={() => apply('Sort A→Z', async () => { await onSortCards(column.id, 'asc'); })}
                  >
                    A → Z
                  </button>
                  <button
                    className="kb-btn kb-btn-primary kb-btn-sm"
                    disabled={applying}
                    onClick={() => apply('Sort Z→A', async () => { await onSortCards(column.id, 'desc'); })}
                  >
                    Z → A
                  </button>
                  <button
                    className="kb-btn kb-btn-primary kb-btn-sm"
                    disabled={applying}
                    onClick={() => apply('Sort Due ↑', async () => { await onSortCards(column.id, 'due_asc'); })}
                  >
                    Due ↑
                  </button>
                  <button
                    className="kb-btn kb-btn-primary kb-btn-sm"
                    disabled={applying}
                    onClick={() => apply('Sort Due ↓', async () => { await onSortCards(column.id, 'due_desc'); })}
                  >
                    Due ↓
                  </button>
                </div>
              </div>

              {/* 6. Mark All Complete / Incomplete */}
              <div className="kb-list-action-row">
                <div className="kb-list-action-label"><Check size={13} /> Mark All</div>
                <div className="kb-list-action-controls">
                  <button
                    className="kb-btn kb-btn-primary kb-btn-sm"
                    disabled={applying}
                    onClick={() => apply('Mark complete', async () => {
                      for (const card of cards) await onUpdateCard(card.id, { is_complete: true });
                    })}
                  >
                    Mark All Complete
                  </button>
                  <button
                    className="kb-btn kb-btn-sm"
                    disabled={applying}
                    style={{ background: 'rgba(99,102,241,0.08)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}
                    onClick={() => apply('Mark incomplete', async () => {
                      for (const card of cards) await onUpdateCard(card.id, { is_complete: false });
                    })}
                  >
                    Mark All Incomplete
                  </button>
                </div>
              </div>

              {/* 7. Add Checklist Item */}
              <div className="kb-list-action-row">
                <div className="kb-list-action-label"><CheckSquare size={13} /> Add Checklist Item</div>
                <div className="kb-list-action-controls">
                  <input
                    className="kb-input"
                    value={bulkChecklistItem}
                    onChange={e => setBulkChecklistItem(e.target.value)}
                    placeholder="Checklist item text..."
                    style={{ flex: 1 }}
                  />
                  <button
                    className="kb-btn kb-btn-primary kb-btn-sm"
                    disabled={!bulkChecklistItem.trim() || applying}
                    onClick={() => apply('Checklist item', async () => {
                      for (const card of cards) await onAddChecklistItem(card.id, bulkChecklistItem.trim());
                    })}
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* 8. Apply Checklist Template */}
              {checklistTemplates.length > 0 && (
                <div className="kb-list-action-row">
                  <div className="kb-list-action-label"><CheckSquare size={13} /> Apply Checklist Template</div>
                  <div className="kb-list-action-controls">
                    <select className="kb-input kb-import-select" value={bulkTemplate} onChange={e => setBulkTemplate(e.target.value)} style={{ flex: 1 }}>
                      <option value="">Choose a template...</option>
                      {checklistTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.items.length} items)</option>
                      ))}
                    </select>
                    <button
                      className="kb-btn kb-btn-primary kb-btn-sm"
                      disabled={!bulkTemplate || applying}
                      onClick={() => apply('Checklist template', async () => {
                        for (const card of cards) await onApplyTemplate(card.id, bulkTemplate);
                      })}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}

              {/* 9. Move All Cards */}
              {otherColumns.length > 0 && (
                <div className="kb-list-action-row">
                  <div className="kb-list-action-label"><FolderKanban size={13} /> Move All Cards</div>
                  <div className="kb-list-action-controls">
                    <select className="kb-input kb-import-select" value={bulkMoveCol} onChange={e => setBulkMoveCol(e.target.value)} style={{ flex: 1 }}>
                      <option value="">Choose a list...</option>
                      {otherColumns.map(c => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                    <button
                      className="kb-btn kb-btn-primary kb-btn-sm"
                      disabled={!bulkMoveCol || applying}
                      onClick={() => apply('Move', async () => {
                        for (const card of cards) await onMoveCard(card.id, bulkMoveCol);
                      })}
                    >
                      Move
                    </button>
                  </div>
                </div>
              )}

              {/* 10. Move All Completed Cards */}
              {otherColumns.length > 0 && (() => {
                const completedCards = cards.filter(c => c.is_complete);
                return (
                  <div className="kb-list-action-row">
                    <div className="kb-list-action-label"><FolderKanban size={13} /> Move All Completed</div>
                    <div className="kb-list-action-controls">
                      <select className="kb-input kb-import-select" value={bulkMoveCompletedCol} onChange={e => setBulkMoveCompletedCol(e.target.value)} style={{ flex: 1 }}>
                        <option value="">Choose a list...</option>
                        {otherColumns.map(c => (
                          <option key={c.id} value={c.id}>{c.title}</option>
                        ))}
                      </select>
                      <button
                        className="kb-btn kb-btn-primary kb-btn-sm"
                        disabled={!bulkMoveCompletedCol || applying || completedCards.length === 0}
                        onClick={() => apply('Move completed', async () => {
                          for (const card of completedCards) await onMoveCard(card.id, bulkMoveCompletedCol);
                        }, completedCards.length)}
                        title={completedCards.length === 0 ? 'No completed cards in this list' : undefined}
                      >
                        Move {completedCards.length > 0 ? `(${completedCards.length})` : ''}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* 11. Move All Cards to Board */}
              <div className="kb-list-action-row">
                <div className="kb-list-action-label"><FolderKanban size={13} /> Move All to Board</div>
                <div className="kb-list-action-controls" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <select
                    className="kb-input kb-import-select"
                    value={bulkTargetBoardId}
                    onChange={e => handleBulkTargetBoardChange(e.target.value)}
                  >
                    <option value="">Choose a board...</option>
                    {allBoards.filter(b => b.id !== board.id).map(b => (
                      <option key={b.id} value={b.id}>{b.title}</option>
                    ))}
                  </select>
                  {bulkTargetBoardId && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select
                        className="kb-input kb-import-select"
                        value={bulkTargetColumnId}
                        onChange={e => setBulkTargetColumnId(e.target.value)}
                        style={{ flex: 1 }}
                      >
                        {bulkTargetBoardColumns.map(c => (
                          <option key={c.id} value={c.id}>{c.title}</option>
                        ))}
                      </select>
                      <button
                        className="kb-btn kb-btn-primary kb-btn-sm"
                        disabled={!bulkTargetColumnId || applying}
                        onClick={() => apply('Move to board', async () => {
                          await onMoveToBoardCards(bulkTargetBoardId, bulkTargetColumnId);
                        })}
                      >
                        Move
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 12. Clear All Cards */}
              <div className="kb-list-action-row kb-list-action-danger">
                <div className="kb-list-action-label"><Trash2 size={13} /> Clear All Cards</div>
                <div className="kb-list-action-controls" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                  {!confirmDelete ? (
                    <button
                      className="kb-btn kb-btn-sm kb-btn-danger"
                      disabled={applying}
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete {cards.length} Card{cards.length !== 1 ? 's' : ''}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                      <span style={{ fontSize: 12, color: '#f87171' }}>
                        Delete all {cards.length} cards from &quot;{column.title}&quot;? This cannot be undone.
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="kb-btn kb-btn-sm kb-btn-danger"
                          disabled={applying}
                          onClick={() => apply('Clear', async () => {
                            for (const card of cards) await onDeleteCard(card.id);
                          })}
                        >
                          Yes, Delete All
                        </button>
                        <button
                          className="kb-btn kb-btn-sm"
                          style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: '1px solid #2a2d3a' }}
                          onClick={() => setConfirmDelete(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Result feedback */}
          {result && <div className="kb-list-action-result">{result}</div>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ColumnAutomationsModal
   ═══════════════════════════════════════════════════════════ */
function ColumnAutomationsModal({
  column,
  columns,
  labels,
  checklistTemplates,
  onSave,
  onClose,
}: {
  column: BoardColumn;
  columns: BoardColumn[];
  labels: BoardLabel[];
  checklistTemplates: ChecklistTemplate[];
  onSave: (automations: ColumnAutomationAction[]) => Promise<void>;
  onClose: () => void;
}) {
  const [actions, setActions] = useState<ColumnAutomationAction[]>(column.automations ?? []);
  const [newType, setNewType] = useState<ColumnAutomationAction['type']>('set_priority');
  const [newValue, setNewValue] = useState<string>('high');   // primary value (or label id for move_on_label)
  const [newColId, setNewColId] = useState<string>('');       // destination list for move_on_label
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);

  useEffect(() => {
    supabase.from('users').select('id, name, email').order('name').then(({ data }) => {
      if (data) setUsers(data as { id: string; name: string; email: string }[]);
    });
  }, []);

  // Reset the value inputs to a sensible default when the action type changes
  useEffect(() => {
    setNewColId('');
    if (newType === 'set_complete') setNewValue('true');
    else if (newType === 'set_priority') setNewValue('high');
    else if (newType === 'set_assignee') setNewValue(users[0]?.id ?? '');
    else if (newType === 'set_due_date_offset') setNewValue('1');
    else setNewValue('');
  }, [newType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each automation reads as a sentence: [trigger] · [action].
  const describeTrigger = (action: ColumnAutomationAction): string => {
    switch (action.type) {
      case 'move_completed':   return 'When completed';
      case 'move_on_due_date': return 'When a due date is set';
      case 'move_on_assigned': return 'When assigned';
      case 'move_on_focus':    return 'When focused';
      case 'move_on_label': {
        const name = labels.find(l => l.id === action.value.label_id)?.name ?? 'a label';
        return `When "${name}" is added`;
      }
      default: return 'When a card arrives';
    }
  };

  const listName = (id: string) => columns.find(c => c.id === id)?.title ?? 'another list';

  const describeAction = (action: ColumnAutomationAction): string => {
    switch (action.type) {
      case 'set_complete':  return action.value ? 'Mark complete' : 'Mark incomplete';
      case 'set_priority':  return action.value ? `Set priority to ${action.value}` : 'Clear priority';
      case 'set_assignee':  return `Assign to ${users.find(u => u.id === action.value)?.name ?? 'user'}`;
      case 'set_labels':    return action.value.length ? `Set labels: ${action.value.map(id => labels.find(l => l.id === id)?.name ?? id).join(', ')}` : 'Set no labels';
      case 'clear_labels':  return 'Remove all labels';
      case 'add_checklist': return action.value.length ? `Add checklist: ${action.value.map(id => checklistTemplates.find(t => t.id === id)?.name ?? id).join(', ')}` : 'Add checklist';
      case 'set_due_date':  return `Set due date to ${action.value}`;
      case 'set_due_date_offset': return action.value === 0 ? 'Set due date to arrival day' : `Set due date ${action.value} day${action.value === 1 ? '' : 's'} after arrival`;
      case 'strip_due_date': return 'Remove the due date';
      case 'move_completed':
      case 'move_on_due_date':
      case 'move_on_assigned':
      case 'move_on_focus':  return `Move to ${listName(action.value)}`;
      case 'move_on_label':  return `Move to ${listName(action.value.column_id)}`;
      default: return '';
    }
  };

  // Persist immediately — there is no separate Save step.
  const persist = async (next: ColumnAutomationAction[]) => {
    setActions(next);
    setSaving(true);
    try {
      await onSave(next);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const removeAction = (type: ColumnAutomationAction['type']) => {
    persist(actions.filter(a => a.type !== type));
  };

  const addAction = () => {
    let action: ColumnAutomationAction;
    if (newType === 'set_complete') {
      action = { type: 'set_complete', value: newValue === 'true' };
    } else if (newType === 'set_priority') {
      action = { type: 'set_priority', value: (newValue || null) as 'low' | 'medium' | 'high' | 'urgent' | null };
    } else if (newType === 'set_assignee') {
      action = { type: 'set_assignee', value: newValue };
    } else if (newType === 'set_labels') {
      action = { type: 'set_labels', value: newValue ? newValue.split(',').filter(Boolean) : [] };
    } else if (newType === 'clear_labels') {
      action = { type: 'clear_labels', value: true };
    } else if (newType === 'move_completed') {
      action = { type: 'move_completed', value: newValue };
    } else if (newType === 'set_due_date') {
      action = { type: 'set_due_date', value: newValue };
    } else if (newType === 'set_due_date_offset') {
      action = { type: 'set_due_date_offset', value: Math.max(0, parseInt(newValue, 10) || 0) };
    } else if (newType === 'strip_due_date') {
      action = { type: 'strip_due_date', value: true };
    } else if (newType === 'move_on_due_date') {
      action = { type: 'move_on_due_date', value: newValue };
    } else if (newType === 'move_on_assigned') {
      action = { type: 'move_on_assigned', value: newValue };
    } else if (newType === 'move_on_focus') {
      action = { type: 'move_on_focus', value: newValue };
    } else if (newType === 'move_on_label') {
      action = { type: 'move_on_label', value: { label_id: newValue, column_id: newColId } };
    } else {
      action = { type: 'add_checklist', value: newValue ? newValue.split(',').filter(Boolean) : [] };
    }
    // One rule per type — adding replaces any existing rule of the same type
    persist([...actions.filter(a => a.type !== newType), action]);
  };

  const selectedNewIds = newValue ? newValue.split(',').filter(Boolean) : [];

  const toggleChipValue = (id: string) => {
    const ids = newValue ? newValue.split(',').filter(Boolean) : [];
    const next = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
    setNewValue(next.join(','));
  };

  // Action types whose primary value is a single destination list id
  const needsDestList = (['move_completed', 'move_on_due_date', 'move_on_assigned', 'move_on_focus'] as const).includes(newType as never);
  const needsUser = newType === 'set_assignee';

  const canAdd =
    (!needsDestList || newValue.trim() !== '') &&
    (!needsUser || newValue.trim() !== '') &&
    (newType !== 'set_due_date' || newValue.trim() !== '') &&
    (newType !== 'set_due_date_offset' || newValue.trim() !== '') &&
    (newType !== 'move_on_label' || (newValue.trim() !== '' && newColId.trim() !== ''));

  const destListSelect = (
    <select className="kb-input" value={newValue} onChange={e => setNewValue(e.target.value)}>
      <option value="">Choose a list…</option>
      {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
    </select>
  );

  return (
    <div className="kb-modal-overlay" onClick={onClose}>
      <div className="kb-auto-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="kb-import-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SlidersHorizontal size={16} style={{ color: '#33B233' }} />
            <h3 className="kb-import-title">Automations — {column.title}</h3>
          </div>
          <button className="kb-btn-icon-sm" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="kb-auto-body">
          <p className="kb-auto-hint">Rules run automatically as cards arrive in or change inside this list.</p>

          {/* Existing automations */}
          {actions.length > 0 ? (
            <div className="kb-auto-list">
              {actions.map(action => (
                <div key={action.type} className="kb-auto-row">
                  <div className="kb-auto-rule">
                    <span className="kb-auto-trigger">{describeTrigger(action)}</span>
                    <span className="kb-auto-arrow">→</span>
                    <span className="kb-auto-value">{describeAction(action)}</span>
                  </div>
                  <button
                    className="kb-btn-icon-sm"
                    onClick={() => removeAction(action.type)}
                    title="Remove rule"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="kb-auto-empty">No rules yet. Add one below.</div>
          )}

          {/* Add automation row */}
          <div className="kb-auto-add-section">
            <div className="kb-auto-add-label">Add a rule</div>
            <div className="kb-auto-add-row">
              <select
                className="kb-input"
                value={newType}
                onChange={e => setNewType(e.target.value as ColumnAutomationAction['type'])}
                style={{ flex: 1 }}
              >
                <optgroup label="When a card arrives in this list">
                  <option value="set_priority">Set priority</option>
                  <option value="set_assignee">Assign to someone</option>
                  <option value="set_labels">Set labels</option>
                  <option value="clear_labels">Remove all labels</option>
                  <option value="add_checklist">Add checklist</option>
                  <option value="set_complete">Mark complete / incomplete</option>
                  <option value="set_due_date">Set due date (specific date)</option>
                  <option value="set_due_date_offset">Set due date (days after arrival)</option>
                  <option value="strip_due_date">Remove due date</option>
                </optgroup>
                <optgroup label="When a card changes, move it">
                  <option value="move_completed">When completed</option>
                  <option value="move_on_due_date">When a due date is set</option>
                  <option value="move_on_assigned">When assigned</option>
                  <option value="move_on_focus">When focused</option>
                  <option value="move_on_label">When a label is added</option>
                </optgroup>
              </select>
              <button
                className="kb-btn kb-btn-primary kb-btn-sm"
                onClick={addAction}
                disabled={!canAdd || saving}
                title="Add rule"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Dynamic value input */}
            <div className="kb-auto-value-input">
              {newType === 'set_complete' && (
                <select className="kb-input" value={newValue} onChange={e => setNewValue(e.target.value)}>
                  <option value="true">Mark complete</option>
                  <option value="false">Mark incomplete</option>
                </select>
              )}
              {newType === 'set_priority' && (
                <select className="kb-input" value={newValue} onChange={e => setNewValue(e.target.value)}>
                  <option value="">No priority</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              )}
              {newType === 'set_assignee' && (
                users.length > 0 ? (
                  <select className="kb-input" value={newValue} onChange={e => setNewValue(e.target.value)}>
                    <option value="">Select a person…</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{ color: '#6b7280', fontSize: 12 }}>No people available</span>
                )
              )}
              {newType === 'set_labels' && (
                <div className="kb-auto-chips">
                  {labels.length === 0 ? (
                    <span style={{ color: '#6b7280', fontSize: 12 }}>No labels on this board</span>
                  ) : labels.map(l => (
                    <button
                      key={l.id}
                      className={`kb-auto-chip ${selectedNewIds.includes(l.id) ? 'selected' : ''}`}
                      onClick={() => toggleChipValue(l.id)}
                    >
                      <span className="kb-label-dot" style={{ background: l.color }} />
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
              {newType === 'add_checklist' && (
                <div className="kb-auto-chips">
                  {checklistTemplates.length === 0 ? (
                    <span style={{ color: '#6b7280', fontSize: 12 }}>No checklist templates saved</span>
                  ) : checklistTemplates.map(t => (
                    <button
                      key={t.id}
                      className={`kb-auto-chip ${selectedNewIds.includes(t.id) ? 'selected' : ''}`}
                      onClick={() => toggleChipValue(t.id)}
                    >
                      <CheckSquare size={11} />
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
              {needsDestList && (
                columns.length === 0
                  ? <span style={{ color: '#6b7280', fontSize: 12 }}>No other lists on this board</span>
                  : destListSelect
              )}
              {newType === 'set_due_date' && (
                <input
                  type="date"
                  className="kb-input"
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                />
              )}
              {newType === 'set_due_date_offset' && (
                <div className="kb-auto-offset">
                  <input
                    type="number"
                    min={0}
                    className="kb-input"
                    style={{ width: 80 }}
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                  />
                  <span style={{ color: '#9ca3af', fontSize: 13 }}>day(s) after the card arrives</span>
                </div>
              )}
              {newType === 'strip_due_date' && (
                <span style={{ color: '#6b7280', fontSize: 12 }}>Removes the due date from the card</span>
              )}
              {newType === 'move_on_label' && (
                labels.length === 0 || columns.length === 0 ? (
                  <span style={{ color: '#6b7280', fontSize: 12 }}>
                    {labels.length === 0 ? 'No labels on this board' : 'No other lists on this board'}
                  </span>
                ) : (
                  <div className="kb-auto-pair">
                    <div className="kb-auto-chips">
                      {labels.map(l => (
                        <button
                          key={l.id}
                          className={`kb-auto-chip ${newValue === l.id ? 'selected' : ''}`}
                          onClick={() => setNewValue(newValue === l.id ? '' : l.id)}
                        >
                          <span className="kb-label-dot" style={{ background: l.color }} />
                          {l.name}
                        </button>
                      ))}
                    </div>
                    <select className="kb-input" value={newColId} onChange={e => setNewColId(e.target.value)}>
                      <option value="">Move to which list…</option>
                      {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="kb-auto-footer">
          <span className="kb-auto-saved">
            {saving ? 'Saving…' : savedTick ? 'Saved' : 'Changes save automatically'}
          </span>
          <button className="kb-btn kb-btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Board Page
   ═══════════════════════════════════════════════════════════ */
function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardId = params.id as string;
  const { user } = useAuth();
  const {
    board, fetchBoard, updateBoard, deleteBoard: deleteBoardFn,
    addColumn, updateColumn, deleteColumn, reorderColumns,
    addCard, updateCard, deleteCard, moveCard, moveToBoardCard, reorderCardsInColumn,
    addComment, updateComment, deleteComment,
    addChecklistItem, toggleChecklistItem, updateChecklistItemDueDate, deleteChecklistItem, renameChecklistItem, updateChecklistItemUrl, reorderChecklistItems,
    promoteUngroupedToGroup, addChecklistGroup, renameChecklistGroup, deleteChecklistGroup,
    fetchChecklistTemplates, saveChecklistTemplate, deleteChecklistTemplate, applyChecklistTemplate,
    checklistTemplates,
    addLabel, updateLabel, deleteLabel,
    assignCard, unassignCard, fetchSystemUsers,
    fetchBoardMembers, shareBoardWithUsers, unshareBoardUser,
    loading, setBoard,
    createNextRepeatCard,
  } = useProjectBoard();

  const [search] = useState('');
  const [filterPriority, setFilterPriority] = useState<CardPriority | ''>('');
  const [filterLabel, setFilterLabel] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [addingCardCol, setAddingCardCol] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [quickAddLabels, setQuickAddLabels] = useState<string[]>([]);
  const [hashQuery, setHashQuery] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const [showBoardMenu, setShowBoardMenu] = useState(false);
  const [editingBoardTitle, setEditingBoardTitle] = useState(false);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showNotePanel, setShowNotePanel] = useState(false);
  const [noteFormats, setNoteFormats] = useState({ bold: false, italic: false, underline: false, strikeThrough: false, heading: false, unorderedList: false, orderedList: false });
  const [showImportModal, setShowImportModal] = useState(false);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [dragOverPos, setDragOverPos] = useState<'above' | 'below'>('below');
  const [listActionsColId, setListActionsColId] = useState<string | null>(null);
  const [automationsColId, setAutomationsColId] = useState<string | null>(null);
  const [colorPickerColId, setColorPickerColId] = useState<string | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Cross-board card search
  const [cardSearch, setCardSearch] = useState('');
  const [cardSearchResults, setCardSearchResults] = useState<{ id: string; title: string; boardId: string; boardTitle: string; columnTitle: string }[]>([]);
  const [cardSearchIdx, setCardSearchIdx] = useState(0);
  const [boardView, setBoardView] = useState<'board' | 'list'>(() => {
    if (typeof window === 'undefined') return 'board';
    return (localStorage.getItem('boards-view-mode') as 'board' | 'list') || 'board';
  });
  useEffect(() => { localStorage.setItem('boards-view-mode', boardView); }, [boardView]);

  useEffect(() => {
    setCardSearchIdx(0);
    const term = cardSearch.trim();
    if (!term) { setCardSearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data: cards } = await supabase
        .from('board_cards')
        .select('id, title, board_id, column_id')
        .or(`title.ilike.%${term}%,description.ilike.%${term}%`)
        .eq('is_archived', false)
        .limit(8);
      if (!cards || cards.length === 0) { setCardSearchResults([]); return; }
      const boardIds = Array.from(new Set(cards.map((c: any) => c.board_id as string)));
      const columnIds = Array.from(new Set(cards.map((c: any) => c.column_id as string)));
      const [{ data: boardRows }, { data: colRows }] = await Promise.all([
        supabase.from('project_boards').select('id, title').in('id', boardIds).eq('is_archived', false),
        supabase.from('board_columns').select('id, title').in('id', columnIds),
      ]);
      const boardMap = new Map((boardRows || []).map((b: any) => [b.id, b.title]));
      const colMap = new Map((colRows || []).map((c: any) => [c.id, c.title]));
      setCardSearchResults(cards
        .filter((c: any) => boardMap.has(c.board_id))
        .map((c: any) => ({
          id: c.id, title: c.title, boardId: c.board_id,
          boardTitle: boardMap.get(c.board_id) || 'Unknown Board',
          columnTitle: colMap.get(c.column_id) || 'Unknown Column',
        })));
    }, 300);
    return () => clearTimeout(t);
  }, [cardSearch]);

  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(`collapsed-cols-${boardId}`);
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const [dragExpandedList, setDragExpandedList] = useState<string | null>(null);
  useEffect(() => {
    if (collapsedSet.size === 0) {
      localStorage.removeItem(`collapsed-cols-${boardId}`);
    } else {
      localStorage.setItem(`collapsed-cols-${boardId}`, JSON.stringify([...collapsedSet]));
    }
  }, [collapsedSet, boardId]);

  const noteRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const newCardRef = useRef<HTMLInputElement>(null);
  const newColRef = useRef<HTMLInputElement>(null);
  const boardMenuRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const dueDatePickerRef = useRef<HTMLDivElement>(null);
  const [dueDateCardId, setDueDateCardId] = useState<string | null>(null);
  // Tracks which board id has had its move_completed automations reconciled this session
  const reconciledBoardRef = useRef<string | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showBoardMenu && boardMenuRef.current && !boardMenuRef.current.contains(e.target as Node)) {
        setShowBoardMenu(false);
      }
      if (showFilterDropdown && filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
      if (dueDateCardId && dueDatePickerRef.current && !dueDatePickerRef.current.contains(e.target as Node)) {
        setDueDateCardId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBoardMenu, showFilterDropdown, dueDateCardId]);
  const addingCardRef = useRef(false);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  useEffect(() => {
    if (boardId) {
      fetchBoard(boardId);
      fetchChecklistTemplates(boardId);
      localStorage.setItem('boards-last-route', `/boards/${boardId}`);
    }
  }, [boardId, fetchBoard, fetchChecklistTemplates]);

  // Reconcile move_completed automations on board open.
  // Cards completed elsewhere (e.g. the Today page) get is_complete=true but
  // never trigger the board's move_completed rule, so they stay in their old
  // column. When the board loads, sweep those into their destination column.
  useEffect(() => {
    if (!board || reconciledBoardRef.current === board.id) return;
    reconciledBoardRef.current = board.id;

    const strays = board.cards.filter(card => {
      if (!card.is_complete) return false;
      const col = board.columns.find(c => c.id === card.column_id);
      const moveAction = col?.automations?.find(a => a.type === 'move_completed');
      if (moveAction?.type !== 'move_completed') return false;
      // Skip if already in the destination column
      return moveAction.value !== card.column_id;
    });
    if (strays.length === 0) return;

    (async () => {
      for (const card of strays) {
        const col = board.columns.find(c => c.id === card.column_id);
        const moveAction = col?.automations?.find(a => a.type === 'move_completed');
        if (moveAction?.type === 'move_completed') {
          await moveCard(boardId, card.id, moveAction.value, 0);
        }
      }
    })();
  }, [board?.id, board?.cards, board?.columns, boardId, moveCard]);

  // Open card from ?card= query param (e.g. deep-linked from Today page)
  useEffect(() => {
    const cardParam = searchParams.get('card');
    if (!cardParam || !board) return;
    const card = board.cards.find(c => c.id === cardParam);
    if (card) openCardDetail(card);
  }, [board?.id, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync note content when board loads
  useEffect(() => {
    if (board?.notes != null && noteRef.current) {
      const html = board.notes;
      // Migrate plain text: convert newlines to <br> if no HTML tags present
      if (html && !/<[a-z][\s\S]*>/i.test(html)) {
        noteRef.current.innerHTML = html.replace(/\n/g, '<br>');
      } else {
        noteRef.current.innerHTML = html || '';
      }
    }
  }, [board?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNoteNow = useCallback(() => {
    if (!noteRef.current || !board) return;
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
    const html = noteRef.current.innerHTML;
    if (html !== (board.notes || '')) {
      updateBoard(boardId, { notes: html });
    }
  }, [board, boardId, updateBoard]);

  const handleNoteInput = useCallback(() => {
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
    noteSaveTimer.current = setTimeout(saveNoteNow, 1500);
  }, [saveNoteNow]);

  const updateNoteFormats = useCallback(() => {
    if (!noteRef.current || !noteRef.current.contains(document.getSelection()?.anchorNode ?? null)) return;
    const sel = window.getSelection();
    const node = sel?.anchorNode?.parentElement;
    setNoteFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      heading: !!node?.closest('h3'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
      orderedList: document.queryCommandState('insertOrderedList'),
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', updateNoteFormats);
    return () => document.removeEventListener('selectionchange', updateNoteFormats);
  }, [updateNoteFormats]);

  const execNoteCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    noteRef.current?.focus();
  };

  const insertNoteLink = () => {
    const url = prompt('Enter URL:');
    if (url) document.execCommand('createLink', false, url);
    noteRef.current?.focus();
  };

  const closeNotePanel = useCallback(() => {
    saveNoteNow();
    setShowNotePanel(false);
  }, [saveNoteNow]);


  // When opening card detail, find the latest version from board state
  const openCardDetail = useCallback((card: BoardCard) => {
    setDueDateCardId(null);
    setSelectedCard(card);
  }, []);

  const handleQuickDueDateUpdate = useCallback(async (cardId: string, dueDate: string | null) => {
    const hadDueDateBefore = !!board?.cards.find(c => c.id === cardId)?.due_date;
    await updateCard(boardId, cardId, dueDate ? { due_date: dueDate } : { due_date: null, due_time: null });
    setDueDateCardId(null);
    if (dueDate) await runDueDateMoveAutomation(cardId, hadDueDateBefore);
  }, [boardId, updateCard, board]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcuts (desktop only, acts on hovered card) ──
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return;

    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs, textareas, or contentEditable
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      // Ignore when a modal is open — the modal owns its own keyboard shortcuts
      if (selectedCard) return;

      if (!hoveredCardId || !board) return;
      const card = board.cards.find(c => c.id === hoveredCardId);
      if (!card) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        openCardDetail(card);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (confirm(`Delete "${card.title}"?`)) {
          deleteCard(boardId, card.id);
        }
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleToggleComplete(card.id, !card.is_complete);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        if (!user) return;
        const alreadyAssigned = (card.assignments || []).some(a => a.user_id === user.id);
        if (alreadyAssigned) {
          unassignCard(card.id, user.id);
        } else {
          (async () => { await assignCard(card.id, user.id); await runCardMoveTrigger(card.id, 'move_on_assigned'); })();
        }
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setDueDateCardId(card.id);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        const willFocus = !card.is_focused;
        (async () => {
          await updateCard(boardId, card.id, { is_focused: willFocus });
          if (willFocus) await runCardMoveTrigger(card.id, 'move_on_focus');
        })();
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const sortedLabels = [...(board.labels || [])].sort((a, b) => a.name.localeCompare(b.name));
        const idx = e.key === '0' ? 9 : parseInt(e.key, 10) - 1;
        if (idx < sortedLabels.length) {
          const targetLabel = sortedLabels[idx];
          const currentIds = (card.labels || []).map(l => l.id);
          const isAdding = !currentIds.includes(targetLabel.id);
          const newIds = isAdding
            ? [...currentIds, targetLabel.id]
            : currentIds.filter(id => id !== targetLabel.id);
          (async () => {
            await updateCard(boardId, card.id, { label_ids: newIds });
            if (isAdding) await runCardMoveTrigger(card.id, 'move_on_label', [targetLabel.id]);
          })();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hoveredCardId, board, boardId, selectedCard, user, openCardDetail, deleteCard, updateCard, assignCard, unassignCard]);

  useEffect(() => {
    if (selectedCard) setDueDateCardId(null);
  }, [selectedCard]);

  useEffect(() => {
    if (addingCardCol && newCardRef.current) newCardRef.current.focus();
  }, [addingCardCol]);

  useEffect(() => {
    if (addingColumn && newColRef.current) newColRef.current.focus();
  }, [addingColumn]);

  // ── Filtered cards ──
  const filteredCards = useMemo(() => {
    if (!board) return [];
    let cards = board.cards;
    if (search.trim()) {
      const q = search.toLowerCase();
      cards = cards.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.assignee?.toLowerCase().includes(q) ||
        (c.labels || []).some(l => l.name.toLowerCase().includes(q))
      );
    }
    if (filterPriority) {
      cards = cards.filter(c => c.priority === filterPriority);
    }
    if (filterLabel) {
      cards = cards.filter(c => (c.labels || []).some(l => l.id === filterLabel));
    }
    if (filterDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      const endOfWeek = new Date(today);
      endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
      const endOfWeekStr = endOfWeek.toISOString().split('T')[0];
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const endOfMonthStr = endOfMonth.toISOString().split('T')[0];
      cards = cards.filter(c => {
        switch (filterDate) {
          case 'overdue': return c.due_date && c.due_date < todayStr;
          case 'today': return c.due_date === todayStr;
          case 'week': return c.due_date && c.due_date >= todayStr && c.due_date <= endOfWeekStr;
          case 'month': return c.due_date && c.due_date >= todayStr && c.due_date <= endOfMonthStr;
          case 'no-dates': return !c.start_date && !c.due_date;
          default: return true;
        }
      });
    }
    return cards;
  }, [board, search, filterPriority, filterLabel, filterDate]);

  const getColumnCards = useCallback((colId: string) => {
    return filteredCards.filter(c => c.column_id === colId).sort((a, b) => a.position - b.position);
  }, [filteredCards]);

  // ── Drag & Drop (native HTML5) ──
  const handleDragStart = (cardId: string) => {
    setDragCardId(cardId);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverCol(colId);
    setDragExpandedList(colId);
  };

  const handleCardDragOver = (e: React.DragEvent, cardId: string, colId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDragOverCol(colId);
    setDragOverCardId(cardId);
    setDragOverPos(e.clientY < midY ? 'above' : 'below');
  };

  const handleDrop = async (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverCol(null);
    setDragOverCardId(null);
    setDragExpandedList(null);
    if (!dragCardId || !board) return;

    const cardsInCol = getColumnCards(colId);
    const draggedCard = board.cards.find(c => c.id === dragCardId);
    if (!draggedCard) return;

    const oldColId = draggedCard.column_id;
    const isSameColumn = oldColId === colId;

    // Figure out target index
    let targetIndex: number;
    if (dragOverCardId) {
      const hoverIdx = cardsInCol.findIndex(c => c.id === dragOverCardId);
      targetIndex = dragOverPos === 'above' ? hoverIdx : hoverIdx + 1;
    } else {
      targetIndex = cardsInCol.length;
    }

    // Build new card order for destination column
    const destCards = cardsInCol.filter(c => c.id !== dragCardId);
    if (isSameColumn) {
      const oldIdx = cardsInCol.findIndex(c => c.id === dragCardId);
      if (oldIdx < targetIndex) targetIndex--;
    }
    destCards.splice(targetIndex, 0, draggedCard);

    await reorderCardsInColumn(boardId, colId, destCards.map(c => c.id));

    // If cross-column, re-normalize source column and run automations
    if (!isSameColumn) {
      const sourceCards = getColumnCards(oldColId).filter(c => c.id !== dragCardId);
      if (sourceCards.length > 0) {
        await reorderCardsInColumn(boardId, oldColId, sourceCards.map(c => c.id));
      }
      await runColumnAutomations(dragCardId, colId);
      // If card has repeat rule and was dropped in the last column, create next occurrence
      if (draggedCard.repeat_rule && draggedCard.repeat_rule !== 'none' && draggedCard.due_date && board.columns.length > 0) {
        const lastCol = board.columns[board.columns.length - 1];
        if (colId === lastCol.id) {
          await createNextRepeatCard(draggedCard, board.columns[0].id);
        }
      }
    }

    setDragCardId(null);
  };

  const handleDragEnd = () => {
    setDragCardId(null);
    setDragOverCol(null);
    setDragOverCardId(null);
    setDragExpandedList(null);
  };

  const toggleCollapsed = (colId: string) => {
    setCollapsedSet(prev => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId); else next.add(colId);
      return next;
    });
  };

  // ── Column automations ──
  const runColumnAutomations = async (cardId: string, destColId: string) => {
    if (!board) return;
    const destCol = board.columns.find(c => c.id === destColId);
    const automations = destCol?.automations ?? [];
    if (automations.length === 0) return;

    const cardUpdates: Record<string, unknown> = {};
    for (const action of automations) {
      if (action.type === 'set_complete')  cardUpdates.is_complete = action.value;
      if (action.type === 'set_priority')  cardUpdates.priority    = action.value;
      if (action.type === 'set_assignee')  cardUpdates.assignee    = action.value;
      if (action.type === 'set_labels')    cardUpdates.label_ids   = action.value;
      if (action.type === 'clear_labels')  cardUpdates.label_ids   = [];
      if (action.type === 'set_due_date') {
        cardUpdates.due_date = action.value;
        cardUpdates.due_time = null;
      }
      if (action.type === 'set_due_date_offset') {
        cardUpdates.due_date = DateTime.now().plus({ days: action.value }).toISODate();
        cardUpdates.due_time = null;
      }
      if (action.type === 'strip_due_date') {
        cardUpdates.due_date = null;
        cardUpdates.due_time = null;
      }
    }
    if (Object.keys(cardUpdates).length > 0) {
      await updateCard(boardId, cardId, cardUpdates);
    }

    const checklistAction = automations.find(a => a.type === 'add_checklist');
    if (checklistAction?.type === 'add_checklist') {
      for (const templateId of checklistAction.value) {
        await applyChecklistTemplate(boardId, cardId, templateId);
      }
    }

    const moveCompletedAction = automations.find(a => a.type === 'move_completed');
    if (moveCompletedAction?.type === 'move_completed') {
      const card = board.cards.find(c => c.id === cardId);
      const isComplete = 'is_complete' in cardUpdates ? cardUpdates.is_complete : card?.is_complete;
      if (isComplete) {
        await moveCard(boardId, cardId, moveCompletedAction.value, 0);
      }
    }
  };

  // ── "Move when …" trigger automations ──
  // When a card in a list gains a due date, an assignee, focus, or a specific
  // label, move it to the list configured on that source column. addedLabelIds
  // is only relevant for the move_on_label trigger.
  const runCardMoveTrigger = async (
    cardId: string,
    trigger: 'move_on_due_date' | 'move_on_assigned' | 'move_on_focus' | 'move_on_label',
    addedLabelIds?: string[],
  ) => {
    if (!board) return;
    const card = board.cards.find(c => c.id === cardId);
    if (!card) return;
    const action = board.columns.find(c => c.id === card.column_id)?.automations?.find(a => a.type === trigger);
    if (!action) return;

    let destColId: string | undefined;
    if (action.type === 'move_on_label') {
      // Only fire when the specifically configured label was just added
      if (!addedLabelIds?.includes(action.value.label_id)) return;
      destColId = action.value.column_id;
    } else if (action.type === 'move_on_due_date' || action.type === 'move_on_assigned' || action.type === 'move_on_focus') {
      destColId = action.value;
    }
    if (destColId && destColId !== card.column_id) {
      await moveCard(boardId, cardId, destColId, 0);
    }
  };

  // Move when a due date is newly added (it had none before)
  const runDueDateMoveAutomation = async (cardId: string, hadDueDateBefore: boolean) => {
    if (hadDueDateBefore) return;
    await runCardMoveTrigger(cardId, 'move_on_due_date');
  };

  // ── Toggle complete (with move_completed automation) ──
  const handleToggleComplete = async (cardId: string, makeComplete: boolean) => {
    const card = board?.cards.find(c => c.id === cardId);
    await updateCard(boardId, cardId, { is_complete: makeComplete });
    if (makeComplete && board && card) {
      const col = board.columns.find(c => c.id === card.column_id);
      const moveAction = col?.automations?.find(a => a.type === 'move_completed');
      if (moveAction?.type === 'move_completed') {
        await moveCard(boardId, cardId, moveAction.value, 0);
      }
    }
  };

  // ── Quick add card ──
  const handleNewCardTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewCardTitle(val);
    const hashMatch = val.match(/#(\w*)$/);
    if (hashMatch) {
      setHashQuery(hashMatch[1]);
    } else {
      setHashQuery(null);
    }
  };

  const handleHashLabelSelect = (labelId: string) => {
    setNewCardTitle(prev => prev.replace(/#\w*$/, '').trimEnd());
    setQuickAddLabels(prev =>
      prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]
    );
    setHashQuery(null);
    newCardRef.current?.focus();
  };

  const handleQuickAddCard = async (colId: string) => {
    if (!newCardTitle.trim() || addingCardRef.current) return;
    addingCardRef.current = true;
    await addCard(boardId, { column_id: colId, title: newCardTitle, label_ids: quickAddLabels.length > 0 ? quickAddLabels : undefined });
    addingCardRef.current = false;
    setNewCardTitle('');
    setQuickAddLabels([]);
    setHashQuery(null);
    setAddingCardCol(null);
  };

  // ── Add column ──
  const handleAddColumn = async () => {
    if (!newColTitle.trim()) return;
    const usedColors = new Set(board?.columns.map(c => c.color) ?? []);
    const nextColor = COLUMN_COLORS.find(c => !usedColors.has(c)) ?? COLUMN_COLORS[(board?.columns.length ?? 0) % COLUMN_COLORS.length];
    await addColumn(boardId, newColTitle, nextColor);
    setNewColTitle('');
    setAddingColumn(false);
  };

  // Auto-open card from URL query param (e.g. from calendar click)
  useEffect(() => {
    const cardId = searchParams.get('card');
    if (cardId && board && !selectedCard) {
      const card = board.cards.find(c => c.id === cardId);
      if (card) {
        setSelectedCard(card);
        // Clean up the URL param
        router.replace(`/boards/${boardId}`, { scroll: false });
      }
    }
  }, [board, searchParams, boardId, router, selectedCard]);

  // Keep selectedCard in sync with board
  const activeCard = useMemo(() => {
    if (!selectedCard || !board) return null;
    return board.cards.find(c => c.id === selectedCard.id) || null;
  }, [selectedCard, board]);

  if (loading && !board) {
    return (
      <div className="kb-root">
        <style>{kanbanStyles}</style>
        <div className="kb-loading">
          <div className="kb-spinner" />
          <p style={{ color: '#9ca3af' }}>Loading board...</p>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="kb-root">
        <style>{kanbanStyles}</style>
        <div className="kb-loading">
          <AlertCircle size={32} style={{ color: '#ef4444', marginBottom: 12 }} />
          <p style={{ color: '#9ca3af' }}>Board not found</p>
          <button className="kb-btn kb-btn-ghost" onClick={() => { localStorage.removeItem('boards-last-route'); router.push('/boards'); }} style={{ marginTop: 16 }}>
            <ArrowLeft size={14} /> Back to Boards
          </button>
        </div>
      </div>
    );
  }

  const columns = [...board.columns].sort((a, b) => a.position - b.position);
  const activeLabelSummaries = board.labels
    .map(label => ({
      label,
      count: board.cards.reduce((total, card) => (
        !card.is_complete && (card.labels || []).some(cardLabel => cardLabel.id === label.id) ? total + 1 : total
      ), 0),
    }))
    .filter(item => item.count > 0)
    .sort((a, b) => a.label.name.localeCompare(b.label.name));

  return (
    <div className="kb-root">
      <style>{kanbanStyles}</style>

      {/* ── Top bar ── */}
      <div className="kb-topbar">
        <div className="kb-topbar-left">
          <button className="kb-btn-icon" onClick={() => { localStorage.removeItem('boards-last-route'); router.push('/boards'); }} title="Back to boards">
            <ArrowLeft size={18} />
          </button>
          <InlineEdit
            value={board.title}
            onSave={title => updateBoard(boardId, { title })}
            className="kb-board-title"
          />
          {board.is_public && (
            <span className="kb-public-badge"><Globe size={11} /> Public</span>
          )}
          {board.user_id !== user?.id && (
            <span className="kb-public-badge kb-shared-badge"><User size={11} /> Shared</span>
          )}
          {board.is_archived && (
            <span className="kb-public-badge kb-archived-badge"><Archive size={11} /> Archived</span>
          )}
        </div>

        {activeLabelSummaries.length > 0 && (
          <div className="kb-board-label-summary" aria-label="Active board labels">
            {activeLabelSummaries.map(({ label, count }) => (
              <button
                key={label.id}
                type="button"
                className={`kb-board-label-badge ${filterLabel === label.id ? 'active' : ''}`}
                style={{
                  background: label.color,
                  borderColor: label.color,
                  boxShadow: filterLabel === label.id
                    ? `0 0 0 2px #0f1117, 0 0 0 4px ${label.color}88`
                    : `0 1px 8px ${label.color}38`,
                }}
                onClick={() => setFilterLabel(current => current === label.id ? '' : label.id)}
                title={`${count} card${count === 1 ? '' : 's'} labeled ${label.name}`}
              >
                <span className="kb-board-label-name">{label.name}</span>
                <span className="kb-board-label-count">{count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="kb-topbar-right">
          {/* Filter dropdown */}
          <div ref={filterDropdownRef} style={{ position: 'relative' }}>
            <button
              className={`kb-filter-btn ${(filterPriority || filterLabel || filterDate) ? 'kb-filter-btn-active' : ''}`}
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              title="Filters"
            >
              <SlidersHorizontal size={15} />
              {(filterPriority || filterLabel || filterDate) && (
                <span className="kb-filter-badge">
                  {[filterPriority, filterLabel, filterDate].filter(Boolean).length}
                </span>
              )}
            </button>
            {showFilterDropdown && (
              <>
                <div className="kb-click-away" onClick={() => setShowFilterDropdown(false)} />
                <div className="kb-filter-dropdown">
                  <div className="kb-filter-dropdown-title">Filters</div>
                  <label className="kb-filter-row-label">Priority</label>
                  <select
                    className="kb-filter-select"
                    value={filterPriority}
                    onChange={e => setFilterPriority(e.target.value as CardPriority | '')}
                  >
                    <option value="">All Priorities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  {board.labels.length > 0 && (
                    <>
                      <label className="kb-filter-row-label">Label</label>
                      <select
                        className="kb-filter-select"
                        value={filterLabel}
                        onChange={e => setFilterLabel(e.target.value)}
                      >
                        <option value="">All Labels</option>
                        {board.labels.map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </>
                  )}
                  <label className="kb-filter-row-label">Date</label>
                  <select
                    className="kb-filter-select"
                    value={filterDate}
                    onChange={e => setFilterDate(e.target.value)}
                  >
                    <option value="">All Dates</option>
                    <option value="overdue">Overdue</option>
                    <option value="today">Due Today</option>
                    <option value="week">Due This Week</option>
                    <option value="month">Due This Month</option>
                    <option value="no-dates">No Dates</option>
                  </select>
                  {(filterPriority || filterLabel || filterDate) && (
                    <button
                      className="kb-filter-clear-btn"
                      onClick={() => { setFilterPriority(''); setFilterLabel(''); setFilterDate(''); }}
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* View toggle */}
          <div className="kb-view-toggle">
            <button
              className={`kb-view-btn ${boardView === 'board' ? 'active' : ''}`}
              onClick={() => setBoardView('board')}
              title="Board view"
            >
              <LayoutDashboard size={14} />
              <span className="kb-btn-label">Board</span>
            </button>
            <button
              className={`kb-view-btn ${boardView === 'list' ? 'active' : ''}`}
              onClick={() => setBoardView('list')}
              title="List view"
            >
              <ListBullet size={14} />
              <span className="kb-btn-label">List</span>
            </button>
            <button
              className="kb-view-btn"
              onClick={() => router.push(`/boards/calendar?board=${boardId}`)}
              title="Calendar view"
            >
              <CalendarDays size={14} />
              <span className="kb-btn-label">Calendar</span>
            </button>
            <button
              className={`kb-view-btn kb-view-btn-notes ${showNotePanel ? 'active kb-view-btn-notes-active' : ''}`}
              onClick={() => showNotePanel ? closeNotePanel() : setShowNotePanel(true)}
              title={showNotePanel ? 'Close Notes' : 'Open Notes'}
            >
              <StickyNote size={14} />
              <span className="kb-btn-label">Notes</span>
            </button>
          </div>

          {/* Board menu */}
          <div ref={boardMenuRef} style={{ position: 'relative' }}>
            <button className="kb-btn-icon" onClick={() => setShowBoardMenu(!showBoardMenu)}>
              <MoreHorizontal size={18} />
            </button>
            {showBoardMenu && (
              <>
                <div className="kb-click-away" onClick={() => setShowBoardMenu(false)} />
                <div className="kb-dropdown">
                  <button className="kb-dropdown-item" onClick={() => { setShowBoardMenu(false); localStorage.removeItem('boards-last-route'); router.push('/boards'); }}>
                    <ArrowLeft size={14} /> All Boards
                  </button>
                  <button className="kb-dropdown-item" onClick={() => { setShowBoardMenu(false); setShowLabelManager(true); }}>
                    <Tag size={14} /> Manage Labels
                  </button>
                  <button className="kb-dropdown-item" onClick={() => { setShowBoardMenu(false); setShowImportModal(true); }}>
                    <Download size={14} /> Import Circle Leaders
                  </button>
                  <button
                    className="kb-dropdown-item"
                    onClick={() => {
                      setShowShareModal(true);
                      setShowBoardMenu(false);
                    }}
                  >
                    <UserPlus size={14} /> Share Board
                  </button>
                  <button
                    className="kb-dropdown-item"
                    onClick={async () => {
                      await updateBoard(boardId, { is_archived: !board.is_archived });
                      setShowBoardMenu(false);
                    }}
                  >
                    <Archive size={14} /> {board.is_archived ? 'Unarchive Board' : 'Archive Board'}
                  </button>
                  <button
                    className="kb-dropdown-item danger"
                    onClick={async () => {
                      if (confirm('Delete this board and all its cards? This cannot be undone.')) {
                        await deleteBoardFn(boardId);
                        localStorage.removeItem('boards-last-route');
                        router.push('/boards');
                      }
                    }}
                  >
                    <Trash2 size={14} /> Delete Board
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {board.is_archived && (
        <div className="kb-archived-notice">
          <div>
            <strong>Archived board</strong>
            <span>Cards on this board are hidden from Today alerts, badges, emails, and push reminders.</span>
          </div>
          {board && (
            <button className="kb-btn kb-btn-primary" onClick={() => updateBoard(boardId, { is_archived: false })}>
              <Archive size={14} /> Unarchive
            </button>
          )}
        </div>
      )}

      {/* ── Cross-board card search ── */}
      <div className="kb-search-bar">
        <Search size={14} className="kb-search-bar-icon" />
        <input
          className="kb-search-bar-input"
          placeholder="Search cards across all boards..."
          value={cardSearch}
          onChange={e => setCardSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') setCardSearchIdx(i => Math.min(i + 1, cardSearchResults.length - 1));
            else if (e.key === 'ArrowUp') setCardSearchIdx(i => Math.max(i - 1, 0));
            else if (e.key === 'Enter' && cardSearchResults[cardSearchIdx]) {
              const r = cardSearchResults[cardSearchIdx];
              if (r.boardId === boardId) { const c = board?.cards.find(x => x.id === r.id); if (c) setSelectedCard(c); }
              else router.push(`/boards/${r.boardId}?card=${r.id}`);
              setCardSearch('');
            } else if (e.key === 'Escape') setCardSearch('');
          }}
        />
        {cardSearch && (
          <button onClick={() => setCardSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 0, display: 'flex' }}>
            <X size={14} />
          </button>
        )}
        {cardSearchResults.length > 0 && cardSearch && (
          <div className="kb-search-global-dropdown">
            <div className="kb-search-global-label">Cards</div>
            {cardSearchResults.map((r, i) => (
              <div
                key={r.id}
                className={`kb-search-global-item${i === cardSearchIdx ? ' selected' : ''}`}
                onClick={() => {
                  if (r.boardId === boardId) { const c = board?.cards.find(x => x.id === r.id); if (c) setSelectedCard(c); }
                  else router.push(`/boards/${r.boardId}?card=${r.id}`);
                  setCardSearch('');
                }}
              >
                <span className="kb-search-global-title">{r.title}</span>
                <span className="kb-search-global-meta">{r.boardTitle} · {r.columnTitle}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Label Manager Modal ── */}
      {showLabelManager && board && (
        <LabelManagerModal
          board={board}
          onAddLabel={addLabel}
          onUpdateLabel={updateLabel}
          onDeleteLabel={deleteLabel}
          onClose={() => setShowLabelManager(false)}
        />
      )}

      {showShareModal && board && (
        <BoardShareModal
          board={board}
          currentUserId={user?.id}
          fetchSystemUsers={fetchSystemUsers}
          fetchBoardMembers={fetchBoardMembers}
          shareBoardWithUsers={shareBoardWithUsers}
          unshareBoardUser={unshareBoardUser}
          updateBoard={updateBoard}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* ── Import Circle Leaders Modal ── */}
      {showImportModal && board && (
        <ImportLeadersModal
          board={board}
          onImport={async (columnId, leaders) => {
            for (const leader of leaders) {
              const descLines = [
                leader.campus && `Campus: ${leader.campus}`,
                leader.circle_type && `Circle Type: ${leader.circle_type}`,
                leader.day && `Day: ${leader.day}`,
                leader.time && `Time: ${formatTime12(leader.time)}`,
                leader.phone && `Phone: ${leader.phone}`,
                leader.email && `Email: ${leader.email}`,
              ].filter(Boolean) as string[];
              const desc = descLines.length ? descLines.map(l => `<p>${l}</p>`).join('') : undefined;
              await addCard(boardId, { column_id: columnId, title: leader.name, description: desc || undefined, linked_leader_id: leader.id });
            }
          }}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* ── List View ── */}
      {boardView === 'list' && (
        <div className="kb-list-view">
          {columns.map(col => {
            const colCards = getColumnCards(col.id);
            return (
              <div key={col.id} className="kb-list-group">
                <div className="kb-list-group-header">
                  <span className="kb-column-dot" style={{ background: col.color }} />
                  <span className="kb-list-group-title">{col.title}</span>
                  <span className="kb-list-group-count">{colCards.length}</span>
                  <button className="kb-btn-icon-sm" onClick={() => setAddingCardCol(col.id)} title="Add card"><Plus size={14} /></button>
                </div>
                {colCards.length === 0 && (
                  <div className="kb-list-empty">No cards</div>
                )}
                {colCards.map(card => {
                  const pri = PRIORITY_CONFIG[card.priority] || PRIORITY_CONFIG.medium;
                  const labels = card.labels || [];
                  const comments = card.comments || [];
                  const checklists = card.checklists || [];
                  const completedCount = checklists.filter(c => c.is_completed).length;
                  const listTodayStr = new Date().toISOString().split('T')[0];
                  const listIncompleteWithDue = checklists.filter(c => !c.is_completed && c.due_date);
                  const listClOverdue = listIncompleteWithDue.filter(c => c.due_date! < listTodayStr).length;
                  const listClDueToday = listIncompleteWithDue.filter(c => c.due_date === listTodayStr).length;
                  const now = new Date(); now.setHours(0,0,0,0);
                  const dueDate = card.due_date ? new Date(card.due_date + 'T00:00:00') : null;
                  const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / 86400000) : null;
                  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
                  const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 2;

                  return (
                    <div
                      key={card.id}
                      className={`kb-list-row ${card.is_complete ? 'kb-list-row-complete' : ''} ${hoveredCardId === card.id ? 'kb-card-hovered' : ''}`}
                      onClick={() => openCardDetail(card)}
                      onMouseEnter={() => setHoveredCardId(card.id)}
                      onMouseLeave={() => setHoveredCardId(prev => prev === card.id ? null : prev)}
                    >
                      {dueDateCardId === card.id && (
                        <div ref={dueDatePickerRef} className="kb-list-row-date-picker">
                          <DueDateQuickPicker
                            dueDate={card.due_date ?? null}
                            onSave={(dueDate) => handleQuickDueDateUpdate(card.id, dueDate)}
                            onClose={() => setDueDateCardId(null)}
                          />
                        </div>
                      )}
                      <button
                        className={`kb-card-complete-btn ${card.is_complete ? 'checked' : ''}`}
                        onClick={async (e) => {
                          e.stopPropagation();
                          await handleToggleComplete(card.id, !card.is_complete);
                        }}
                        title={card.is_complete ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {card.is_complete ? <Check size={10} /> : null}
                      </button>
                      <span className="kb-list-priority" style={{ background: pri.color }} title={pri.label} />
                      <div className="kb-list-row-main">
                        <span className={`kb-list-row-title ${card.is_complete ? 'completed' : ''}`}>{card.title}</span>
                        {labels.length > 0 && (
                          <div className="kb-list-row-labels">
                            {labels.map(l => (
                              <span key={l.id} className="kb-list-row-label" style={{ background: l.color }}>{l.name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="kb-list-row-meta">
                        {card.assignee && (
                          <span className="kb-list-row-assignee"><User size={11} /> {card.assignee}</span>
                        )}
                        {(card.start_date || card.due_date) && (
                          <span className={`kb-list-row-date ${isOverdue ? 'overdue' : ''} ${isDueSoon ? 'due-soon' : ''}`}>
                            <CalendarDays size={11} />
                            {card.due_date
                              ? (isOverdue ? 'Overdue' : isDueSoon ? (daysUntilDue === 0 ? 'Today' : daysUntilDue === 1 ? 'Tomorrow' : 'In 2 days')
                                : new Date(card.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
                              : card.start_date && new Date(card.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            }
                            {card.due_date && card.due_time && ` · ${formatTimeAmPm(card.due_time)} Central`}
                          </span>
                        )}
                        {comments.length > 0 && (
                          <span className="kb-list-row-count"><MessageSquare size={11} /> {comments.length}</span>
                        )}
                        {checklists.length > 0 && (
                          <span className={`kb-list-row-count ${completedCount === checklists.length ? 'done' : ''} ${listClOverdue > 0 ? 'overdue' : listClDueToday > 0 ? 'due-today' : ''}`}>
                            <CheckSquare size={11} /> {completedCount}/{checklists.length}
                            {listClOverdue > 0 && <span className="kb-card-cl-badge overdue">{listClOverdue} overdue</span>}
                            {listClOverdue === 0 && listClDueToday > 0 && <span className="kb-card-cl-badge due-today">{listClDueToday} today</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {addingCardCol === col.id && (
                  <div className="kb-list-quick-add">
                    <input
                      ref={newCardRef}
                      className="kb-input"
                      value={newCardTitle}
                      onChange={e => setNewCardTitle(e.target.value)}
                      placeholder="Card title..."
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleQuickAddCard(col.id);
                        if (e.key === 'Escape') { setAddingCardCol(null); setNewCardTitle(''); }
                      }}
                    />
                    <div className="kb-quick-add-actions">
                      <button className="kb-btn kb-btn-primary kb-btn-sm" onClick={() => handleQuickAddCard(col.id)}>Add</button>
                      <button className="kb-btn-icon-sm" onClick={() => { setAddingCardCol(null); setNewCardTitle(''); }}><X size={14} /></button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Kanban columns ── */}
      {boardView === 'board' && <div className="kb-columns-scroll">
        <div className="kb-columns">
          {columns.map(col => {
            const colCards = getColumnCards(col.id);
            const isCollapsed = collapsedSet.has(col.id) && dragExpandedList !== col.id;

            if (isCollapsed) {
              return (
                <div
                  key={col.id}
                  className={`kb-column-collapsed ${dragOverCol === col.id ? 'drag-over' : ''}`}
                  onClick={() => toggleCollapsed(col.id)}
                  onDragOver={e => { e.preventDefault(); setDragExpandedList(col.id); setDragOverCol(col.id); }}
                  onDragLeave={() => { setDragOverCol(null); setDragExpandedList(null); }}
                  onDrop={e => handleDrop(e, col.id)}
                  title={`Expand "${col.title}"`}
                >
                  <span className="kb-column-dot" style={{ background: col.color }} />
                  <span className="kb-column-count">{colCards.length}</span>
                  <span className="kb-column-collapsed-title">{col.title}</span>
                </div>
              );
            }

            return (
              <div
                key={col.id}
                className={`kb-column ${dragOverCol === col.id ? 'drag-over' : ''}`}
                onDragOver={e => handleDragOver(e, col.id)}
                onDragLeave={() => { setDragOverCol(null); setDragExpandedList(null); }}
                onDrop={e => handleDrop(e, col.id)}
              >
                {/* Column header */}
                <div className="kb-column-header">
                  <div className="kb-column-title-row">
                    <div className="kb-color-dot-wrapper">
                      <button
                        className="kb-column-dot"
                        style={{ background: col.color }}
                        onClick={() => setColorPickerColId(colorPickerColId === col.id ? null : col.id)}
                        title="Change column color"
                      />
                      {colorPickerColId === col.id && (
                        <>
                          <div className="kb-click-away" onClick={() => setColorPickerColId(null)} />
                          <div className="kb-color-picker-popover">
                            {COLUMN_COLORS.map(c => (
                              <button
                                key={c}
                                className={`kb-color-swatch${col.color === c ? ' active' : ''}`}
                                style={{ background: c }}
                                onClick={() => { updateColumn(boardId, col.id, { color: c }); setColorPickerColId(null); }}
                                title={c}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <InlineEdit
                      value={col.title}
                      onSave={title => updateColumn(boardId, col.id, { title })}
                      className="kb-column-title"
                    />
                    <span className="kb-column-count">{colCards.length}</span>
                  </div>
                  <div className="kb-column-actions">
                    {columns.indexOf(col) > 0 && (
                      <button
                        className="kb-btn-icon-sm"
                        onClick={() => {
                          const idx = columns.indexOf(col);
                          const newOrder = columns.map((c, i) => {
                            if (i === idx - 1) return { id: c.id, position: columns[idx].position };
                            if (i === idx) return { id: c.id, position: columns[idx - 1].position };
                            return { id: c.id, position: c.position };
                          });
                          reorderColumns(boardId, newOrder);
                        }}
                        title="Move left"
                      >
                        <ChevronLeft size={14} />
                      </button>
                    )}
                    {columns.indexOf(col) < columns.length - 1 && (
                      <button
                        className="kb-btn-icon-sm"
                        onClick={() => {
                          const idx = columns.indexOf(col);
                          const newOrder = columns.map((c, i) => {
                            if (i === idx) return { id: c.id, position: columns[idx + 1].position };
                            if (i === idx + 1) return { id: c.id, position: columns[idx].position };
                            return { id: c.id, position: c.position };
                          });
                          reorderColumns(boardId, newOrder);
                        }}
                        title="Move right"
                      >
                        <ChevronRight size={14} />
                      </button>
                    )}
                    <button className="kb-btn-icon-sm" onClick={() => setAddingCardCol(col.id)} title="Add card">
                      <Plus size={14} />
                    </button>
                    <button className="kb-btn-icon-sm" onClick={() => toggleCollapsed(col.id)} title="Collapse list">
                      <ChevronsLeft size={14} />
                    </button>
                    <button className="kb-btn-icon-sm" onClick={() => setListActionsColId(col.id)} title="List actions">
                      <Zap size={14} />
                    </button>
                    <button
                      className={`kb-btn-icon-sm${(col.automations?.length ?? 0) > 0 ? ' kb-automations-active' : ''}`}
                      onClick={() => setAutomationsColId(col.id)}
                      title="Column automations"
                    >
                      <SlidersHorizontal size={14} />
                    </button>
                    <button
                      className="kb-btn-icon-sm"
                      onClick={() => {
                        if (colCards.length > 0) {
                          if (!confirm(`Delete "${col.title}" column and its ${colCards.length} cards?`)) return;
                        }
                        deleteColumn(boardId, col.id);
                      }}
                      title="Delete column"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Cards */}
                <div className="kb-column-cards">
                  {colCards.map(card => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => handleDragStart(card.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={e => handleCardDragOver(e, card.id, col.id)}
                      onMouseEnter={() => setHoveredCardId(card.id)}
                      onMouseLeave={() => setHoveredCardId(prev => prev === card.id ? null : prev)}
                      className={`kb-card-wrapper ${
                        dragOverCardId === card.id && dragCardId !== card.id
                          ? `drop-${dragOverPos}` : ''
                      } ${hoveredCardId === card.id ? 'kb-card-hovered' : ''}`}
                    >
                      <KanbanCard
                        card={card}
                        onClick={() => openCardDetail(card)}
                        isDragging={dragCardId === card.id}
                        onToggleComplete={() => handleToggleComplete(card.id, !card.is_complete)}
                        onSnooze={() => handleQuickDueDateUpdate(card.id, nextBusinessDay(card.due_date))}
                      />
                      {dueDateCardId === card.id && (
                        <div ref={dueDatePickerRef}>
                          <DueDateQuickPicker
                            dueDate={card.due_date ?? null}
                            onSave={(dueDate) => handleQuickDueDateUpdate(card.id, dueDate)}
                            onClose={() => setDueDateCardId(null)}
                          />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Quick add */}
                  {addingCardCol === col.id && (
                    <div className="kb-quick-add">
                      <input
                        ref={newCardRef}
                        className="kb-input"
                        value={newCardTitle}
                        onChange={handleNewCardTitleChange}
                        placeholder="Card title… (# for labels)"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && hashQuery === null) handleQuickAddCard(col.id);
                          if (e.key === 'Escape') {
                            if (hashQuery !== null) {
                              setNewCardTitle(prev => prev.replace(/#\w*$/, '').trimEnd());
                              setHashQuery(null);
                            } else {
                              setAddingCardCol(null);
                              setNewCardTitle('');
                              setQuickAddLabels([]);
                            }
                          }
                        }}
                      />
                      {hashQuery !== null && (
                        <div className="kb-hash-dropdown">
                          {(() => {
                            const filtered = board.labels.filter(l =>
                              l.name.toLowerCase().includes(hashQuery.toLowerCase())
                            );
                            const usedColors = new Set(board.labels.map(l => l.color));
                            const autoColor = LABEL_COLORS.find(c => !usedColors.has(c.hex))?.hex ?? LABEL_COLORS[0].hex;
                            const showCreate = hashQuery.trim().length > 0 && !board.labels.some(l => l.name.toLowerCase() === hashQuery.toLowerCase());
                            return (
                              <>
                                {filtered.map(l => (
                                  <button
                                    key={l.id}
                                    className={`kb-label-picker-item ${quickAddLabels.includes(l.id) ? 'selected' : ''}`}
                                    onMouseDown={e => { e.preventDefault(); handleHashLabelSelect(l.id); }}
                                  >
                                    <span className="kb-label-dot" style={{ background: l.color }} />
                                    {l.name}
                                  </button>
                                ))}
                                {showCreate && (
                                  <button
                                    className="kb-label-picker-item kb-hash-create"
                                    onMouseDown={async e => {
                                      e.preventDefault();
                                      const name = hashQuery.trim();
                                      const newLabel = await addLabel(boardId, name, autoColor);
                                      if (newLabel) {
                                        setNewCardTitle(prev => prev.replace(/#\w*$/, '').trimEnd());
                                        setQuickAddLabels(prev => [...prev, newLabel.id]);
                                        setHashQuery(null);
                                        newCardRef.current?.focus();
                                      }
                                    }}
                                  >
                                    <span className="kb-label-dot" style={{ background: autoColor }} />
                                    Create "{hashQuery}"
                                  </button>
                                )}
                                {filtered.length === 0 && !showCreate && (
                                  <p className="kb-hash-empty">No labels yet — open Label Manager to add some</p>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                      {quickAddLabels.length > 0 && (
                        <div className="kb-label-chips" style={{ margin: '0 0 4px' }}>
                          {quickAddLabels.map(id => {
                            const l = board.labels.find(bl => bl.id === id);
                            if (!l) return null;
                            return (
                              <span key={id} className="kb-label-chip" style={{ background: l.color + '22', color: l.color, borderColor: l.color + '44' }}>
                                {l.name}
                                <button onMouseDown={e => { e.preventDefault(); setQuickAddLabels(prev => prev.filter(lid => lid !== id)); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', lineHeight: 1 }}>
                                  <X size={10} />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className="kb-quick-add-actions">
                        <button className="kb-btn kb-btn-primary kb-btn-sm" onClick={() => handleQuickAddCard(col.id)}>
                          Add Card
                        </button>
                        <button className="kb-btn-icon-sm" onClick={() => { setAddingCardCol(null); setNewCardTitle(''); setQuickAddLabels([]); setHashQuery(null); }}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Add card button at bottom */}
                {addingCardCol !== col.id && (
                  <button className="kb-add-card-btn" onClick={() => setAddingCardCol(col.id)}>
                    <Plus size={14} />
                    Add a card
                  </button>
                )}
              </div>
            );
          })}

          {/* Add column */}
          <div className="kb-add-column">
            {addingColumn ? (
              <div className="kb-add-column-form">
                <input
                  ref={newColRef}
                  className="kb-input"
                  value={newColTitle}
                  onChange={e => setNewColTitle(e.target.value)}
                  placeholder="Column title..."
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddColumn();
                    if (e.key === 'Escape') { setAddingColumn(false); setNewColTitle(''); }
                  }}
                />
                <div className="kb-quick-add-actions">
                  <button className="kb-add-column-btn" onClick={handleAddColumn}>Add Column</button>
                  <button className="kb-btn-icon-sm" onClick={() => { setAddingColumn(false); setNewColTitle(''); }}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <button className="kb-add-column-btn" onClick={() => setAddingColumn(true)}>
                <Plus size={16} />
                Add Column
              </button>
            )}
          </div>
        </div>
      </div>}

      {/* ── Note Panel (slide-in from right) ── */}
      <div className={`kb-note-panel ${showNotePanel ? 'open' : ''}`}>
        <div className="kb-note-header">
          <div className="kb-note-header-title">
            <StickyNote size={16} />
            Board Notes
          </div>
          <button className="kb-note-close-btn" onClick={closeNotePanel} title="Close notes">
            <X size={18} />
          </button>
        </div>
        <div className="kb-note-toolbar">
          <button className={`kb-note-tool-btn${noteFormats.bold ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); execNoteCmd('bold'); }} title="Bold"><Bold size={14} /></button>
          <button className={`kb-note-tool-btn${noteFormats.italic ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); execNoteCmd('italic'); }} title="Italic"><Italic size={14} /></button>
          <button className={`kb-note-tool-btn${noteFormats.underline ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); execNoteCmd('underline'); }} title="Underline"><Underline size={14} /></button>
          <button className={`kb-note-tool-btn${noteFormats.strikeThrough ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); execNoteCmd('strikeThrough'); }} title="Strikethrough"><Strikethrough size={14} /></button>
          <div className="kb-note-tool-sep" />
          <button className={`kb-note-tool-btn${noteFormats.heading ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); execNoteCmd('formatBlock', '<h3>'); }} title="Heading"><Heading size={14} /></button>
          <button className={`kb-note-tool-btn${noteFormats.unorderedList ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); execNoteCmd('insertUnorderedList'); }} title="Bullet list"><ListBullet size={14} /></button>
          <button className={`kb-note-tool-btn${noteFormats.orderedList ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); execNoteCmd('insertOrderedList'); }} title="Numbered list"><ListOrdered size={14} /></button>
          <div className="kb-note-tool-sep" />
          <button className="kb-note-tool-btn" onMouseDown={e => { e.preventDefault(); insertNoteLink(); }} title="Insert link"><LinkIcon size={14} /></button>
        </div>
        <div className="kb-note-body">
          <div
            ref={noteRef}
            className="kb-note-editable"
            contentEditable
            suppressContentEditableWarning
            onInput={handleNoteInput}
            onBlur={saveNoteNow}
            onClick={e => {
              const target = e.target as HTMLElement;
              const anchor = target.closest('a');
              if (anchor) {
                e.preventDefault();
                window.open(anchor.href, '_blank', 'noopener,noreferrer');
              }
            }}
          />
        </div>
      </div>

      {/* ── Card detail modal ── */}
      {activeCard && (
        <CardDetailModal
          card={activeCard}
          board={board}
          onClose={() => setSelectedCard(null)}
          onUpdate={async (updates) => {
            const cardBeforeUpdate = board.cards.find(c => c.id === activeCard.id);
            const hadDueDateBefore = !!cardBeforeUpdate?.due_date;
            const prevLabelIds = (cardBeforeUpdate?.labels || []).map(l => l.id);
            await updateCard(boardId, activeCard.id, updates);
            if (updates.is_complete === true && cardBeforeUpdate) {
              const col = board.columns.find(c => c.id === cardBeforeUpdate.column_id);
              const moveAction = col?.automations?.find(a => a.type === 'move_completed');
              if (moveAction?.type === 'move_completed') {
                await moveCard(boardId, activeCard.id, moveAction.value, 0);
              }
            }
            if ('due_date' in updates && updates.due_date) {
              await runDueDateMoveAutomation(activeCard.id, hadDueDateBefore);
            }
            if (updates.is_focused === true) {
              await runCardMoveTrigger(activeCard.id, 'move_on_focus');
            }
            if ('label_ids' in updates && Array.isArray(updates.label_ids)) {
              const added = updates.label_ids.filter((id: string) => !prevLabelIds.includes(id));
              if (added.length) await runCardMoveTrigger(activeCard.id, 'move_on_label', added);
            }
          }}
          onDelete={async () => { await deleteCard(boardId, activeCard.id); setSelectedCard(null); }}
          onAddComment={async (content) => { await addComment(boardId, activeCard.id, content); }}
          onUpdateComment={async (commentId, content) => { await updateComment(boardId, activeCard.id, commentId, content); }}
          onDeleteComment={async (commentId) => { await deleteComment(boardId, activeCard.id, commentId); }}
          onAddChecklistItem={async (title, groupId) => { await addChecklistItem(boardId, activeCard.id, title, groupId); }}
          onToggleChecklistItem={async (itemId, val) => { await toggleChecklistItem(boardId, activeCard.id, itemId, val); }}
          onUpdateChecklistDueDate={async (itemId, dueDate) => { await updateChecklistItemDueDate(boardId, activeCard.id, itemId, dueDate); }}
          onRenameChecklistItem={async (itemId, title) => { await renameChecklistItem(boardId, activeCard.id, itemId, title); }}
          onUpdateChecklistItemUrl={async (itemId, url) => { await updateChecklistItemUrl(boardId, activeCard.id, itemId, url); }}
          onReorderChecklistItems={async (orderedItemIds) => { await reorderChecklistItems(boardId, activeCard.id, orderedItemIds); }}
          onDeleteChecklistItem={async (itemId) => { await deleteChecklistItem(boardId, activeCard.id, itemId); }}
          onPromoteUngrouped={async (title) => await promoteUngroupedToGroup(boardId, activeCard.id, title)}
          onAddChecklistGroup={async (title) => await addChecklistGroup(boardId, activeCard.id, title)}
          onRenameChecklistGroup={async (groupId, title) => { await renameChecklistGroup(boardId, activeCard.id, groupId, title); }}
          onDeleteChecklistGroup={async (groupId) => { await deleteChecklistGroup(boardId, activeCard.id, groupId); }}
          onConvertToCard={async (itemId, title, columnId) => {
            await addCard(boardId, { column_id: columnId, title });
            await deleteChecklistItem(boardId, activeCard.id, itemId);
          }}
          onMoveCard={async (newColumnId) => {
            await moveCard(boardId, activeCard.id, newColumnId, 0);
            await runColumnAutomations(activeCard.id, newColumnId);
          }}
          onMoveToBoardCard={async (targetBoardId, targetColumnId) => {
            await moveToBoardCard(activeCard.id, targetBoardId, targetColumnId);
          }}
          checklistTemplates={checklistTemplates}
          onSaveTemplate={async (name, items) => { await saveChecklistTemplate(boardId, name, items); }}
          onDeleteTemplate={async (templateId) => { await deleteChecklistTemplate(templateId); }}
          onApplyTemplate={async (templateId) => { await applyChecklistTemplate(boardId, activeCard.id, templateId); }}
          onAssignCard={async (userId) => { await assignCard(activeCard.id, userId); await runCardMoveTrigger(activeCard.id, 'move_on_assigned'); }}
          onUnassignCard={async (userId) => { await unassignCard(activeCard.id, userId); }}
          fetchSystemUsers={fetchSystemUsers}
          onDuplicate={async () => {
            const newCard = await addCard(boardId, {
              column_id: activeCard.column_id,
              title: activeCard.title + ' (copy)',
              description: activeCard.description || undefined,
              priority: activeCard.priority,
              start_date: activeCard.start_date || undefined,
              due_date: activeCard.due_date || undefined,
              due_time: activeCard.due_time || null,
              label_ids: (activeCard.labels || []).map(l => l.id),
            });
            if (newCard && activeCard.checklists?.length) {
              for (const item of activeCard.checklists) {
                await addChecklistItem(boardId, newCard.id, item.title);
              }
            }
          }}
        />
      )}

      {/* ── Keyboard Shortcuts Legend (desktop only) ── */}
      <div className="kb-shortcut-bar">
        <span className="kb-shortcut-hint">Hover a card &amp; press:</span>
        <span className="kb-shortcut-key"><kbd>Enter</kbd> Open</span>
        <span className="kb-shortcut-key"><kbd>D</kbd> Due date</span>
        <span className="kb-shortcut-key"><kbd>M</kbd> Assign to me</span>
        <span className="kb-shortcut-key"><kbd>C</kbd> Complete</span>
        <span className="kb-shortcut-key"><kbd>F</kbd> Focus</span>
        <span className="kb-shortcut-key"><kbd>Del</kbd> Delete</span>
      </div>

      {/* ── List Actions Modal ── */}
      {listActionsColId && board && (() => {
        const col = board.columns.find(c => c.id === listActionsColId);
        if (!col) return null;
        const colCards = board.cards.filter(c => c.column_id === col.id && !c.is_archived);
        return (
          <ListActionsModal
            column={col}
            cards={colCards}
            board={board}
            onUpdateCard={async (cardId, updates) => {
              const cardBefore = board.cards.find(c => c.id === cardId);
              const hadDueDateBefore = !!cardBefore?.due_date;
              const prevLabelIds = (cardBefore?.labels || []).map(l => l.id);
              await updateCard(boardId, cardId, updates);
              if ('due_date' in updates && updates.due_date) {
                await runDueDateMoveAutomation(cardId, hadDueDateBefore);
              }
              if ('label_ids' in updates && Array.isArray(updates.label_ids)) {
                const added = updates.label_ids.filter((id: string) => !prevLabelIds.includes(id));
                if (added.length) await runCardMoveTrigger(cardId, 'move_on_label', added);
              }
            }}
            onDeleteCard={async (cardId) => { await deleteCard(boardId, cardId); }}
            onMoveCard={async (cardId, newColId) => { await moveCard(boardId, cardId, newColId, 0); await runColumnAutomations(cardId, newColId); }}
            onAddChecklistItem={async (cardId, title) => { await addChecklistItem(boardId, cardId, title); }}
            checklistTemplates={checklistTemplates}
            onApplyTemplate={async (cardId, templateId) => { await applyChecklistTemplate(boardId, cardId, templateId); }}
            onSortCards={async (columnId, direction) => {
              const colCards = board.cards
                .filter(c => c.column_id === columnId && !c.is_archived)
                .sort((a, b) => {
                  if (direction === 'asc') return a.title.localeCompare(b.title);
                  if (direction === 'desc') return b.title.localeCompare(a.title);
                  // Sort by due date — cards without a due date go last
                  const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
                  const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
                  return direction === 'due_asc' ? da - db : db - da;
                });
              for (let i = 0; i < colCards.length; i++) {
                await updateCard(boardId, colCards[i].id, { position: i });
              }
            }}
            onMoveToBoardCards={async (targetBoardId, targetColumnId) => {
              const colCards = board.cards.filter(c => c.column_id === col.id && !c.is_archived);
              for (const card of colCards) {
                await moveToBoardCard(card.id, targetBoardId, targetColumnId);
              }
            }}
            onClose={() => setListActionsColId(null)}
          />
        );
      })()}

      {/* ── Column Automations Modal ── */}
      {automationsColId && board && (() => {
        const col = board.columns.find(c => c.id === automationsColId);
        if (!col) return null;
        return (
          <ColumnAutomationsModal
            column={col}
            columns={board.columns.filter(c => c.id !== col.id)}
            labels={board.labels}
            checklistTemplates={checklistTemplates}
            onSave={async (automations) => {
              await updateColumn(boardId, col.id, { automations });
            }}
            onClose={() => setAutomationsColId(null)}
          />
        );
      })()}
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute>
      <BoardPage />
    </ProtectedRoute>
  );
}
