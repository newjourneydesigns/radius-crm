'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProjectBoard, FullBoard } from '../../../hooks/useProjectBoard';
import { useAuth } from '../../../contexts/AuthContext';
import ProtectedRoute from '../../../components/ProtectedRoute';
import type { BoardCard, BoardColumn, BoardLabel, CardPriority, ChecklistTemplate } from '../../../lib/supabase';
import {
  Plus, ArrowLeft, Search, MoreHorizontal, Trash2, Edit3,
  GripVertical, MessageSquare, CheckSquare, CalendarDays, Tag,
  X, ChevronDown, ChevronLeft, ChevronRight, Clock, User, Flag, AlertCircle, Pencil,
  FolderKanban, Check, Globe, Lock, StickyNote, UserPlus, Download, Copy,
  Zap, ArrowDownAZ, ArrowUpZA, Bold, Italic, Underline, Strikethrough,
  LinkIcon, Heading, ListBullet, ListOrdered, SlidersHorizontal,
} from '../../../components/icons/BoardIcons';
import { supabase } from '../../../lib/supabase';
import type { CircleLeader } from '../../../lib/supabase';

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
  onMoveCard,
  checklistTemplates,
  onSaveTemplate,
  onDeleteTemplate,
  onApplyTemplate,
  onDuplicate,
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
  onMoveCard: (newColumnId: string) => Promise<void>;
  checklistTemplates: ChecklistTemplate[];
  onSaveTemplate: (name: string, items: string[]) => Promise<void>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
  onApplyTemplate: (templateId: string) => Promise<void>;
  onDuplicate: () => Promise<void>;
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
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
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

              {/* Template actions */}
              <div className="kb-template-actions">
                {checklists.length > 0 && (
                  savingTemplate ? (
                    <div className="kb-template-save-row">
                      <input
                        className="kb-input"
                        value={templateName}
                        onChange={e => setTemplateName(e.target.value)}
                        placeholder="Template name..."
                        onKeyDown={e => {
                          if (e.key === 'Enter' && templateName.trim()) {
                            onSaveTemplate(templateName.trim(), checklists.map(c => c.title));
                            setTemplateName('');
                            setSavingTemplate(false);
                          }
                          if (e.key === 'Escape') setSavingTemplate(false);
                        }}
                        autoFocus
                        style={{ flex: 1 }}
                      />
                      <button
                        className="kb-btn kb-btn-primary kb-btn-sm"
                        onClick={() => {
                          if (templateName.trim()) {
                            onSaveTemplate(templateName.trim(), checklists.map(c => c.title));
                            setTemplateName('');
                            setSavingTemplate(false);
                          }
                        }}
                        disabled={!templateName.trim()}
                      >
                        Save
                      </button>
                      <button className="kb-btn kb-btn-sm" onClick={() => setSavingTemplate(false)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button className="kb-btn kb-btn-sm kb-btn-ghost" onClick={() => setSavingTemplate(true)}>
                      Save as Template
                    </button>
                  )
                )}
                {checklistTemplates.length > 0 && (
                  <button
                    className="kb-btn kb-btn-sm kb-btn-ghost"
                    onClick={() => setShowTemplatePicker(!showTemplatePicker)}
                  >
                    Apply Template <ChevronDown size={11} />
                  </button>
                )}
              </div>
              {showTemplatePicker && checklistTemplates.length > 0 && (
                <div className="kb-template-picker">
                  {checklistTemplates.map(t => (
                    <div key={t.id} className="kb-template-item">
                      <button
                        className="kb-template-apply"
                        onClick={() => { onApplyTemplate(t.id); setShowTemplatePicker(false); }}
                      >
                        <CheckSquare size={12} />
                        <span className="kb-template-name">{t.name}</span>
                        <span className="kb-template-count">{t.items.length} items</span>
                      </button>
                      <button
                        className="kb-btn-icon-sm"
                        onClick={() => onDeleteTemplate(t.id)}
                        title="Delete template"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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

            {/* Move to column */}
            <div className="kb-form-group">
              <div className="kb-detail-section-label"><ChevronDown size={13} /> Move to List</div>
              <select
                className="kb-input"
                value={card.column_id}
                onChange={async (e) => {
                  const newColId = e.target.value;
                  if (newColId !== card.column_id) {
                    await onMoveCard(newColId);
                    onClose();
                  }
                }}
              >
                {board.columns.map(col => (
                  <option key={col.id} value={col.id}>{col.title}</option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div style={{ borderTop: '1px solid #2a2d3a', paddingTop: 16, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="kb-btn kb-btn-primary" onClick={handleSave} disabled={saving || !editTitle.trim()} style={{ width: '100%', justifyContent: 'center' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                className="kb-btn kb-btn-ghost"
                onClick={async () => {
                  await onDuplicate();
                  onClose();
                }}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Copy size={13} />
                Duplicate Card
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

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dueDate = card.due_date ? new Date(card.due_date + 'T00:00:00') : null;
  const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / 86400000) : null;
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
  const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 2;

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
        {/* Dates */}
        {(card.start_date || card.due_date) && (
          <span className={`kb-card-dates ${isOverdue ? 'overdue' : ''} ${isDueSoon ? 'due-soon' : ''}`}>
            <CalendarDays size={10} />
            {card.start_date && (
              <span>{new Date(card.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            )}
            {card.start_date && card.due_date && <span className="kb-card-date-sep">→</span>}
            {card.due_date && (
              <span>{isOverdue ? 'Overdue' : isDueSoon ? (daysUntilDue === 0 ? 'Today' : daysUntilDue === 1 ? 'Tomorrow' : 'In 2 days') : new Date(card.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            )}
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
            <Download size={18} style={{ color: '#818cf8' }} />
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
  onSortCards: (columnId: string, direction: 'asc' | 'desc') => Promise<void>;
  onClose: () => void;
}) {
  const [bulkDueDate, setBulkDueDate] = useState('');
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [bulkLabel, setBulkLabel] = useState('');
  const [bulkMoveCol, setBulkMoveCol] = useState('');
  const [bulkChecklistItem, setBulkChecklistItem] = useState('');
  const [bulkTemplate, setBulkTemplate] = useState('');
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState('');

  const otherColumns = board.columns.filter(c => c.id !== column.id);

  const apply = async (label: string, fn: () => Promise<void>) => {
    setApplying(true);
    setResult('');
    try {
      await fn();
      setResult(`${label} applied to ${cards.length} card${cards.length !== 1 ? 's' : ''}`);
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
              {/* Set Due Date */}
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
                      for (const card of cards) await onUpdateCard(card.id, { due_date: bulkDueDate });
                    })}
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Set Assignee */}
              <div className="kb-list-action-row">
                <div className="kb-list-action-label"><User size={13} /> Set Assignee</div>
                <div className="kb-list-action-controls">
                  <input
                    className="kb-input"
                    value={bulkAssignee}
                    onChange={e => setBulkAssignee(e.target.value)}
                    placeholder="Assignee name..."
                    style={{ flex: 1 }}
                  />
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

              {/* Add Label */}
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

              {/* Sort A-Z / Z-A */}
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
                </div>
              </div>

              {/* Add Checklist Item */}
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

              {/* Apply Checklist Template */}
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

              {/* Move All Cards */}
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

              {/* Clear All */}
              <div className="kb-list-action-row kb-list-action-danger">
                <div className="kb-list-action-label"><Trash2 size={13} /> Clear All Cards</div>
                <div className="kb-list-action-controls">
                  <button
                    className="kb-btn kb-btn-sm kb-btn-danger"
                    disabled={applying}
                    onClick={() => {
                      if (!confirm(`Delete all ${cards.length} cards from "${column.title}"? This cannot be undone.`)) return;
                      apply('Clear', async () => {
                        for (const card of cards) await onDeleteCard(card.id);
                      });
                    }}
                  >
                    Delete {cards.length} Card{cards.length !== 1 ? 's' : ''}
                  </button>
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
    addCard, updateCard, deleteCard, moveCard, reorderCardsInColumn,
    addComment, deleteComment,
    addChecklistItem, toggleChecklistItem, deleteChecklistItem,
    fetchChecklistTemplates, saveChecklistTemplate, deleteChecklistTemplate, applyChecklistTemplate,
    checklistTemplates,
    addLabel, updateLabel, deleteLabel,
    loading, setBoard,
  } = useProjectBoard();

  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<CardPriority | ''>('');
  const [filterLabel, setFilterLabel] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [addingCardCol, setAddingCardCol] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const [showBoardMenu, setShowBoardMenu] = useState(false);
  const [editingBoardTitle, setEditingBoardTitle] = useState(false);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [showNotePanel, setShowNotePanel] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [dragOverPos, setDragOverPos] = useState<'above' | 'below'>('below');
  const [listActionsColId, setListActionsColId] = useState<string | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const newCardRef = useRef<HTMLInputElement>(null);
  const newColRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (boardId) {
      fetchBoard(boardId);
      fetchChecklistTemplates(boardId);
    }
  }, [boardId, fetchBoard, fetchChecklistTemplates]);

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

    // If cross-column, re-normalize source column
    if (!isSameColumn) {
      const sourceCards = getColumnCards(oldColId).filter(c => c.id !== dragCardId);
      if (sourceCards.length > 0) {
        await reorderCardsInColumn(boardId, oldColId, sourceCards.map(c => c.id));
      }
    }

    setDragCardId(null);
  };

  const handleDragEnd = () => {
    setDragCardId(null);
    setDragOverCol(null);
    setDragOverCardId(null);
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

          {/* Filters — inline on desktop, toggle on mobile */}
          <div className="kb-filters-inline">
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

            {/* Date filter */}
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
          </div>

          {/* Mobile filter toggle */}
          <button
            className={`kb-mobile-filter-btn ${(filterPriority || filterLabel || filterDate) ? 'has-active' : ''}`}
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            title="Filters"
          >
            <SlidersHorizontal size={15} />
          </button>

          {/* Note panel toggle */}
          <button
            className={`kb-note-toggle ${showNotePanel ? 'kb-note-toggle-active' : ''}`}
            onClick={() => showNotePanel ? closeNotePanel() : setShowNotePanel(true)}
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
                  <button className="kb-dropdown-item" onClick={() => { setShowBoardMenu(false); setShowImportModal(true); }}>
                    <Download size={14} /> Import Circle Leaders
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

      {/* ── Mobile filter panel ── */}
      {showMobileFilters && (
        <div className="kb-mobile-filter-panel">
          <div className="kb-mobile-filter-row">
            <label className="kb-mobile-filter-label">Priority</label>
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
          </div>
          {board.labels.length > 0 && (
            <div className="kb-mobile-filter-row">
              <label className="kb-mobile-filter-label">Label</label>
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
            </div>
          )}
          <div className="kb-mobile-filter-row">
            <label className="kb-mobile-filter-label">Date</label>
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
          </div>
          {(filterPriority || filterLabel || filterDate) && (
            <button
              className="kb-mobile-filter-clear"
              onClick={() => { setFilterPriority(''); setFilterLabel(''); setFilterDate(''); }}
            >
              Clear All Filters
            </button>
          )}
        </div>
      )}

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

      {/* ── Import Circle Leaders Modal ── */}
      {showImportModal && board && (
        <ImportLeadersModal
          board={board}
          onImport={async (columnId, leaders) => {
            for (const leader of leaders) {
              const desc = [
                leader.campus && `Campus: ${leader.campus}`,
                leader.circle_type && `Circle Type: ${leader.circle_type}`,
                leader.day && `Day: ${leader.day}`,
                leader.time && `Time: ${leader.time}`,
                leader.phone && `Phone: ${leader.phone}`,
                leader.email && `Email: ${leader.email}`,
              ].filter(Boolean).join('\n');
              await addCard(boardId, { column_id: columnId, title: leader.name, description: desc || undefined });
            }
          }}
          onClose={() => setShowImportModal(false)}
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
                    <button className="kb-btn-icon-sm" onClick={() => setListActionsColId(col.id)} title="List actions">
                      <Zap size={14} />
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
                      className={`kb-card-wrapper ${
                        dragOverCardId === card.id && dragCardId !== card.id
                          ? `drop-${dragOverPos}` : ''
                      }`}
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
          <button className="kb-note-close-btn" onClick={closeNotePanel} title="Close notes">
            <X size={18} />
          </button>
        </div>
        <div className="kb-note-toolbar">
          <button className="kb-note-tool-btn" onMouseDown={e => { e.preventDefault(); execNoteCmd('bold'); }} title="Bold"><Bold size={14} /></button>
          <button className="kb-note-tool-btn" onMouseDown={e => { e.preventDefault(); execNoteCmd('italic'); }} title="Italic"><Italic size={14} /></button>
          <button className="kb-note-tool-btn" onMouseDown={e => { e.preventDefault(); execNoteCmd('underline'); }} title="Underline"><Underline size={14} /></button>
          <button className="kb-note-tool-btn" onMouseDown={e => { e.preventDefault(); execNoteCmd('strikeThrough'); }} title="Strikethrough"><Strikethrough size={14} /></button>
          <div className="kb-note-tool-sep" />
          <button className="kb-note-tool-btn" onMouseDown={e => { e.preventDefault(); execNoteCmd('formatBlock', '<h3>'); }} title="Heading"><Heading size={14} /></button>
          <button className="kb-note-tool-btn" onMouseDown={e => { e.preventDefault(); execNoteCmd('insertUnorderedList'); }} title="Bullet list"><ListBullet size={14} /></button>
          <button className="kb-note-tool-btn" onMouseDown={e => { e.preventDefault(); execNoteCmd('insertOrderedList'); }} title="Numbered list"><ListOrdered size={14} /></button>
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
              if (anchor && (e.metaKey || e.ctrlKey)) {
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
          onUpdate={async (updates) => { await updateCard(boardId, activeCard.id, updates); }}
          onDelete={async () => { await deleteCard(boardId, activeCard.id); setSelectedCard(null); }}
          onAddComment={async (content) => { await addComment(boardId, activeCard.id, content); }}
          onDeleteComment={async (commentId) => { await deleteComment(boardId, activeCard.id, commentId); }}
          onAddChecklistItem={async (title) => { await addChecklistItem(boardId, activeCard.id, title); }}
          onToggleChecklistItem={async (itemId, val) => { await toggleChecklistItem(boardId, activeCard.id, itemId, val); }}
          onDeleteChecklistItem={async (itemId) => { await deleteChecklistItem(boardId, activeCard.id, itemId); }}
          onMoveCard={async (newColumnId) => { await moveCard(boardId, activeCard.id, newColumnId, 0); }}
          checklistTemplates={checklistTemplates}
          onSaveTemplate={async (name, items) => { await saveChecklistTemplate(boardId, name, items); }}
          onDeleteTemplate={async (templateId) => { await deleteChecklistTemplate(templateId); }}
          onApplyTemplate={async (templateId) => { await applyChecklistTemplate(boardId, activeCard.id, templateId); }}
          onDuplicate={async () => {
            const newCard = await addCard(boardId, {
              column_id: activeCard.column_id,
              title: activeCard.title + ' (copy)',
              description: activeCard.description || undefined,
              priority: activeCard.priority,
              start_date: activeCard.start_date || undefined,
              due_date: activeCard.due_date || undefined,
              assignee: activeCard.assignee || undefined,
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
            onUpdateCard={async (cardId, updates) => { await updateCard(boardId, cardId, updates); }}
            onDeleteCard={async (cardId) => { await deleteCard(boardId, cardId); }}
            onMoveCard={async (cardId, newColId) => { await moveCard(boardId, cardId, newColId, 0); }}
            onAddChecklistItem={async (cardId, title) => { await addChecklistItem(boardId, cardId, title); }}
            checklistTemplates={checklistTemplates}
            onApplyTemplate={async (cardId, templateId) => { await applyChecklistTemplate(boardId, cardId, templateId); }}
            onSortCards={async (columnId, direction) => {
              const colCards = board.cards
                .filter(c => c.column_id === columnId && !c.is_archived)
                .sort((a, b) => direction === 'asc'
                  ? a.title.localeCompare(b.title)
                  : b.title.localeCompare(a.title)
                );
              for (let i = 0; i < colCards.length; i++) {
                await updateCard(boardId, colCards[i].id, { position: i });
              }
            }}
            onClose={() => setListActionsColId(null)}
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
    padding: 12px 14px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-bottom: 1px solid #1e2130;
  }
  .kb-column-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .kb-column-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    justify-content: flex-end;
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

  /* ── Card wrapper & drop indicators ── */
  .kb-card-wrapper {
    position: relative;
  }
  .kb-card-wrapper.drop-above::before {
    content: '';
    position: absolute;
    top: -5px;
    left: 4px;
    right: 4px;
    height: 3px;
    background: #6366f1;
    border-radius: 2px;
    z-index: 10;
  }
  .kb-card-wrapper.drop-below::after {
    content: '';
    position: absolute;
    bottom: -5px;
    left: 4px;
    right: 4px;
    height: 3px;
    background: #6366f1;
    border-radius: 2px;
    z-index: 10;
  }

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
  .kb-card-dates {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: #9ca3af;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(255,255,255,0.04);
  }
  .kb-card-dates.overdue {
    color: #ef4444;
    background: rgba(239,68,68,0.12);
    font-weight: 600;
  }
  .kb-card-dates.due-soon {
    color: #f59e0b;
    background: rgba(245,158,11,0.12);
    font-weight: 600;
  }
  .kb-card-date-sep {
    opacity: 0.5;
    margin: 0 1px;
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
  select.kb-input {
    appearance: none !important;
    -webkit-appearance: none !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") !important;
    background-repeat: no-repeat !important;
    background-position: right 12px center !important;
    padding-right: 32px !important;
    cursor: pointer !important;
  }
  select.kb-input option {
    background: #1a1d2e;
    color: #e5e7eb;
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

  /* ── Checklist Templates ── */
  .kb-template-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .kb-template-save-row { display: flex; gap: 6px; align-items: center; width: 100%; }
  .kb-btn-ghost {
    background: transparent !important;
    color: #9ca3af !important;
    border: 1px dashed #374151 !important;
  }
  .kb-btn-ghost:hover {
    background: rgba(99, 102, 241, 0.1) !important;
    color: #a5b4fc !important;
    border-color: #6366f1 !important;
  }
  .kb-template-picker {
    margin-top: 8px;
    border: 1px solid #1e2130;
    border-radius: 10px;
    overflow: hidden;
    background: #14161e !important;
  }
  .kb-template-item {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #1e2130;
  }
  .kb-template-item:last-child { border-bottom: none; }
  .kb-template-apply {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: transparent !important;
    border: none !important;
    color: #d1d5db !important;
    cursor: pointer;
    text-align: left;
    font-size: 13px;
  }
  .kb-template-apply:hover { background: rgba(99, 102, 241, 0.1) !important; }
  .kb-template-name { flex: 1; }
  .kb-template-count { font-size: 11px; color: #6b7280; }

  /* ── Import Modal ── */
  .kb-import-modal {
    width: 640px;
    max-width: 95vw;
    max-height: 85vh;
    background: #1a1d2e !important;
    border: 1px solid #2a2d3e;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .kb-import-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #1e2130;
  }
  .kb-import-title {
    font-size: 16px;
    font-weight: 600;
    color: #e5e7eb;
    margin: 0;
  }
  .kb-import-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 12px 20px;
    border-bottom: 1px solid #1e2130;
    background: rgba(15, 17, 23, 0.5);
  }
  .kb-import-select {
    font-size: 12px !important;
    padding: 6px 28px 6px 10px !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") !important;
    background-repeat: no-repeat !important;
    background-position: right 10px center !important;
  }
  select.kb-import-select option {
    background: #1a1d2e !important;
    color: #e5e7eb !important;
  }
  .kb-import-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-bottom: 1px solid #1e2130;
  }
  .kb-import-count {
    font-size: 12px;
    color: #818cf8;
    white-space: nowrap;
  }
  .kb-import-list {
    flex: 1;
    overflow-y: auto;
    min-height: 200px;
    max-height: 400px;
  }
  .kb-import-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: #6b7280;
    font-size: 13px;
  }
  .kb-import-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 20px;
    cursor: pointer;
    border-bottom: 1px solid #14161e;
    transition: background 0.15s;
  }
  .kb-import-row:hover { background: rgba(99, 102, 241, 0.06); }
  .kb-import-row-selected { background: rgba(99, 102, 241, 0.1); }
  .kb-import-leader-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .kb-import-leader-name { font-size: 13px; color: #e5e7eb; font-weight: 500; }
  .kb-import-leader-meta { font-size: 11px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kb-import-leader-status {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(99, 102, 241, 0.15) !important;
    color: #a5b4fc;
    white-space: nowrap;
    text-transform: capitalize;
  }
  .kb-import-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-top: 1px solid #1e2130;
    background: rgba(15, 17, 23, 0.5);
  }
  .kb-import-label { font-size: 12px; color: #9ca3af; white-space: nowrap; }

  /* ── List Actions Modal ── */
  .kb-list-actions-modal {
    width: 520px;
    max-width: 95vw;
    max-height: 85vh;
    background: #1a1d2e !important;
    border: 1px solid #2a2d3e;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .kb-list-actions-body {
    padding: 8px 0;
    overflow-y: auto;
  }
  .kb-list-action-row {
    padding: 12px 20px;
    border-bottom: 1px solid #14161e;
  }
  .kb-list-action-row:last-child { border-bottom: none; }
  .kb-list-action-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }
  .kb-list-action-controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .kb-list-action-danger .kb-list-action-label { color: #f87171; }
  .kb-btn-danger {
    background: rgba(239, 68, 68, 0.15) !important;
    color: #f87171 !important;
    border: 1px solid rgba(239, 68, 68, 0.3) !important;
  }
  .kb-btn-danger:hover {
    background: rgba(239, 68, 68, 0.25) !important;
  }
  .kb-list-action-result {
    padding: 10px 20px;
    font-size: 12px;
    color: #34d399;
    text-align: center;
  }

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
    width: 400px;
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
  /* ── Note Toolbar ── */
  .kb-note-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 8px 12px;
    border-bottom: 1px solid #2a2d3a;
    background: rgba(15, 17, 23, 0.5);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .kb-note-tool-btn {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 6px !important;
    border: none !important;
    background: transparent !important;
    color: #94a3b8 !important;
    cursor: pointer !important;
    transition: all 0.12s ease !important;
    padding: 0 !important;
  }
  .kb-note-tool-btn:hover {
    background: rgba(99, 102, 241, 0.15) !important;
    color: #a5b4fc !important;
  }
  .kb-note-tool-btn:active {
    background: rgba(99, 102, 241, 0.25) !important;
    color: #c7d2fe !important;
  }
  .kb-note-tool-sep {
    width: 1px;
    height: 20px;
    background: #2a2d3a;
    margin: 0 4px;
    flex-shrink: 0;
  }
  /* ── Note Editable Area ── */
  .kb-note-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }
  .kb-note-editable {
    min-height: 100%;
    outline: none;
    color: #e2e8f0;
    font-size: 14px;
    line-height: 1.7;
    word-break: break-word;
    caret-color: #818cf8;
  }
  .kb-note-editable:empty::before {
    content: 'Start typing your notes...';
    color: #4b5068;
    font-style: italic;
    pointer-events: none;
  }
  .kb-note-editable h3 {
    font-size: 17px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 16px 0 8px 0;
    line-height: 1.3;
  }
  .kb-note-editable h3:first-child {
    margin-top: 0;
  }
  .kb-note-editable a {
    color: #818cf8;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: text;
    position: relative;
  }
  .kb-note-editable a:hover {
    color: #a5b4fc;
    cursor: pointer;
  }
  .kb-note-editable a:hover::after {
    content: '⌘ click to open';
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: #1e2235;
    color: #94a3b8;
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid #3b3f54;
    white-space: nowrap;
    pointer-events: none;
    z-index: 10;
    font-style: normal;
    font-weight: 500;
    text-decoration: none;
    line-height: 1.4;
  }
  .kb-note-editable ul {
    padding-left: 24px;
    margin: 8px 0;
    list-style-type: disc !important;
  }
  .kb-note-editable ol {
    padding-left: 24px;
    margin: 8px 0;
    list-style-type: decimal !important;
  }
  .kb-note-editable li {
    margin: 2px 0;
    display: list-item !important;
  }
  .kb-note-editable blockquote {
    border-left: 3px solid #6366f1;
    padding-left: 12px;
    margin: 8px 0;
    color: #94a3b8;
    font-style: italic;
  }
  .kb-note-editable s {
    color: #64748b;
  }
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

  /* ── Inline filter group (desktop) ── */
  .kb-filters-inline {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ── Mobile filter button (hidden on desktop) ── */
  .kb-mobile-filter-btn {
    display: none !important;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 10px !important;
    border: 1px solid #2a2d3a !important;
    background: #1a1d27 !important;
    color: #9ca3af !important;
    cursor: pointer;
    position: relative;
    padding: 0 !important;
    flex-shrink: 0;
  }
  .kb-mobile-filter-btn:hover { border-color: #6366f1 !important; color: #e5e7eb !important; }
  .kb-mobile-filter-btn.has-active::after {
    content: '';
    position: absolute;
    top: 4px;
    right: 4px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #6366f1;
  }

  /* ── Mobile filter panel (hidden on desktop) ── */
  .kb-mobile-filter-panel {
    display: none;
    padding: 12px 16px;
    background: rgba(15, 17, 23, 0.98);
    border-bottom: 1px solid #1e2130;
    flex-direction: column;
    gap: 10px;
  }
  .kb-mobile-filter-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .kb-mobile-filter-label {
    font-size: 12px;
    font-weight: 600;
    color: #9ca3af;
    min-width: 60px;
    white-space: nowrap;
  }
  .kb-mobile-filter-row .kb-filter-select {
    flex: 1;
  }
  .kb-mobile-filter-clear {
    align-self: flex-end;
    font-size: 11px !important;
    color: #6366f1 !important;
    background: transparent !important;
    border: none !important;
    cursor: pointer;
    padding: 4px 0 !important;
    font-weight: 600;
  }
  .kb-mobile-filter-clear:hover { color: #818cf8 !important; }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .kb-topbar { flex-direction: column; align-items: flex-start; }
    .kb-topbar-right { width: 100%; flex-wrap: nowrap; }
    .kb-filters-inline { display: none !important; }
    .kb-mobile-filter-btn { display: flex !important; }
    .kb-mobile-filter-panel { display: flex; }
    .kb-search-box { flex: 1; min-width: 0; }
    .kb-search-input { width: 100% !important; }
    .kb-column { width: 280px; min-width: 280px; }
    .kb-add-column { width: 280px; min-width: 280px; }
    .kb-detail-body { flex-direction: column; }
    .kb-detail-sidebar { width: 100%; border-top: 1px solid #2a2d3a; }
    .kb-detail-main { border-right: none; }
    .kb-note-panel { width: 100%; }
  }
`;
