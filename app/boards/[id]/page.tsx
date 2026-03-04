'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProjectBoard, FullBoard } from '../../../hooks/useProjectBoard';
import { useAuth } from '../../../contexts/AuthContext';
import ProtectedRoute from '../../../components/ProtectedRoute';
import type { BoardCard, BoardColumn, BoardLabel, CardPriority } from '../../../lib/supabase';
import {
  Plus, ArrowLeft, Search, MoreHorizontal, Trash2, Edit3,
  GripVertical, MessageSquare, CheckSquare, CalendarDays, Tag,
  X, ChevronDown, Clock, User, Flag, AlertCircle, Pencil,
  FolderKanban, Check, Globe, Lock, StickyNote,
} from '../../../components/icons/BoardIcons';

/* ═══════════════════════════════════════════════════════════
   Priority helpers
   ═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   Linkify helper – turns URLs in text into clickable <a> tags
   ═══════════════════════════════════════════════════════════ */
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;
function linkifyText(text: string): React.ReactNode[] {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) =>
    URL_REGEX.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="kb-link"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/** Render text with [link](url) and bare URLs as clickable links */
function renderRichText(text: string): React.ReactNode[] {
  // Split by lines, linkify [text](url) and bare URLs
  return text.split('\n').map((line, lineIdx, arr) => {
    const parts: React.ReactNode[] = [];
    const urlRegex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<>"']+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = urlRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`${lineIdx}-t-${key++}`}>{line.slice(lastIndex, match.index)}</span>);
      }
      if (match[1]) {
        // [text](url)
        parts.push(<a key={`${lineIdx}-a-${key++}`} href={match[3]} target="_blank" rel="noopener noreferrer" className="kb-link">{match[2]}</a>);
      } else if (match[4]) {
        // bare URL
        parts.push(<a key={`${lineIdx}-a-${key++}`} href={match[4]} target="_blank" rel="noopener noreferrer" className="kb-link">{match[4]}</a>);
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
      parts.push(<span key={`${lineIdx}-e-${key++}`}>{line.slice(lastIndex)}</span>);
    }
    if (parts.length === 0) parts.push(<span key={`${lineIdx}-empty`}>{' '}</span>);
    return <React.Fragment key={lineIdx}>{parts}{lineIdx < arr.length - 1 && <br />}</React.Fragment>;
  });
}

const PRIORITY_CONFIG: Record<CardPriority, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  high:   { label: 'High',   color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  urgent: { label: 'Urgent', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
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

/* ═══════════════════════════════════════════════════════════
   CardDetailModal
   ═══════════════════════════════════════════════════════════ */
function CardDetailModal({
  card,
  board,
  onClose,
  onUpdate,
  onDelete,
  onAddComment,
  onDeleteComment,
  onAddChecklistItem,
  onToggleChecklistItem,
  onDeleteChecklistItem,
}: {
  card: BoardCard;
  board: FullBoard;
  onClose: () => void;
  onUpdate: (updates: any) => Promise<void>;
  onDelete: () => Promise<void>;
  onAddComment: (content: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onAddChecklistItem: (title: string) => Promise<void>;
  onToggleChecklistItem: (itemId: string, val: boolean) => Promise<void>;
  onDeleteChecklistItem: (itemId: string) => Promise<void>;
}) {
  const [editTitle, setEditTitle] = useState(card.title);
  const [editDesc, setEditDesc] = useState(card.description || '');
  const [editPriority, setEditPriority] = useState<CardPriority>(card.priority);
  const [editStartDate, setEditStartDate] = useState(card.start_date || '');
  const [editDueDate, setEditDueDate] = useState(card.due_date || '');
  const [editAssignee, setEditAssignee] = useState(card.assignee || '');
  const [editLabels, setEditLabels] = useState<string[]>((card.labels || []).map(l => l.id));
  const [commentText, setCommentText] = useState('');
  const [checklistText, setChecklistText] = useState('');
  const [saving, setSaving] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => { if (editingDesc && descRef.current) { descRef.current.focus(); descRef.current.setSelectionRange(descRef.current.value.length, descRef.current.value.length); } }, [editingDesc]);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({
      title: editTitle,
      description: editDesc,
      priority: editPriority,
      start_date: editStartDate || null,
      due_date: editDueDate || null,
      assignee: editAssignee || null,
      label_ids: editLabels,
    });
    setSaving(false);
    onClose();
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    await onAddComment(commentText.trim());
    setCommentText('');
  };

  const handleAddChecklist = async () => {
    if (!checklistText.trim()) return;
    await onAddChecklistItem(checklistText.trim());
    setChecklistText('');
  };

  const toggleLabel = (labelId: string) => {
    setEditLabels(prev => prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]);
  };

  const column = board.columns.find(c => c.id === card.column_id);
  const checklists = card.checklists || [];
  const completedCount = checklists.filter(c => c.is_completed).length;

  return (
    <div className="kb-modal-overlay" onClick={onClose}>
      <div className="kb-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Close */}
        <button className="kb-detail-close" onClick={onClose}><X size={18} /></button>

        <div className="kb-detail-body">
          {/* Left: Main content */}
          <div className="kb-detail-main">
            {/* Title */}
            <input
              ref={titleRef}
              className="kb-detail-title-input"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder="Card title..."
            />

            {/* Column badge */}
            {column && (
              <div className="kb-detail-column-badge" style={{ borderColor: column.color, color: column.color }}>
                {column.title}
              </div>
            )}

            {/* Labels */}
            <div style={{ marginBottom: 16 }}>
              <div className="kb-detail-section-label">
                <Tag size={13} />
                Labels
                <button className="kb-btn-icon-sm" onClick={() => setShowLabelPicker(!showLabelPicker)}>
                  {showLabelPicker ? <X size={12} /> : <Plus size={12} />}
                </button>
              </div>
              <div className="kb-label-chips">
                {editLabels.map(labelId => {
                  const l = board.labels.find(bl => bl.id === labelId);
                  if (!l) return null;
                  return (
                    <span key={l.id} className="kb-label-chip" style={{ background: l.color + '22', color: l.color, borderColor: l.color + '44' }}>
                      {l.name}
                      <button onClick={() => toggleLabel(l.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, marginLeft: 4 }}>
                        <X size={10} />
                      </button>
                    </span>
                  );
                })}
              </div>
              {showLabelPicker && (
                <div className="kb-label-picker">
                  {board.labels.map(l => (
                    <button
                      key={l.id}
                      className={`kb-label-picker-item ${editLabels.includes(l.id) ? 'selected' : ''}`}
                      onClick={() => toggleLabel(l.id)}
                      style={{ '--label-color': l.color } as any}
                    >
                      <span className="kb-label-dot" style={{ background: l.color }} />
                      {l.name}
                      {editLabels.includes(l.id) && <Check size={12} style={{ marginLeft: 'auto', color: l.color }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            <div style={{ marginBottom: 16 }}>
              <div className="kb-detail-section-label">
                <Edit3 size={13} /> Description
                {!editingDesc && editDesc && (
                  <button className="kb-btn-icon-sm" onClick={() => setEditingDesc(true)} title="Edit description">
                    <Pencil size={11} />
                  </button>
                )}
              </div>
              {editingDesc ? (
                <textarea
                  ref={descRef}
                  className="kb-textarea"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="Add a more detailed description..."
                  rows={6}
                  onBlur={() => setEditingDesc(false)}
                  onKeyDown={e => { if (e.key === 'Escape') setEditingDesc(false); }}
                />
              ) : (
                <div
                  className="kb-desc-display"
                  onDoubleClick={() => setEditingDesc(true)}
                  title="Double-click to edit"
                >
                  {editDesc ? (
                    editDesc.split('\n').map((line, i) => (
                      <p key={i} style={{ margin: 0 }}>{linkifyText(line)}</p>
                    ))
                  ) : (
                    <span className="kb-desc-placeholder">Double-click to add a description...</span>
                  )}
                </div>
              )}
            </div>

            {/* Checklist */}
            <div style={{ marginBottom: 16 }}>
              <div className="kb-detail-section-label">
                <CheckSquare size={13} />
                Checklist {checklists.length > 0 && `(${completedCount}/${checklists.length})`}
              </div>
              {checklists.length > 0 && (
                <div className="kb-checklist-progress">
                  <div className="kb-checklist-bar">
                    <div
                      className="kb-checklist-fill"
                      style={{ width: `${checklists.length > 0 ? (completedCount / checklists.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="kb-checklist-items">
                {checklists.map(item => (
                  <div key={item.id} className="kb-checklist-item">
                    <button
                      className={`kb-checkbox ${item.is_completed ? 'checked' : ''}`}
                      onClick={() => onToggleChecklistItem(item.id, !item.is_completed)}
                    >
                      {item.is_completed && <Check size={11} />}
                    </button>
                    <span className={`kb-checklist-text ${item.is_completed ? 'completed' : ''}`}>
                      {item.title}
                    </span>
                    <button className="kb-btn-icon-sm" onClick={() => onDeleteChecklistItem(item.id)}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="kb-checklist-add">
                <input
                  className="kb-input"
                  value={checklistText}
                  onChange={e => setChecklistText(e.target.value)}
                  placeholder="Add checklist item..."
                  onKeyDown={e => e.key === 'Enter' && handleAddChecklist()}
                  style={{ flex: 1 }}
                />
                <button className="kb-btn kb-btn-primary kb-btn-sm" onClick={handleAddChecklist} disabled={!checklistText.trim()}>
                  Add
                </button>
              </div>
            </div>

            {/* Comments */}
            <div>
              <div className="kb-detail-section-label">
                <MessageSquare size={13} />
                Comments ({(card.comments || []).length})
              </div>
              <div className="kb-comments">
                {(card.comments || []).map(comment => (
                  <div key={comment.id} className="kb-comment">
                    <div className="kb-comment-header">
                      <span className="kb-comment-author">{comment.users?.name || 'Unknown'}</span>
                      <span className="kb-comment-date">
                        {new Date(comment.created_at).toLocaleDateString()} {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button className="kb-btn-icon-sm" onClick={() => onDeleteComment(comment.id)}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                    <p className="kb-comment-text">
                      {comment.content.split('\n').map((line, i, arr) => (
                        <span key={i}>{linkifyText(line)}{i < arr.length - 1 && <br />}</span>
                      ))}
                    </p>
                  </div>
                ))}
              </div>
              <div className="kb-comment-add">
                <textarea
                  className="kb-textarea"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  rows={2}
                />
                <button className="kb-btn kb-btn-primary kb-btn-sm" onClick={handleAddComment} disabled={!commentText.trim()} style={{ marginTop: 8, alignSelf: 'flex-end' }}>
                  Comment
                </button>
              </div>
            </div>
          </div>

          {/* Right: Sidebar */}
          <div className="kb-detail-sidebar">
            {/* Priority */}
            <div className="kb-form-group">
              <div className="kb-detail-section-label"><Flag size={13} /> Priority</div>
              <div className="kb-priority-grid">
                {(Object.keys(PRIORITY_CONFIG) as CardPriority[]).map(p => (
                  <button
                    key={p}
                    className={`kb-priority-btn ${editPriority === p ? 'active' : ''}`}
                    style={{
                      '--pri-color': PRIORITY_CONFIG[p].color,
                      '--pri-bg': PRIORITY_CONFIG[p].bg,
                    } as any}
                    onClick={() => setEditPriority(p)}
                  >
                    {PRIORITY_CONFIG[p].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assignee */}
            <div className="kb-form-group">
              <div className="kb-detail-section-label"><User size={13} /> Assignee</div>
              <input
                className="kb-input"
                value={editAssignee}
                onChange={e => setEditAssignee(e.target.value)}
                placeholder="Assign to..."
              />
            </div>

            {/* Dates */}
            <div className="kb-form-group">
              <div className="kb-detail-section-label"><CalendarDays size={13} /> Start Date</div>
              <input
                className="kb-input"
                type="date"
                value={editStartDate}
                onChange={e => setEditStartDate(e.target.value)}
              />
            </div>
            <div className="kb-form-group">
              <div className="kb-detail-section-label"><Clock size={13} /> Due Date</div>
              <input
                className="kb-input"
                type="date"
                value={editDueDate}
                onChange={e => setEditDueDate(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div style={{ borderTop: '1px solid #2a2d3a', paddingTop: 16, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="kb-btn kb-btn-primary" onClick={handleSave} disabled={saving || !editTitle.trim()} style={{ width: '100%', justifyContent: 'center' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                className="kb-btn kb-btn-danger"
                onClick={async () => {
                  if (confirm('Delete this card?')) {
                    await onDelete();
                    onClose();
                  }
                }}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Trash2 size={13} />
                Delete Card
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   KanbanCard
   ═══════════════════════════════════════════════════════════ */
function KanbanCard({
  card,
  onClick,
  isDragging,
}: {
  card: BoardCard;
  onClick: () => void;
  isDragging?: boolean;
}) {
  const pri = PRIORITY_CONFIG[card.priority] || PRIORITY_CONFIG.medium;
  const labels = card.labels || [];
  const comments = card.comments || [];
  const checklists = card.checklists || [];
  const completedCount = checklists.filter(c => c.is_completed).length;
  const isOverdue = card.due_date && new Date(card.due_date) < new Date() && card.priority !== 'low';

  return (
    <div
      className={`kb-card ${isDragging ? 'dragging' : ''}`}
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

      {/* Title */}
      <p className="kb-card-title">{card.title}</p>

      {/* Metadata row */}
      <div className="kb-card-meta">
        {/* Priority */}
        <span className="kb-card-priority" style={{ color: pri.color, background: pri.bg }}>
          <Flag size={10} />
          {pri.label}
        </span>

        {/* Due date */}
        {card.due_date && (
          <span className={`kb-card-due ${isOverdue ? 'overdue' : ''}`}>
            <CalendarDays size={10} />
            {new Date(card.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}

        {/* Right side: comment/checklist counts */}
        <span className="kb-card-counts">
          {comments.length > 0 && (
            <span className="kb-card-count"><MessageSquare size={10} /> {comments.length}</span>
          )}
          {checklists.length > 0 && (
            <span className={`kb-card-count ${completedCount === checklists.length ? 'done' : ''}`}>
              <CheckSquare size={10} /> {completedCount}/{checklists.length}
            </span>
          )}
        </span>
      </div>

      {/* Assignee */}
      {card.assignee && (
        <div className="kb-card-assignee">
          <User size={10} />
          {card.assignee}
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
  { hex: '#64748b', name: 'Slate' },
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
              style={{ background: newColor }}
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
                  style={{ background: c.hex }}
                  onClick={() => { setNewColor(c.hex); setShowNewColorPicker(false); }}
                  title={c.name}
                >
                  {newColor === c.hex && <Check size={12} />}
                  <span className="kb-lm-color-name">{c.name}</span>
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
          {board.labels.map(label => (
            <div key={label.id} className="kb-lm-item">
              {editingId === label.id ? (
                /* Editing mode */
                <div className="kb-lm-edit-row">
                  <button
                    className="kb-lm-color-btn"
                    style={{ background: editColor }}
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
                  <span className="kb-lm-label-preview" style={{ background: label.color + '22', color: label.color, borderColor: label.color + '44' }}>
                    <span className="kb-label-dot" style={{ background: label.color }} />
                    {label.name}
                  </span>
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
                      style={{ background: c.hex }}
                      onClick={() => { setEditColor(c.hex); setShowEditColorPicker(false); }}
                      title={c.name}
                    >
                      {editColor === c.hex && <Check size={12} />}
                      <span className="kb-lm-color-name">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
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
  const boardId = params.id as string;
  const { user } = useAuth();
  const {
    board, fetchBoard, updateBoard, deleteBoard: deleteBoardFn,
    addColumn, updateColumn, deleteColumn, reorderColumns,
    addCard, updateCard, deleteCard, moveCard,
    addComment, deleteComment,
    addChecklistItem, toggleChecklistItem, deleteChecklistItem,
    addLabel, updateLabel, deleteLabel,
    loading, setBoard,
  } = useProjectBoard();

  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<CardPriority | ''>('');
  const [filterLabel, setFilterLabel] = useState('');
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [addingCardCol, setAddingCardCol] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const [showBoardMenu, setShowBoardMenu] = useState(false);
  const [editingBoardTitle, setEditingBoardTitle] = useState(false);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [showNotePanel, setShowNotePanel] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const newCardRef = useRef<HTMLInputElement>(null);
  const newColRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (boardId) fetchBoard(boardId);
  }, [boardId, fetchBoard]);

  // Sync note text when board loads
  useEffect(() => {
    if (board?.notes != null) setNoteText(board.notes);
  }, [board?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNote = useCallback(async () => {
    if (!board) return;
    if (noteText !== (board.notes || '')) {
      await updateBoard(boardId, { notes: noteText });
    }
    setEditingNote(false);
  }, [board, boardId, noteText, updateBoard]);

  useEffect(() => {
    if (editingNote && noteRef.current) {
      noteRef.current.focus();
      noteRef.current.setSelectionRange(noteRef.current.value.length, noteRef.current.value.length);
    }
  }, [editingNote]);



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
    return cards;
  }, [board, search, filterPriority, filterLabel]);

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
  };

  const handleDrop = async (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!dragCardId || !board) return;

    const cardsInCol = getColumnCards(colId);
    const newPos = cardsInCol.length; // drop at end

    await moveCard(boardId, dragCardId, colId, newPos);
    setDragCardId(null);
  };

  const handleDragEnd = () => {
    setDragCardId(null);
    setDragOverCol(null);
  };

  // ── Quick add card ──
  const handleQuickAddCard = async (colId: string) => {
    if (!newCardTitle.trim()) return;
    await addCard(boardId, { column_id: colId, title: newCardTitle });
    setNewCardTitle('');
    setAddingCardCol(null);
  };

  // ── Add column ──
  const handleAddColumn = async () => {
    if (!newColTitle.trim()) return;
    await addColumn(boardId, newColTitle);
    setNewColTitle('');
    setAddingColumn(false);
  };

  // When opening card detail, find the latest version from board state
  const openCardDetail = useCallback((card: BoardCard) => {
    setSelectedCard(card);
  }, []);

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
          <button className="kb-btn kb-btn-ghost" onClick={() => router.push('/boards')} style={{ marginTop: 16 }}>
            <ArrowLeft size={14} /> Back to Boards
          </button>
        </div>
      </div>
    );
  }

  const columns = [...board.columns].sort((a, b) => a.position - b.position);

  return (
    <div className="kb-root">
      <style>{kanbanStyles}</style>

      {/* ── Top bar ── */}
      <div className="kb-topbar">
        <div className="kb-topbar-left">
          <button className="kb-btn-icon" onClick={() => router.push('/boards')} title="Back to boards">
            <ArrowLeft size={18} />
          </button>
          <FolderKanban size={20} style={{ color: '#818cf8' }} />
          <InlineEdit
            value={board.title}
            onSave={title => updateBoard(boardId, { title })}
            className="kb-board-title"
          />
          {board.is_public && (
            <span className="kb-public-badge"><Globe size={11} /> Public</span>
          )}
        </div>

        <div className="kb-topbar-right">
          {/* Search */}
          <div className="kb-search-box">
            <Search size={14} style={{ color: '#6b7280' }} />
            <input
              className="kb-search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search cards..."
            />
            {search && (
              <button className="kb-btn-icon-sm" onClick={() => setSearch('')}><X size={12} /></button>
            )}
          </div>

          {/* Priority filter */}
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

          {/* Label filter */}
          {board.labels.length > 0 && (
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
          )}

          {/* Note panel toggle */}
          <button
            className={`kb-note-toggle ${showNotePanel ? 'kb-note-toggle-active' : ''}`}
            onClick={() => setShowNotePanel(!showNotePanel)}
            title={showNotePanel ? 'Close Notes' : 'Open Notes'}
          >
            <StickyNote size={15} />
            {showNotePanel ? 'Close Notes' : 'Notes'}
          </button>

          {/* Board menu */}
          <div style={{ position: 'relative' }}>
            <button className="kb-btn-icon" onClick={() => setShowBoardMenu(!showBoardMenu)}>
              <MoreHorizontal size={18} />
            </button>
            {showBoardMenu && (
              <>
                <div className="kb-click-away" onClick={() => setShowBoardMenu(false)} />
                <div className="kb-dropdown">
                  <button className="kb-dropdown-item" onClick={() => { setShowBoardMenu(false); router.push('/boards'); }}>
                    <ArrowLeft size={14} /> All Boards
                  </button>
                  <button className="kb-dropdown-item" onClick={() => { setShowBoardMenu(false); setShowLabelManager(true); }}>
                    <Tag size={14} /> Manage Labels
                  </button>
                  {board.user_id === user?.id && (
                    <button
                      className="kb-dropdown-item"
                      onClick={async () => {
                        await updateBoard(boardId, { is_public: !board.is_public });
                        setShowBoardMenu(false);
                      }}
                    >
                      {board.is_public ? <><Lock size={14} /> Make Private</> : <><Globe size={14} /> Share (Make Public)</>}
                    </button>
                  )}
                  <button
                    className="kb-dropdown-item danger"
                    onClick={async () => {
                      if (confirm('Delete this board and all its cards? This cannot be undone.')) {
                        await deleteBoardFn(boardId);
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

      {/* ── Kanban columns ── */}
      <div className="kb-columns-scroll">
        <div className="kb-columns">
          {columns.map(col => {
            const colCards = getColumnCards(col.id);
            return (
              <div
                key={col.id}
                className={`kb-column ${dragOverCol === col.id ? 'drag-over' : ''}`}
                onDragOver={e => handleDragOver(e, col.id)}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={e => handleDrop(e, col.id)}
              >
                {/* Column header */}
                <div className="kb-column-header">
                  <div className="kb-column-title-row">
                    <span className="kb-column-dot" style={{ background: col.color }} />
                    <InlineEdit
                      value={col.title}
                      onSave={title => updateColumn(boardId, col.id, { title })}
                      className="kb-column-title"
                    />
                    <span className="kb-column-count">{colCards.length}</span>
                  </div>
                  <div className="kb-column-actions">
                    <button className="kb-btn-icon-sm" onClick={() => setAddingCardCol(col.id)} title="Add card">
                      <Plus size={14} />
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
                    >
                      <KanbanCard
                        card={card}
                        onClick={() => openCardDetail(card)}
                        isDragging={dragCardId === card.id}
                      />
                    </div>
                  ))}

                  {/* Quick add */}
                  {addingCardCol === col.id && (
                    <div className="kb-quick-add">
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
                        <button className="kb-btn kb-btn-primary kb-btn-sm" onClick={() => handleQuickAddCard(col.id)}>
                          Add Card
                        </button>
                        <button className="kb-btn-icon-sm" onClick={() => { setAddingCardCol(null); setNewCardTitle(''); }}>
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
                  <button className="kb-btn kb-btn-primary kb-btn-sm" onClick={handleAddColumn}>Add Column</button>
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
      </div>

      {/* ── Note Panel (slide-in from right) ── */}
      <div className={`kb-note-panel ${showNotePanel ? 'open' : ''}`}>
        <div className="kb-note-header">
          <div className="kb-note-header-title">
            <StickyNote size={16} />
            Board Notes
          </div>
          <button className="kb-note-close-btn" onClick={() => setShowNotePanel(false)} title="Close notes">
            <X size={18} />
          </button>
        </div>
        <div className="kb-note-body">
          {editingNote ? (
            <>
              <textarea
                ref={noteRef}
                className="kb-note-textarea"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onBlur={saveNote}
                placeholder="Write your notes here..."
              />
            </>
          ) : (
            <div
              className="kb-note-rendered"
              onDoubleClick={() => setEditingNote(true)}
              title="Double-click to edit"
            >
              {noteText.trim()
                ? renderRichText(noteText)
                : <span className="kb-note-placeholder">Double-click to add notes...<br /><br />URLs will be clickable. Use [text](url) for named links.</span>
              }
            </div>
          )}
        </div>
        {!editingNote && noteText.trim() && (
          <div className="kb-note-footer">
            <button
              className="kb-btn kb-btn-sm"
              onClick={() => setEditingNote(true)}
              style={{ gap: 4 }}
            >
              <Pencil size={12} /> Edit
            </button>
          </div>
        )}
        <div className="kb-note-watermark">
          URLs auto-link&nbsp;&nbsp;&bull;&nbsp;&nbsp;<span className="kb-link">[text](url)</span> for named links
        </div>
      </div>

      {/* ── Card detail modal ── */}
      {activeCard && (
        <CardDetailModal
          card={activeCard}
          board={board}
          onClose={() => setSelectedCard(null)}
          onUpdate={async (updates) => { await updateCard(boardId, activeCard.id, updates); }}
          onDelete={async () => { await deleteCard(boardId, activeCard.id); setSelectedCard(null); }}
          onAddComment={async (content) => { await addComment(boardId, activeCard.id, content); }}
          onDeleteComment={async (commentId) => { await deleteComment(boardId, activeCard.id, commentId); }}
          onAddChecklistItem={async (title) => { await addChecklistItem(boardId, activeCard.id, title); }}
          onToggleChecklistItem={async (itemId, val) => { await toggleChecklistItem(boardId, activeCard.id, itemId, val); }}
          onDeleteChecklistItem={async (itemId) => { await deleteChecklistItem(boardId, activeCard.id, itemId); }}
        />
      )}
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

/* ═══════════════════════════════════════════════════════════
   Kanban Styles — injected as <style> to override global CSS
   ═══════════════════════════════════════════════════════════ */
const kanbanStyles = `
  .kb-root {
    min-height: 100vh;
    background: #0f1117 !important;
    color: #e5e7eb !important;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
  }

  /* ── Top bar ── */
  .kb-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #1e2130;
    background: rgba(15, 17, 23, 0.95);
    backdrop-filter: blur(8px);
    position: sticky;
    top: 0;
    z-index: 100;
    gap: 12px;
    flex-wrap: wrap;
  }
  .kb-topbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .kb-topbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .kb-board-title {
    font-size: 18px !important;
    font-weight: 700 !important;
    color: #f9fafb !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kb-public-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(34,197,94,0.12) !important;
    color: #22c55e;
    border: 1px solid rgba(34,197,94,0.25);
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* ── Search ── */
  .kb-search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #1a1d27 !important;
    border: 1px solid #2a2d3a;
    border-radius: 10px;
    transition: border-color 0.15s ease;
  }
  .kb-search-box:focus-within { border-color: #6366f1; }
  .kb-search-input {
    background: transparent !important;
    border: none !important;
    outline: none !important;
    color: #e5e7eb !important;
    font-size: 13px !important;
    width: 160px;
    padding: 0 !important;
  }
  .kb-search-input::placeholder { color: #4b5563 !important; }

  /* ── Filter select ── */
  .kb-filter-select {
    background: #1a1d27 !important;
    border: 1px solid #2a2d3a !important;
    border-radius: 10px !important;
    padding: 6px 10px !important;
    color: #e5e7eb !important;
    font-size: 12px !important;
    cursor: pointer;
    outline: none;
    -webkit-appearance: none;
  }
  .kb-filter-select:focus { border-color: #6366f1 !important; }

  /* ── Buttons ── */
  .kb-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    border: none;
    outline: none;
    white-space: nowrap;
  }
  .kb-btn-sm { padding: 5px 12px; font-size: 12px; }
  .kb-btn-primary {
    background: #6366f1 !important;
    color: #fff !important;
  }
  .kb-btn-primary:hover { background: #4f46e5 !important; }
  .kb-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .kb-btn-ghost {
    background: transparent !important;
    color: #9ca3af !important;
    border: 1px solid #374151 !important;
  }
  .kb-btn-ghost:hover { background: #1f2937 !important; color: #e5e7eb !important; }
  .kb-btn-danger {
    background: rgba(239, 68, 68, 0.1) !important;
    color: #ef4444 !important;
    border: 1px solid rgba(239, 68, 68, 0.2) !important;
  }
  .kb-btn-danger:hover { background: rgba(239, 68, 68, 0.2) !important; }
  .kb-btn-icon {
    background: none !important;
    border: none;
    padding: 6px;
    border-radius: 8px;
    cursor: pointer;
    color: #6b7280;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .kb-btn-icon:hover { background: #1f2937 !important; color: #e5e7eb !important; }
  .kb-btn-icon-sm {
    background: none !important;
    border: none;
    padding: 3px;
    border-radius: 6px;
    cursor: pointer;
    color: #4b5563;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
  }
  .kb-btn-icon-sm:hover { background: #1f2937 !important; color: #9ca3af !important; }

  /* ── Dropdown ── */
  .kb-click-away { position: fixed; inset: 0; z-index: 999; }
  .kb-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    background: #1a1d27 !important;
    border: 1px solid #2a2d3a;
    border-radius: 12px;
    padding: 6px;
    min-width: 180px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.4);
    z-index: 1000;
  }
  .kb-dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    color: #d1d5db;
    background: none !important;
    border: none;
    cursor: pointer;
    transition: all 0.1s ease;
    text-align: left;
  }
  .kb-dropdown-item:hover { background: #252836 !important; color: #f9fafb; }
  .kb-dropdown-item.danger { color: #f87171; }
  .kb-dropdown-item.danger:hover { background: rgba(239,68,68,0.1) !important; }

  /* ── Columns scroll container ── */
  .kb-columns-scroll {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 20px 16px 120px;
    -webkit-overflow-scrolling: touch;
  }
  .kb-columns-scroll::-webkit-scrollbar { height: 6px; }
  .kb-columns-scroll::-webkit-scrollbar-track { background: transparent; }
  .kb-columns-scroll::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }

  .kb-columns {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    min-height: calc(100vh - 140px);
  }

  /* ── Column ── */
  .kb-column {
    flex-shrink: 0;
    width: 300px;
    min-width: 300px;
    background: #14161e !important;
    border: 1px solid #1e2130;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 140px);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .kb-column.drag-over {
    border-color: #6366f1 !important;
    box-shadow: 0 0 0 2px rgba(99,102,241,0.2) inset;
  }
  .kb-column-header {
    padding: 14px 14px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #1e2130;
  }
  .kb-column-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .kb-column-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .kb-column-title {
    font-size: 14px !important;
    font-weight: 600 !important;
    color: #e5e7eb !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kb-column-count {
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    background: #1e2130;
    padding: 1px 7px;
    border-radius: 10px;
    flex-shrink: 0;
  }
  .kb-column-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .kb-column-cards {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .kb-column-cards::-webkit-scrollbar { width: 4px; }
  .kb-column-cards::-webkit-scrollbar-track { background: transparent; }
  .kb-column-cards::-webkit-scrollbar-thumb { background: #2a2d3a; border-radius: 2px; }

  /* ── Card ── */
  .kb-card {
    background: #1a1d27 !important;
    border: 1px solid #252836;
    border-radius: 10px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
  }
  .kb-card:hover {
    border-color: #3b3f52;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    transform: translateY(-1px);
  }
  .kb-card.dragging {
    opacity: 0.5;
    transform: rotate(2deg);
  }
  .kb-card-labels {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 8px;
  }
  .kb-card-label {
    font-size: 10px;
    font-weight: 600;
    color: #fff !important;
    padding: 2px 8px;
    border-radius: 6px;
    white-space: nowrap;
  }
  .kb-card-title {
    font-size: 13px !important;
    font-weight: 500 !important;
    color: #e5e7eb !important;
    margin: 0 0 8px 0 !important;
    line-height: 1.4 !important;
    word-break: break-word;
  }
  .kb-card-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .kb-card-priority {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 6px;
  }
  .kb-card-due {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: #9ca3af;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(255,255,255,0.04);
  }
  .kb-card-due.overdue {
    color: #ef4444;
    background: rgba(239,68,68,0.1);
  }
  .kb-card-counts {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .kb-card-count {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: #6b7280;
  }
  .kb-card-count.done { color: #22c55e; }
  .kb-card-assignee {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #6b7280;
    margin-top: 6px;
  }

  /* ── Add card ── */
  .kb-add-card-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 10px 14px;
    background: none !important;
    border: none;
    border-top: 1px solid #1e2130;
    border-radius: 0 0 14px 14px;
    font-size: 13px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .kb-add-card-btn:hover { color: #e5e7eb; background: rgba(255,255,255,0.03) !important; }
  .kb-quick-add {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .kb-quick-add-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ── Add column ── */
  .kb-add-column {
    flex-shrink: 0;
    width: 300px;
    min-width: 300px;
  }
  .kb-add-column-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 14px;
    background: rgba(255,255,255,0.03) !important;
    border: 2px dashed #2a2d3a;
    border-radius: 14px;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .kb-add-column-btn:hover { border-color: #6366f1; color: #a5b4fc; background: rgba(99,102,241,0.05) !important; }
  .kb-add-column-form {
    background: #14161e !important;
    border: 1px solid #2a2d3a;
    border-radius: 14px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ── Inline edit ── */
  .kb-inline-edit {
    background: rgba(99,102,241,0.1) !important;
    border: 1px solid #6366f1 !important;
    border-radius: 6px;
    padding: 2px 8px;
    font-size: inherit;
    font-weight: inherit;
    color: #e5e7eb !important;
    outline: none;
    width: 100%;
  }

  /* ── Inputs ── */
  .kb-input, .kb-textarea {
    width: 100%;
    background: #0f1117 !important;
    border: 1px solid #374151 !important;
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 13px !important;
    color: #e5e7eb !important;
    outline: none;
    transition: border-color 0.15s ease;
    box-sizing: border-box;
    font-family: inherit;
  }
  .kb-input:focus, .kb-textarea:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }
  .kb-textarea { resize: vertical; min-height: 60px; }

  /* ── Loading ── */
  .kb-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 120px 20px;
    text-align: center;
  }
  .kb-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #374151;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: kb-spin 0.8s linear infinite;
    margin-bottom: 16px;
  }
  @keyframes kb-spin { to { transform: rotate(360deg); } }

  /* ── Modal (detail) ── */
  .kb-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    z-index: 50000;
    padding: 40px 16px 120px;
    overflow-y: auto;
  }
  .kb-detail-modal {
    background: #1a1d27 !important;
    border: 1px solid #2a2d3a;
    border-radius: 18px;
    max-width: 900px;
    width: 100%;
    box-shadow: 0 32px 80px rgba(0,0,0,0.6);
    position: relative;
    animation: kb-modal-in 0.2s ease;
  }
  @keyframes kb-modal-in {
    from { opacity: 0; transform: translateY(20px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .kb-detail-close {
    position: absolute;
    top: 12px;
    right: 12px;
    background: none !important;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
    transition: all 0.15s ease;
    z-index: 10;
    display: flex;
  }
  .kb-detail-close:hover { background: #252836 !important; color: #e5e7eb; }
  .kb-detail-body {
    display: flex;
    gap: 0;
  }
  .kb-detail-main {
    flex: 1;
    padding: 28px 24px;
    min-width: 0;
    border-right: 1px solid #2a2d3a;
  }
  .kb-detail-sidebar {
    width: 260px;
    flex-shrink: 0;
    padding: 28px 20px;
  }
  .kb-detail-title-input {
    width: 100%;
    background: transparent !important;
    border: none !important;
    outline: none;
    font-size: 20px !important;
    font-weight: 700 !important;
    color: #f9fafb !important;
    padding: 0 0 12px 0 !important;
    margin-bottom: 12px;
    border-bottom: 1px solid #2a2d3a !important;
  }
  .kb-detail-column-badge {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 8px;
    border: 1px solid;
    margin-bottom: 16px;
    background: rgba(255,255,255,0.03);
  }
  .kb-detail-section-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px !important;
    font-weight: 600 !important;
    color: #9ca3af !important;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 8px;
  }

  /* ── Labels ── */
  .kb-label-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }
  .kb-label-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 8px;
    border: 1px solid;
  }
  .kb-label-picker {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    background: #14161e !important;
    border: 1px solid #2a2d3a;
    border-radius: 10px;
    margin-bottom: 8px;
  }
  .kb-label-picker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 12px;
    color: #d1d5db;
    background: none !important;
    border: none;
    cursor: pointer;
    transition: all 0.1s ease;
    text-align: left;
  }
  .kb-label-picker-item:hover { background: #1e2130 !important; }
  .kb-label-picker-item.selected { background: rgba(99,102,241,0.1) !important; }
  .kb-label-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

  /* ── Priority buttons ── */
  .kb-priority-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .kb-priority-btn {
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid #2a2d3a;
    background: transparent !important;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .kb-priority-btn.active {
    background: var(--pri-bg) !important;
    color: var(--pri-color);
    border-color: var(--pri-color);
  }

  /* ── Form groups ── */
  .kb-form-group { margin-bottom: 16px; }
  .kb-label {
    display: block;
    font-size: 12px !important;
    font-weight: 600 !important;
    color: #9ca3af !important;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px !important;
  }

  /* ── Checklist ── */
  .kb-checklist-progress { margin-bottom: 10px; }
  .kb-checklist-bar {
    height: 6px;
    background: #252836;
    border-radius: 3px;
    overflow: hidden;
  }
  .kb-checklist-fill {
    height: 100%;
    background: #6366f1;
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .kb-checklist-items { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  .kb-checklist-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }
  .kb-checkbox {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 2px solid #4b5563;
    background: transparent !important;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s ease;
    color: transparent;
    padding: 0;
  }
  .kb-checkbox.checked {
    background: #6366f1 !important;
    border-color: #6366f1;
    color: #fff;
  }
  .kb-checklist-text { font-size: 13px; color: #d1d5db; flex: 1; }
  .kb-checklist-text.completed { text-decoration: line-through; color: #6b7280; }
  .kb-checklist-add { display: flex; gap: 8px; align-items: center; }

  /* ── Comments ── */
  .kb-comments { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
  .kb-comment {
    background: #14161e !important;
    border: 1px solid #1e2130;
    border-radius: 10px;
    padding: 10px 12px;
  }
  .kb-comment-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .kb-comment-author { font-size: 12px; font-weight: 600; color: #a5b4fc; }
  .kb-comment-date { font-size: 10px; color: #6b7280; flex: 1; }
  .kb-comment-text { font-size: 13px; color: #d1d5db; margin: 0 !important; line-height: 1.5; }
  .kb-comment-text .kb-link,
  .kb-desc-display .kb-link {
    color: #818cf8 !important;
    text-decoration: underline;
    text-underline-offset: 2px;
    word-break: break-all;
    cursor: pointer;
    transition: color 0.12s ease;
  }
  .kb-comment-text .kb-link:hover,
  .kb-desc-display .kb-link:hover {
    color: #a5b4fc !important;
  }
  .kb-desc-display {
    padding: 10px 12px;
    background: #14161e !important;
    border: 1px solid #1e2130;
    border-radius: 10px;
    font-size: 13px;
    color: #d1d5db;
    line-height: 1.6;
    min-height: 60px;
    cursor: text;
    transition: border-color 0.15s ease;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .kb-desc-display:hover {
    border-color: #374151;
  }
  .kb-desc-placeholder {
    color: #4b5563;
    font-style: italic;
  }
  .kb-comment-add { display: flex; flex-direction: column; }

  /* ── Label Manager ── */
  .kb-lm-modal {
    background: #1a1d27 !important;
    border: 1px solid #2a2d3a;
    border-radius: 18px;
    max-width: 520px;
    width: 100%;
    box-shadow: 0 32px 80px rgba(0,0,0,0.6);
    animation: kb-modal-in 0.2s ease;
    overflow: hidden;
  }
  .kb-lm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    border-bottom: 1px solid #2a2d3a;
  }
  .kb-lm-header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 700;
    color: #f9fafb;
  }
  .kb-lm-create {
    padding: 16px 20px;
    border-bottom: 1px solid #2a2d3a;
    background: rgba(255,255,255,0.02);
  }
  .kb-lm-create-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .kb-lm-color-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 2px solid rgba(255,255,255,0.15);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }
  .kb-lm-color-btn:hover {
    border-color: rgba(255,255,255,0.35);
    transform: scale(1.08);
  }
  .kb-lm-color-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    margin-top: 10px;
  }
  .kb-lm-color-swatch {
    width: 100%;
    height: 32px;
    border-radius: 6px;
    border: 2px solid transparent;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #fff;
    transition: all 0.12s ease;
    position: relative;
    font-size: 9px;
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
    letter-spacing: 0.02em;
  }
  .kb-lm-color-name {
    font-size: 9px;
    line-height: 1;
    margin-top: 1px;
    opacity: 0.85;
  }
  .kb-lm-color-swatch:hover {
    transform: scale(1.08);
    border-color: rgba(255,255,255,0.4);
  }
  .kb-lm-color-swatch:hover .kb-lm-color-name {
    opacity: 1;
  }
  .kb-lm-color-swatch.active {
    border-color: #fff;
    transform: scale(1.08);
    box-shadow: 0 0 0 2px rgba(255,255,255,0.25);
  }
  .kb-lm-list {
    padding: 8px 12px 12px;
    max-height: 380px;
    overflow-y: auto;
  }
  .kb-lm-empty {
    text-align: center;
    color: #6b7280;
    font-size: 13px;
    padding: 28px 16px;
  }
  .kb-lm-item {
    padding: 6px 8px;
    border-radius: 10px;
    transition: background 0.1s ease;
  }
  .kb-lm-item:hover {
    background: rgba(255,255,255,0.03);
  }
  .kb-lm-display-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .kb-lm-label-preview {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 8px;
    border: 1px solid;
  }
  .kb-lm-item-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .kb-lm-item:hover .kb-lm-item-actions {
    opacity: 1;
  }
  .kb-lm-edit-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ── Note Panel ── */
  .kb-note-panel {
    position: fixed;
    top: 64px;
    right: 0;
    bottom: 0;
    width: 380px;
    background: #1a1d2e;
    border-left: 1px solid #2a2d3a;
    display: flex;
    flex-direction: column;
    z-index: 900;
    transform: translateX(100%);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: -4px 0 24px rgba(0,0,0,0.3);
  }
  .kb-note-panel.open {
    transform: translateX(0);
  }
  .kb-note-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid #2a2d3a;
    flex-shrink: 0;
  }
  .kb-note-header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    color: #e2e8f0;
  }
  .kb-note-close-btn {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 8px !important;
    border: 1px solid #3b3f54 !important;
    background: #1e2235 !important;
    color: #94a3b8 !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
    flex-shrink: 0 !important;
    padding: 0 !important;
  }
  .kb-note-close-btn:hover {
    background: #ef4444 !important;
    border-color: #ef4444 !important;
    color: #fff !important;
  }
  .kb-note-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }
  .kb-note-textarea {
    width: 100%;
    height: 100%;
    min-height: 300px;
    background: #0f1118;
    border: 1px solid #3b3f54;
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 13px;
    line-height: 1.65;
    padding: 12px;
    resize: none;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }
  .kb-note-textarea:focus {
    border-color: #6366f1;
  }
  .kb-note-textarea::placeholder {
    color: #4b5068;
  }
  .kb-note-rendered {
    cursor: default;
    font-size: 13px;
    line-height: 1.65;
    color: #cbd5e1;
    min-height: 200px;
    padding: 8px 0;
    word-break: break-word;
  }
  .kb-note-rendered .kb-link {
    color: #818cf8;
    text-decoration: underline;
  }
  .kb-note-rendered .kb-link:hover {
    color: #a5b4fc;
  }
  .kb-note-placeholder {
    color: #4b5068;
    font-style: italic;
  }
  .kb-note-footer {
    padding: 10px 16px;
    border-top: 1px solid #2a2d3a;
    flex-shrink: 0;
  }
  .kb-note-watermark {
    padding: 8px 16px;
    border-top: 1px solid #2a2d3a;
    font-size: 10px;
    color: #3b3f54;
    text-align: center;
    flex-shrink: 0;
    letter-spacing: 0.01em;
    line-height: 1.6;
  }
  .kb-note-watermark .kb-link { color: #4b5068; text-decoration: underline; }
  .kb-btn-icon-active {
    background: rgba(99, 102, 241, 0.2) !important;
    color: #818cf8 !important;
  }
  .kb-note-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid #3b3f54;
    background: #1e2235;
    color: #94a3b8;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .kb-note-toggle:hover {
    background: #262b44;
    color: #cbd5e1;
    border-color: #4b5068;
  }
  .kb-note-toggle-active {
    background: rgba(99, 102, 241, 0.15) !important;
    color: #a5b4fc !important;
    border-color: rgba(99, 102, 241, 0.4) !important;
  }
  .kb-note-toggle-active:hover {
    background: rgba(99, 102, 241, 0.25) !important;
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .kb-topbar { flex-direction: column; align-items: flex-start; }
    .kb-topbar-right { width: 100%; overflow-x: auto; }
    .kb-column { width: 280px; min-width: 280px; }
    .kb-add-column { width: 280px; min-width: 280px; }
    .kb-detail-body { flex-direction: column; }
    .kb-detail-sidebar { width: 100%; border-top: 1px solid #2a2d3a; }
    .kb-detail-main { border-right: none; }
    .kb-search-input { width: 120px; }
    .kb-note-panel { width: 100%; }
  }
`;
