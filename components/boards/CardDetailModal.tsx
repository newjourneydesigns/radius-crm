'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { FullBoard } from '../../hooks/useProjectBoard';
import { useAuth } from '../../contexts/AuthContext';
import type { BoardCard, CardChecklistGroup, CardPriority, ChecklistTemplate, ProjectBoard } from '../../lib/supabase';
import {
  Plus, Trash2, Edit3, GripVertical, MessageSquare, CheckSquare, CalendarDays, Tag,
  X, ChevronDown, Clock, User, Flag, Pencil, FolderKanban, Check, Copy,
  LinkIcon, ExternalLink, Repeat2, Circle, Star, ArrowUpRight, Camera, ImageIcon,
} from '../icons/BoardIcons';
import { apiFetch } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { buildRepeatLabel, type TodoRepeatRule } from '../../lib/todoRecurrence';
import { buildTimeOptions15Min } from '../../lib/timeUtils';
import { DateTime } from 'luxon';
import AssigneePicker from './AssigneePicker';
import RichTextEditor from '../notes/RichTextEditor';
import DictateAndSummarize from '../notes/DictateAndSummarize';
import { extractTextContacts, type TextContact } from '../../lib/textContacts';

export const TIME_OPTIONS_15_MIN = buildTimeOptions15Min('08:00');

export function normalizeTimeValue(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : '';
}

export function formatTimeAmPm(value: string | null | undefined): string {
  const normalized = normalizeTimeValue(value);
  const option = TIME_OPTIONS_15_MIN.find(item => item.value === normalized);
  if (option) return option.label;

  const match = /^(\d{2}):(\d{2})/.exec(normalized);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

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
export const PRIORITY_CONFIG: Record<CardPriority, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  high:   { label: 'High',   color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  urgent: { label: 'Urgent', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

/* ═══════════════════════════════════════════════════════════
   CardDetailModal
   ═══════════════════════════════════════════════════════════ */
export function CardDetailModal({
  card,
  board,
  onClose,
  onUpdate,
  onDelete,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onAddChecklistItem,
  onToggleChecklistItem,
  onUpdateChecklistDueDate,
  onRenameChecklistItem,
  onUpdateChecklistItemUrl,
  onReorderChecklistItems,
  onDeleteChecklistItem,
  onPromoteUngrouped,
  onAddChecklistGroup,
  onRenameChecklistGroup,
  onDeleteChecklistGroup,
  onConvertToCard,
  onMoveCard,
  onMoveToBoardCard,
  checklistTemplates,
  onSaveTemplate,
  onDeleteTemplate,
  onApplyTemplate,
  onDuplicate,
  onAssignCard,
  onUnassignCard,
  fetchSystemUsers,
}: {
  card: BoardCard;
  board: FullBoard;
  onClose: () => void;
  onUpdate: (updates: any) => Promise<void>;
  onDelete: () => Promise<void>;
  onAddComment: (content: string) => Promise<void>;
  onUpdateComment: (commentId: string, content: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onAddChecklistItem: (title: string, groupId?: string) => Promise<void>;
  onToggleChecklistItem: (itemId: string, val: boolean) => Promise<void>;
  onUpdateChecklistDueDate: (itemId: string, dueDate: string | null) => Promise<void>;
  onRenameChecklistItem: (itemId: string, title: string) => Promise<void>;
  onUpdateChecklistItemUrl: (itemId: string, url: string | null) => Promise<void>;
  onReorderChecklistItems: (orderedItemIds: string[]) => Promise<void>;
  onDeleteChecklistItem: (itemId: string) => Promise<void>;
  onPromoteUngrouped: (title: string) => Promise<CardChecklistGroup | null>;
  onAddChecklistGroup: (title: string) => Promise<CardChecklistGroup | null>;
  onRenameChecklistGroup: (groupId: string, title: string) => Promise<void>;
  onDeleteChecklistGroup: (groupId: string) => Promise<void>;
  onConvertToCard: (itemId: string, title: string, columnId: string) => Promise<void>;
  onMoveCard: (newColumnId: string) => Promise<void>;
  onMoveToBoardCard: (targetBoardId: string, targetColumnId: string) => Promise<void>;
  checklistTemplates: ChecklistTemplate[];
  onSaveTemplate: (name: string, items: string[]) => Promise<void>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
  onApplyTemplate: (templateId: string) => Promise<void>;
  onDuplicate: () => Promise<void>;
  onAssignCard: (userId: string) => Promise<void>;
  onUnassignCard: (userId: string) => Promise<void>;
  fetchSystemUsers: () => Promise<{ id: string; name: string; email: string }[]>;
}) {
  const [editTitle, setEditTitle] = useState(card.title);
  const [editDesc, setEditDesc] = useState(card.description || '');
  const [editPriority, setEditPriority] = useState<CardPriority>(card.priority);
  const [editStartDate, setEditStartDate] = useState(card.start_date || '');
  const [editDueDate, setEditDueDate] = useState(card.due_date || '');
  const [editDueTime, setEditDueTime] = useState(normalizeTimeValue(card.due_time));
  const [editLabels, setEditLabels] = useState<string[]>((card.labels || []).map(l => l.id));
  const [editRepeatRule, setEditRepeatRule] = useState<TodoRepeatRule>((card.repeat_rule as TodoRepeatRule) || 'none');
  const [editRepeatInterval, setEditRepeatInterval] = useState(card.repeat_interval || 1);
  const [editRepeatDays, setEditRepeatDays] = useState<number[]>(card.repeat_days || []);
  const [commentText, setCommentText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [checklistText, setChecklistText] = useState('');
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('');
  const [editingChecklistLinkId, setEditingChecklistLinkId] = useState<string | null>(null);
  const [editingChecklistUrl, setEditingChecklistUrl] = useState('');
  const [showingDateInputId, setShowingDateInputId] = useState<string | null>(null);
  const [draggingChecklistId, setDraggingChecklistId] = useState<string | null>(null);
  const [dragOverChecklistId, setDragOverChecklistId] = useState<string | null>(null);
  const [dragOverChecklistPos, setDragOverChecklistPos] = useState<'above' | 'below'>('below');
  const [activeAddSection, setActiveAddSection] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupTitle, setEditingGroupTitle] = useState('');
  const [editingUngroupedTitle, setEditingUngroupedTitle] = useState(false);
  const [ungroupedTitleDraft, setUngroupedTitleDraft] = useState('Checklist');
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [allBoards, setAllBoards] = useState<ProjectBoard[]>([]);
  const [targetBoardId, setTargetBoardId] = useState('');
  const [targetBoardColumns, setTargetBoardColumns] = useState<{ id: string; title: string }[]>([]);
  const [targetColumnId, setTargetColumnId] = useState('');
  const [movingToBoard, setMovingToBoard] = useState(false);
  const [linkedLeaderId, setLinkedLeaderId] = useState<number | null>(card.linked_leader_id ?? null);
  const [isFocused, setIsFocused] = useState(card.is_focused ?? false);
  const [allLeaders, setAllLeaders] = useState<{ id: number; name: string; ccb_group_id?: string | null }[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [suggestions, setSuggestions] = useState<{ text: string; kind: string; sourceLine: number; sourceQuote: string }[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [targetSuggestionGroupId, setTargetSuggestionGroupId] = useState<string>('__new__');
  const [convertingItemId, setConvertingItemId] = useState<string | null>(null);
  const [convertColumnId, setConvertColumnId] = useState(card.column_id);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [screenshotCopied, setScreenshotCopied] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(card.screenshot_url ?? null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [screenshotError, setScreenshotError] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const copyStatusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialRef = useRef(true);
  const skipNextAutoSaveRef = useRef(false);
  const pendingChangesRef = useRef(false);
  const overlayMouseDownRef = useRef(false);

  useEffect(() => {
    supabase.from('project_boards').select('id, title').eq('is_archived', false).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setAllBoards(data as ProjectBoard[]); });
  }, []);
  useEffect(() => {
    supabase.from('circle_leaders').select('id, name, ccb_group_id').order('name')
      .then(({ data }) => { if (data) setAllLeaders(data as { id: number; name: string; ccb_group_id?: string | null }[]); });
  }, []);

  useEffect(() => {
    return () => {
      if (copyStatusTimerRef.current) clearTimeout(copyStatusTimerRef.current);
    };
  }, []);

  // Auto-save: debounce 600ms after any field change
  useEffect(() => {
    if (isInitialRef.current) { isInitialRef.current = false; return; }
    if (skipNextAutoSaveRef.current) { skipNextAutoSaveRef.current = false; return; }
    if (!editTitle.trim()) return;
    pendingChangesRef.current = true;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      await onUpdate({
        title: editTitle,
        description: editDesc,
        priority: editPriority,
        start_date: editStartDate || null,
        due_date: editDueDate || null,
        due_time: editDueDate ? (editDueTime || null) : null,
        label_ids: editLabels,
        repeat_rule: editRepeatRule === 'none' ? null : editRepeatRule,
        repeat_interval: editRepeatRule === 'none' ? 1 : editRepeatInterval,
        repeat_days: editRepeatRule === 'daily' && editRepeatDays.length > 0 ? editRepeatDays : null,
        linked_leader_id: linkedLeaderId,
      });
      pendingChangesRef.current = false;
    }, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTitle, editDesc, editPriority, editStartDate, editDueDate, editDueTime, editLabels, editRepeatRule, editRepeatInterval, editRepeatDays, linkedLeaderId]);

  const compressImage = (file: File): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_PX = 1200;
        const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/jpeg', 0.82);
      };
      img.onerror = reject;
      img.src = url;
    });

  const handleUploadScreenshot = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setScreenshotError('Please select an image file.');
      return;
    }
    setUploadingScreenshot(true);
    setScreenshotError('');
    try {
      const compressed = await compressImage(file);
      const path = `${card.id}/screenshot.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('card-screenshots')
        .upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('card-screenshots').getPublicUrl(path);
      // Cache-bust so the browser shows the new image
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      setScreenshotUrl(url);
      await onUpdate({ screenshot_url: url });
    } catch {
      setScreenshotError('Upload failed. Please try again.');
    } finally {
      setUploadingScreenshot(false);
      if (screenshotInputRef.current) screenshotInputRef.current.value = '';
    }
  };

  const handleRemoveScreenshot = async () => {
    setUploadingScreenshot(true);
    setScreenshotError('');
    try {
      await supabase.storage.from('card-screenshots').remove([`${card.id}/screenshot.jpg`]);
      setScreenshotUrl(null);
      await onUpdate({ screenshot_url: null });
    } catch {
      setScreenshotError('Failed to remove screenshot.');
    } finally {
      setUploadingScreenshot(false);
    }
  };

  const handleClose = async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (pendingChangesRef.current && editTitle.trim()) {
      await onUpdate({
        title: editTitle,
        description: editDesc,
        priority: editPriority,
        start_date: editStartDate || null,
        due_date: editDueDate || null,
        due_time: editDueDate ? (editDueTime || null) : null,
        label_ids: editLabels,
        repeat_rule: editRepeatRule === 'none' ? null : editRepeatRule,
        repeat_interval: editRepeatRule === 'none' ? 1 : editRepeatInterval,
        repeat_days: editRepeatRule === 'daily' && editRepeatDays.length > 0 ? editRepeatDays : null,
        linked_leader_id: linkedLeaderId,
      });
      pendingChangesRef.current = false;
    }
    onClose();
  };

  const handleToggleFocus = async () => {
    const next = !isFocused;
    setIsFocused(next);
    await onUpdate({ is_focused: next });
  };

  const todayIso = DateTime.now().toISODate();
  const isDueDateOverdue = Boolean(editDueDate && todayIso && editDueDate < todayIso);

  const handleSnoozeDueDate = async () => {
    if (!editDueDate) return;
    const parsed = DateTime.fromISO(editDueDate);
    if (!parsed.isValid) return;
    const nextDueDate = parsed.plus({ days: 1 }).toISODate();
    if (!nextDueDate) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    pendingChangesRef.current = false;
    skipNextAutoSaveRef.current = true;
    setEditDueDate(nextDueDate);
    await onUpdate({
      title: editTitle,
      description: editDesc,
      priority: editPriority,
      start_date: editStartDate || null,
      due_date: nextDueDate,
      due_time: editDueTime || null,
      label_ids: editLabels,
      repeat_rule: editRepeatRule === 'none' ? null : editRepeatRule,
      repeat_interval: editRepeatRule === 'none' ? 1 : editRepeatInterval,
      repeat_days: editRepeatRule === 'daily' && editRepeatDays.length > 0 ? editRepeatDays : null,
      linked_leader_id: linkedLeaderId,
    });
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    await onAddComment(commentText.trim());
    setCommentText('');
  };

  const handleAddChecklist = async () => {
    if (!checklistText.trim()) return;
    const groupId = activeAddSection && activeAddSection !== '__ungrouped__' ? activeAddSection : undefined;
    await onAddChecklistItem(checklistText.trim(), groupId);
    setChecklistText('');
  };

  const toggleLabel = (labelId: string) => {
    setEditLabels(prev => prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]);
  };

  // ── Keyboard shortcuts inside modal (mirrors board shortcuts but uses local edit state) ──
  const { user: modalUser } = useAuth();
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (confirm(`Delete "${card.title}"?`)) {
          onDelete();
        }
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        onUpdate({ is_complete: !card.is_complete });
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        if (!modalUser) return;
        const alreadyAssigned = (card.assignments || []).some(a => a.user_id === modalUser.id);
        if (alreadyAssigned) {
          onUnassignCard(modalUser.id);
        } else {
          onAssignCard(modalUser.id);
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleToggleFocus();
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const sortedLabels = [...(board.labels || [])].sort((a, b) => a.name.localeCompare(b.name));
        const idx = e.key === '0' ? 9 : parseInt(e.key, 10) - 1;
        if (idx < sortedLabels.length) {
          toggleLabel(sortedLabels[idx].id);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, card.is_complete, card.assignments, board.labels, modalUser, isFocused]);

  const handleTargetBoardChange = async (boardId: string) => {
    setTargetBoardId(boardId);
    setTargetColumnId('');
    setTargetBoardColumns([]);
    if (!boardId) return;
    const { data } = await supabase.from('board_columns').select('id, title').eq('board_id', boardId).order('position');
    if (data) {
      setTargetBoardColumns(data);
      if (data.length > 0) setTargetColumnId(data[0].id);
    }
  };

  const handleMoveToBoard = async () => {
    if (!targetBoardId || !targetColumnId) return;
    setMovingToBoard(true);
    await onMoveToBoardCard(targetBoardId, targetColumnId);
    setMovingToBoard(false);
    onClose();
  };

  const column = board.columns.find(c => c.id === card.column_id);
  const checklists = card.checklists || [];
  const checklistGroups = card.checklist_groups || [];
  const ungroupedItems = checklists.filter(cl => !cl.group_id);
  const completedCount = checklists.filter(c => c.is_completed).length;
  const descriptionContacts = useMemo(() => extractTextContacts(editDesc), [editDesc]);

  const checklistSectionKey = (item: NonNullable<typeof checklists>[number]) => item.group_id || '__ungrouped__';

  const checklistDisplayOrder = (
    changedSection: string,
    changedItems: NonNullable<typeof checklists>
  ) => {
    const ordered: string[] = [];
    const pushItems = (items: NonNullable<typeof checklists>) => {
      items.forEach(item => ordered.push(item.id));
    };

    pushItems(changedSection === '__ungrouped__' ? changedItems : ungroupedItems);
    checklistGroups.forEach(group => {
      const groupItems = checklists.filter(item => item.group_id === group.id);
      pushItems(changedSection === group.id ? changedItems : groupItems);
    });

    const seen = new Set(ordered);
    checklists.forEach(item => {
      if (!seen.has(item.id)) ordered.push(item.id);
    });
    return ordered;
  };

  const handleChecklistDragStart = (e: React.DragEvent, itemId: string) => {
    e.stopPropagation();
    setDraggingChecklistId(itemId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
  };

  const handleChecklistDragOver = (e: React.DragEvent, overItemId: string) => {
    const activeId = draggingChecklistId || e.dataTransfer.getData('text/plain');
    const activeItem = checklists.find(item => item.id === activeId);
    const overItem = checklists.find(item => item.id === overItemId);
    if (!activeItem || !overItem || checklistSectionKey(activeItem) !== checklistSectionKey(overItem)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
    setDragOverChecklistId(overItemId);
    setDragOverChecklistPos(pos);
  };

  const handleChecklistDrop = async (e: React.DragEvent, overItemId: string) => {
    e.preventDefault();
    const activeId = draggingChecklistId || e.dataTransfer.getData('text/plain');
    setDragOverChecklistId(null);
    setDraggingChecklistId(null);
    if (!activeId || activeId === overItemId) return;

    const activeItem = checklists.find(item => item.id === activeId);
    const overItem = checklists.find(item => item.id === overItemId);
    if (!activeItem || !overItem) return;

    const section = checklistSectionKey(activeItem);
    if (section !== checklistSectionKey(overItem)) return;

    const sectionItems = checklists.filter(item => checklistSectionKey(item) === section);
    const fromIndex = sectionItems.findIndex(item => item.id === activeId);
    const overIndex = sectionItems.findIndex(item => item.id === overItemId);
    if (fromIndex === -1 || overIndex === -1) return;

    const nextSectionItems = [...sectionItems];
    const [moved] = nextSectionItems.splice(fromIndex, 1);
    let insertIndex = overIndex + (dragOverChecklistPos === 'below' ? 1 : 0);
    if (fromIndex < insertIndex) insertIndex -= 1;
    nextSectionItems.splice(insertIndex, 0, moved);

    await onReorderChecklistItems(checklistDisplayOrder(section, nextSectionItems));
  };

  const clearChecklistDrag = () => {
    setDraggingChecklistId(null);
    setDragOverChecklistId(null);
  };

  const htmlToPlainText = (html: string) =>
    html
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/li>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n').trim();

  const formatCopyDate = (date: string | null | undefined) => {
    if (!date) return '';
    const parsed = DateTime.fromISO(date);
    return parsed.isValid ? parsed.toLocaleString(DateTime.DATE_MED) : date;
  };

  const buildAiCopyText = () => {
    const selectedLabels = editLabels
      .map(labelId => board.labels.find(label => label.id === labelId)?.name)
      .filter((label): label is string => Boolean(label));
    const assignees = (card.assignments || [])
      .map(assignment => assignment.users?.name || assignment.users?.email)
      .filter((name): name is string => Boolean(name));
    const leader = linkedLeaderId ? allLeaders.find(item => item.id === linkedLeaderId) : null;
    const cardUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/boards/${board.id}?card=${card.id}`
      : '';
    const dueParts = [
      formatCopyDate(editDueDate),
      editDueDate && editDueTime ? formatTimeAmPm(editDueTime) : '',
    ].filter(Boolean);
    const repeatLabel = editRepeatRule === 'none'
      ? ''
      : editRepeatRule === 'daily'
        ? (editRepeatDays.length > 0
          ? `Repeats on ${editRepeatDays.map(day => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]).join(', ')}`
          : 'Repeats daily')
        : buildRepeatLabel(editRepeatRule, editRepeatInterval);
    const metaLines = [
      `Board: ${board.title}`,
      `List: ${column?.title || 'Unknown'}`,
      `Status: ${card.is_complete ? 'Complete' : 'Open'}`,
      `Priority: ${PRIORITY_CONFIG[editPriority]?.label || editPriority}`,
      `Focused: ${isFocused ? 'Yes' : 'No'}`,
      editStartDate ? `Start date: ${formatCopyDate(editStartDate)}` : null,
      dueParts.length ? `Due: ${dueParts.join(' at ')}` : null,
      repeatLabel ? `Repeat: ${repeatLabel}` : null,
      selectedLabels.length ? `Labels: ${selectedLabels.join(', ')}` : null,
      assignees.length ? `Assignees: ${assignees.join(', ')}` : null,
      linkedLeaderId ? `Circle Leader: ${leader?.name || `Leader #${linkedLeaderId}`}` : null,
      cardUrl ? `Card link: ${cardUrl}` : null,
    ].filter(Boolean);

    const sections = [
      `# ${editTitle.trim() || card.title}`,
      metaLines.join('\n'),
    ];

    const description = htmlToPlainText(editDesc);
    if (description) sections.push(`## Description\n${description}`);

    if (checklists.length > 0) {
      const checklistSections: string[] = [];
      const renderChecklistLines = (items: NonNullable<typeof checklists>) => items.map(item => {
        const details = [
          item.due_date ? `Due: ${formatCopyDate(item.due_date)}` : '',
          item.url ? `Link: ${item.url}` : '',
        ].filter(Boolean);
        return `- [${item.is_completed ? 'x' : ' '}] ${item.title}${details.length ? ` (${details.join('; ')})` : ''}`;
      }).join('\n');

      if (ungroupedItems.length > 0) {
        checklistSections.push(`### Checklist\n${renderChecklistLines(ungroupedItems)}`);
      }
      checklistGroups.forEach(group => {
        const groupItems = checklists.filter(item => item.group_id === group.id);
        if (groupItems.length > 0) {
          checklistSections.push(`### ${group.title || 'Checklist'}\n${renderChecklistLines(groupItems)}`);
        }
      });
      sections.push(`## Checklists (${completedCount}/${checklists.length} complete)\n${checklistSections.join('\n\n')}`);
    }

    if ((card.comments || []).length > 0) {
      const comments = (card.comments || []).map(comment => {
        const author = comment.users?.name || 'Unknown';
        const created = DateTime.fromISO(comment.created_at);
        const dateLabel = created.isValid ? created.toFormat('LLL d, yyyy h:mm a') : comment.created_at;
        return `- ${author} (${dateLabel}): ${comment.content.trim()}`;
      }).join('\n');
      sections.push(`## Comments\n${comments}`);
    }

    return sections.join('\n\n').trim();
  };

  const writeClipboardText = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (!copied) throw new Error('Clipboard copy failed');
  };

  const handleCopyCardForAi = async () => {
    try {
      await writeClipboardText(buildAiCopyText());
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
    if (copyStatusTimerRef.current) clearTimeout(copyStatusTimerRef.current);
    copyStatusTimerRef.current = setTimeout(() => setCopyStatus('idle'), 2200);
  };

  const handleCopyScreenshot = async () => {
    if (!screenshotUrl) return;
    try {
      const res = await fetch(screenshotUrl);
      const blob = await res.blob();
      const pngBlob = blob.type === 'image/png' ? blob : await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d')!.drawImage(img, 0, 0);
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('conversion failed')), 'image/png');
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      setScreenshotCopied(true);
      setTimeout(() => setScreenshotCopied(false), 2200);
    } catch {
      // silently fail — image copy isn't critical
    }
  };

  const suggestChecklistItems = async () => {
    if (isSuggesting) return;
    const descText = htmlToPlainText(editDesc);
    const sourceText = [card.title, descText].filter(Boolean).join('\n\n');
    if (!sourceText.trim()) {
      setSuggestionError('Add a description before asking for checklist suggestions.');
      return;
    }
    setIsSuggesting(true);
    setSuggestionError('');
    setSuggestions([]);
    setSelectedSuggestions(new Set());
    try {
      const res = await apiFetch('/api/notebook/checklist-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceText }),
      });
      const data = await res.json();
      if (!res.ok) { setSuggestionError(data.error || 'Failed to get suggestions.'); return; }
      const next = Array.isArray(data.suggestions) ? data.suggestions : [];
      setSuggestions(next);
      setSelectedSuggestions(new Set(next.map((_: unknown, i: number) => i)));
      setTargetSuggestionGroupId(checklistGroups[0]?.id ?? '__new__');
      if (next.length === 0) setSuggestionError('No clear next steps or outstanding items were found.');
    } catch {
      setSuggestionError('Network error. Please try again.');
    } finally {
      setIsSuggesting(false);
    }
  };

  const addSelectedSuggestions = async () => {
    if (suggestions.length === 0 || selectedSuggestions.size === 0) return;
    const selected = suggestions.filter((_, i) => selectedSuggestions.has(i));
    const existingTitles = new Set(checklists.map(cl => cl.title.trim().toLowerCase()));
    const unique = selected.filter(s => !existingTitles.has(s.text.trim().toLowerCase()));
    if (unique.length === 0) { setSuggestionError('Those items are already in your checklists.'); return; }
    let groupId: string | undefined;
    if (targetSuggestionGroupId === '__new__') {
      const group = await onAddChecklistGroup('Checklist');
      groupId = group?.id;
    } else {
      groupId = targetSuggestionGroupId;
    }
    for (const s of unique) {
      await onAddChecklistItem(s.text, groupId);
    }
    setSuggestions([]);
    setSelectedSuggestions(new Set());
    setSuggestionError('');
  };

  const renderContactActions = (contacts: TextContact[], variant: 'compact' | 'comment' = 'compact') => {
    if (contacts.length === 0) return null;

    return (
      <div className={`kb-contact-actions kb-contact-actions-${variant}`}>
        {contacts.map((contact, index) => (
          <div key={`${contact.type}-${contact.value}-${index}`} className="kb-contact-chip">
            <span className="kb-contact-value">{contact.value}</span>
            <div className="kb-contact-links">
              {contact.type === 'phone' ? (
                <>
                  <a href={`tel:${contact.digits}`} className="kb-contact-link">Call</a>
                  <a href={`sms:${contact.digits}`} className="kb-contact-link">Text</a>
                </>
              ) : (
                <a href={`mailto:${contact.value}`} className="kb-contact-link">Email</a>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderChecklistItem = (item: NonNullable<typeof checklists>[number]) => (
    <React.Fragment key={item.id}>
      <div
        className={`kb-checklist-item${draggingChecklistId === item.id ? ' dragging' : ''}${dragOverChecklistId === item.id ? ` drop-${dragOverChecklistPos}` : ''}`}
        onDragOver={e => handleChecklistDragOver(e, item.id)}
        onDrop={e => handleChecklistDrop(e, item.id)}
      >
        <button
          className="kb-checklist-drag-handle"
          draggable
          onDragStart={e => handleChecklistDragStart(e, item.id)}
          onDragEnd={clearChecklistDrag}
          onClick={e => e.stopPropagation()}
          title="Drag to reorder"
          aria-label="Drag to reorder checklist item"
        >
          <GripVertical size={13} />
        </button>
        <button
          className={`kb-checkbox ${item.is_completed ? 'checked' : ''}`}
          onClick={() => onToggleChecklistItem(item.id, !item.is_completed)}
        >
          {item.is_completed && <Check size={11} />}
        </button>
        {editingChecklistId === item.id ? (
          <input
            className="kb-input kb-checklist-edit-input"
            value={editingChecklistTitle}
            autoFocus
            onChange={e => setEditingChecklistTitle(e.target.value)}
            onBlur={() => {
              if (editingChecklistTitle.trim() && editingChecklistTitle.trim() !== item.title) {
                onRenameChecklistItem(item.id, editingChecklistTitle.trim());
              }
              setEditingChecklistId(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (editingChecklistTitle.trim() && editingChecklistTitle.trim() !== item.title) {
                  onRenameChecklistItem(item.id, editingChecklistTitle.trim());
                }
                setEditingChecklistId(null);
              }
              if (e.key === 'Escape') setEditingChecklistId(null);
            }}
            style={{ flex: 1 }}
          />
        ) : (
          item.url ? (
            <>
              <span
                className={`kb-checklist-text kb-checklist-link ${item.is_completed ? 'completed' : ''}`}
                onClick={() => { setEditingChecklistLinkId(item.id); setEditingChecklistUrl(item.url || ''); }}
                title="Click to edit link"
                style={{ cursor: 'pointer' }}
              >
                {item.title}
              </span>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="kb-checklist-open-btn"
                title={`Open: ${item.url}`}
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink size={11} />
              </a>
            </>
          ) : (
            <span
              className={`kb-checklist-text ${item.is_completed ? 'completed' : ''}`}
              onClick={() => { setEditingChecklistId(item.id); setEditingChecklistTitle(item.title); }}
              title="Click to edit"
              style={{ cursor: 'text' }}
            >
              {item.title}
            </span>
          )
        )}
        <button
          className={`kb-btn-icon-sm${item.url ? ' kb-checklist-link-active' : ''}`}
          onClick={() => {
            if (editingChecklistLinkId === item.id) {
              setEditingChecklistLinkId(null);
            } else {
              setEditingChecklistLinkId(item.id);
              setEditingChecklistUrl(item.url || '');
            }
          }}
          title={item.url ? 'Edit link' : 'Add link'}
        >
          <LinkIcon size={11} />
        </button>
        <div className="kb-checklist-due-wrapper">
          {showingDateInputId === item.id ? (
            <input
              type="date"
              className="kb-checklist-due-input-edit"
              value={item.due_date || ''}
              autoFocus
              onChange={e => { onUpdateChecklistDueDate(item.id, e.target.value || null); setShowingDateInputId(null); }}
              onBlur={() => setShowingDateInputId(null)}
              onKeyDown={e => { if (e.key === 'Escape') setShowingDateInputId(null); }}
            />
          ) : item.due_date ? (() => {
            const d = new Date(item.due_date + 'T00:00:00');
            const today = new Date(new Date().toDateString());
            const isOverdue = !item.is_completed && d < today;
            const isDueToday = !item.is_completed && d.toDateString() === today.toDateString();
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return (
              <button
                className={`kb-checklist-date-badge${isOverdue ? ' overdue' : isDueToday ? ' due-today' : ''}`}
                onClick={() => setShowingDateInputId(item.id)}
                title={`Due ${d.toLocaleDateString()} — click to change`}
              >
                <CalendarDays size={10} />
                {label}
              </button>
            );
          })() : (
            <button
              className="kb-checklist-date-btn"
              onClick={() => setShowingDateInputId(item.id)}
              title="Set due date"
            >
              <CalendarDays size={11} />
            </button>
          )}
        </div>
        <button className="kb-btn-icon-sm" onClick={() => onDeleteChecklistItem(item.id)}>
          <X size={11} />
        </button>
        <button
          className={`kb-btn-icon-sm${convertingItemId === item.id ? ' kb-checklist-link-active' : ''}`}
          onClick={() => {
            if (convertingItemId === item.id) {
              setConvertingItemId(null);
            } else {
              setConvertingItemId(item.id);
              setConvertColumnId(card.column_id);
            }
          }}
          title="Convert to card"
        >
          <ArrowUpRight size={11} />
        </button>
      </div>
      {convertingItemId === item.id && (
        <div className="kb-checklist-convert-row">
          <ArrowUpRight size={11} style={{ color: '#a1a1aa', flexShrink: 0 }} />
          <select
            className="kb-input kb-checklist-convert-select"
            value={convertColumnId}
            onChange={e => setConvertColumnId(e.target.value)}
          >
            {board.columns.map(col => (
              <option key={col.id} value={col.id}>{col.title}</option>
            ))}
          </select>
          <button
            className="kb-btn kb-btn-primary kb-btn-sm"
            onClick={async () => {
              await onConvertToCard(item.id, item.title, convertColumnId);
              setConvertingItemId(null);
            }}
          >Convert</button>
          <button
            className="kb-btn kb-btn-sm"
            onClick={() => setConvertingItemId(null)}
          >Cancel</button>
        </div>
      )}
      {editingChecklistLinkId === item.id && (
        <div className="kb-checklist-url-row">
          <LinkIcon size={11} style={{ color: '#a1a1aa', flexShrink: 0 }} />
          <input
            className="kb-input kb-checklist-url-input"
            value={editingChecklistUrl}
            autoFocus
            placeholder="https://..."
            onChange={e => setEditingChecklistUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const val = editingChecklistUrl.trim() || null;
                onUpdateChecklistItemUrl(item.id, val);
                setEditingChecklistLinkId(null);
              }
              if (e.key === 'Escape') setEditingChecklistLinkId(null);
            }}
          />
          <button
            className="kb-btn kb-btn-primary kb-btn-sm"
            onClick={() => {
              const val = editingChecklistUrl.trim() || null;
              onUpdateChecklistItemUrl(item.id, val);
              setEditingChecklistLinkId(null);
            }}
          >Save</button>
          {item.url && (
            <button
              className="kb-btn kb-btn-sm"
              onClick={() => { onUpdateChecklistItemUrl(item.id, null); setEditingChecklistLinkId(null); }}
            >Remove</button>
          )}
        </div>
      )}
    </React.Fragment>
  );

  return (
    <div
      className="kb-modal-overlay"
      onMouseDown={e => { overlayMouseDownRef.current = e.target === e.currentTarget; }}
      onClick={e => {
        if (e.target === e.currentTarget && overlayMouseDownRef.current) handleClose();
        overlayMouseDownRef.current = false;
      }}
    >
      <div className="kb-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Close */}
        <button className="kb-detail-close" onClick={handleClose}><X size={18} /></button>

        <div className="kb-detail-body">
          {/* Left: Main content */}
          <div className="kb-detail-main">
            {/* Complete toggle + Title */}
            <div className="kb-detail-title-row">
              <button
                className={`kb-complete-toggle ${card.is_complete ? 'checked' : ''}`}
                onClick={async () => {
                  const newValue = !card.is_complete;
                  await onUpdate({ is_complete: newValue });
                  if (newValue) {
                    const formatted = DateTime.now().toFormat("LLL d, yyyy 'at' h:mm a");
                    await onAddComment(`✅ Completed on ${formatted}`);
                  }
                }}
                title={card.is_complete ? 'Mark incomplete' : 'Mark complete'}
              >
                {card.is_complete ? <Check size={14} /> : null}
              </button>
              <input
                ref={titleRef}
                className={`kb-detail-title-input ${card.is_complete ? 'completed' : ''}`}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Card title..."
              />
            </div>

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
              </div>
              <div className="kb-desc-editor">
                <RichTextEditor
                  value={editDesc}
                  onChange={setEditDesc}
                  placeholder="Add a more detailed description..."
                  minHeight="120px"
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <DictateAndSummarize text={editDesc} onTextChange={setEditDesc} />
              </div>
              {renderContactActions(descriptionContacts, 'compact')}
            </div>

            {/* Screenshot */}
            <div className="kb-screenshot-section">
              <div className="kb-detail-section-label">
                <Camera size={13} /> Screenshot
              </div>
              {screenshotUrl && (
                <div className="kb-screenshot-thumb-wrap">
                  <img
                    src={screenshotUrl}
                    alt="Card screenshot"
                    className="kb-screenshot-thumb"
                    onClick={() => setLightboxOpen(true)}
                    title="Click to enlarge"
                  />
                  <button
                    className="kb-screenshot-remove"
                    onClick={handleRemoveScreenshot}
                    disabled={uploadingScreenshot}
                    title="Remove screenshot"
                  >
                    <X size={12} />
                  </button>
                  <button
                    className="kb-screenshot-remove"
                    style={{ right: 28 }}
                    onClick={handleCopyScreenshot}
                    title="Copy screenshot to clipboard"
                  >
                    {screenshotCopied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              )}
              <div className="kb-screenshot-upload-row">
                <button
                  className="kb-screenshot-upload-btn"
                  onClick={() => screenshotInputRef.current?.click()}
                  disabled={uploadingScreenshot}
                >
                  {uploadingScreenshot ? (
                    <span style={{ width: 12, height: 12, border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                  ) : (
                    <Camera size={12} />
                  )}
                  {uploadingScreenshot ? 'Uploading…' : screenshotUrl ? 'Replace' : 'Attach screenshot'}
                </button>
                <span className="kb-screenshot-hint">Images are compressed before upload</span>
                <input
                  ref={screenshotInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadScreenshot(file);
                  }}
                />
              </div>
              {screenshotError && <div className="kb-screenshot-error">{screenshotError}</div>}
            </div>

            {/* Lightbox */}
            {lightboxOpen && screenshotUrl && (
              <div
                className="kb-screenshot-lightbox-overlay"
                onClick={() => setLightboxOpen(false)}
              >
                <img
                  src={screenshotUrl}
                  alt="Screenshot full size"
                  className="kb-screenshot-lightbox-img"
                  onClick={e => e.stopPropagation()}
                />
              </div>
            )}

            {/* Checklists */}
            <div style={{ marginBottom: 16 }}>
              <div className="kb-detail-section-label">
                <CheckSquare size={13} />
                Checklists {checklists.length > 0 && `(${completedCount}/${checklists.length})`}
                <button
                  onClick={suggestChecklistItems}
                  disabled={isSuggesting}
                  title="Suggest checklist items from description"
                  className="kb-btn-icon-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', fontSize: 11, color: 'var(--kb-violet, #a78bfa)', opacity: isSuggesting ? 0.5 : 1 }}
                >
                  {isSuggesting ? (
                    <span style={{ width: 10, height: 10, border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                  ) : (
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  )}
                  Suggest
                </button>
                <button
                  className="kb-btn-icon-sm"
                  title="Add checklist"
                  onClick={async () => {
                    const newGroup = await onAddChecklistGroup('Checklist');
                    if (newGroup) { setEditingGroupId(newGroup.id); setEditingGroupTitle(newGroup.title); }
                  }}
                >
                  <Plus size={12} />
                </button>
              </div>

              {/* Suggestion error */}
              {suggestionError && (
                <div style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', fontSize: 11, color: '#fbbf24' }}>
                  {suggestionError}
                </div>
              )}

              {/* AI Suggestions panel */}
              {suggestions.length > 0 && (
                <div style={{ marginBottom: 10, borderRadius: 8, border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.07)', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a78bfa' }}>Suggested Items</span>
                    <button
                      onClick={() => { setSuggestions([]); setSelectedSuggestions(new Set()); setSuggestionError(''); }}
                      style={{ color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1 }}
                      title="Dismiss suggestions"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {suggestions.map((s, i) => (
                      <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', padding: '3px 4px', borderRadius: 4 }}>
                        <input
                          type="checkbox"
                          checked={selectedSuggestions.has(i)}
                          onChange={() => {
                            setSelectedSuggestions(prev => {
                              const next = new Set(prev);
                              next.has(i) ? next.delete(i) : next.add(i);
                              return next;
                            });
                          }}
                          style={{ marginTop: 2, accentColor: '#8b5cf6', flexShrink: 0 }}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 12, color: 'var(--kb-text, #e2e8f0)', lineHeight: 1.4 }}>{s.text}</span>
                          <span style={{ display: 'block', fontSize: 10, color: 'var(--kb-muted, #71717a)', lineHeight: 1.3 }}>
                            {s.kind === 'open_item' ? 'Open item' : 'Next step'} · "{s.sourceQuote}"
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <select
                    value={targetSuggestionGroupId}
                    onChange={e => setTargetSuggestionGroupId(e.target.value)}
                    style={{ marginTop: 10, width: '100%', padding: '5px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd', fontSize: 11, outline: 'none' }}
                  >
                    {checklistGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.title || 'Untitled checklist'}</option>
                    ))}
                    <option value="__new__">New checklist</option>
                  </select>
                  <button
                    onClick={addSelectedSuggestions}
                    disabled={selectedSuggestions.size === 0}
                    style={{ marginTop: 8, width: '100%', padding: '6px 12px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: selectedSuggestions.size === 0 ? 'not-allowed' : 'pointer', opacity: selectedSuggestions.size === 0 ? 0.5 : 1 }}
                  >
                    Add {selectedSuggestions.size} selected
                  </button>
                </div>
              )}

              {/* Overall progress bar */}
              {checklists.length > 0 && (
                <div className="kb-checklist-progress">
                  <div className="kb-checklist-bar">
                    <div className="kb-checklist-fill" style={{ width: `${(completedCount / checklists.length) * 100}%` }} />
                  </div>
                </div>
              )}

              {/* Ungrouped items — with editable title header */}
              {ungroupedItems.length > 0 && (
                <>
                  <div className="kb-checklist-group-header" style={{ marginBottom: 6 }}>
                    {editingUngroupedTitle ? (
                      <input
                        className="kb-input kb-checklist-group-title-input"
                        value={ungroupedTitleDraft}
                        autoFocus
                        onChange={e => setUngroupedTitleDraft(e.target.value)}
                        onBlur={() => {
                          if (ungroupedTitleDraft.trim()) {
                            onPromoteUngrouped(ungroupedTitleDraft.trim());
                          }
                          setEditingUngroupedTitle(false);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (ungroupedTitleDraft.trim()) onPromoteUngrouped(ungroupedTitleDraft.trim());
                            setEditingUngroupedTitle(false);
                          }
                          if (e.key === 'Escape') setEditingUngroupedTitle(false);
                        }}
                      />
                    ) : (
                      <span
                        className="kb-checklist-group-title"
                        onClick={() => { setEditingUngroupedTitle(true); setUngroupedTitleDraft('Checklist'); }}
                        title="Click to rename"
                      >
                        Checklist
                      </span>
                    )}
                  </div>
                  <div className="kb-checklist-items">
                    {ungroupedItems.map(item => renderChecklistItem(item))}
                  </div>
                </>
              )}

              {/* Ungrouped add row — always visible when no groups exist, button otherwise */}
              {checklistGroups.length === 0 ? (
                activeAddSection === '__ungrouped__' ? (
                  <div className="kb-checklist-add">
                    <input
                      className="kb-input"
                      value={checklistText}
                      autoFocus
                      onChange={e => setChecklistText(e.target.value)}
                      placeholder="Add checklist item..."
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddChecklist();
                        if (e.key === 'Escape') { setActiveAddSection(null); setChecklistText(''); }
                      }}
                      style={{ flex: 1 }}
                    />
                    <button className="kb-btn kb-btn-primary kb-btn-sm" onClick={handleAddChecklist} disabled={!checklistText.trim()}>Add</button>
                    <button className="kb-btn kb-btn-sm" onClick={() => { setActiveAddSection(null); setChecklistText(''); }}>Cancel</button>
                  </div>
                ) : (
                  <div className="kb-checklist-add">
                    <input
                      className="kb-input"
                      value={checklistText}
                      onChange={e => setChecklistText(e.target.value)}
                      placeholder="Add checklist item..."
                      onKeyDown={e => e.key === 'Enter' && handleAddChecklist()}
                      style={{ flex: 1 }}
                    />
                    <button className="kb-btn kb-btn-primary kb-btn-sm" onClick={handleAddChecklist} disabled={!checklistText.trim()}>Add</button>
                  </div>
                )
              ) : ungroupedItems.length > 0 && (
                activeAddSection === '__ungrouped__' ? (
                  <div className="kb-checklist-add" style={{ marginBottom: 8 }}>
                    <input
                      className="kb-input"
                      value={checklistText}
                      autoFocus
                      onChange={e => setChecklistText(e.target.value)}
                      placeholder="Add item..."
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddChecklist();
                        if (e.key === 'Escape') { setActiveAddSection(null); setChecklistText(''); }
                      }}
                      style={{ flex: 1 }}
                    />
                    <button className="kb-btn kb-btn-primary kb-btn-sm" onClick={handleAddChecklist} disabled={!checklistText.trim()}>Add</button>
                    <button className="kb-btn kb-btn-sm" onClick={() => { setActiveAddSection(null); setChecklistText(''); }}>Cancel</button>
                  </div>
                ) : (
                  <button
                    className="kb-btn kb-btn-ghost kb-btn-sm kb-checklist-add-btn"
                    onClick={() => { setActiveAddSection('__ungrouped__'); setChecklistText(''); }}
                  >
                    <Plus size={12} /> Add item
                  </button>
                )
              )}

              {/* Named checklist groups */}
              {checklistGroups.map(group => {
                const groupItems = checklists.filter(cl => cl.group_id === group.id);
                const groupDone = groupItems.filter(cl => cl.is_completed).length;
                return (
                  <div key={group.id} className="kb-checklist-group">
                    <div className="kb-checklist-group-header">
                      {editingGroupId === group.id ? (
                        <input
                          className="kb-input kb-checklist-group-title-input"
                          value={editingGroupTitle}
                          autoFocus
                          onChange={e => setEditingGroupTitle(e.target.value)}
                          onBlur={() => {
                            if (editingGroupTitle.trim() && editingGroupTitle.trim() !== group.title) {
                              onRenameChecklistGroup(group.id, editingGroupTitle.trim());
                            }
                            setEditingGroupId(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              if (editingGroupTitle.trim()) onRenameChecklistGroup(group.id, editingGroupTitle.trim());
                              setEditingGroupId(null);
                            }
                            if (e.key === 'Escape') setEditingGroupId(null);
                          }}
                        />
                      ) : (
                        <span
                          className="kb-checklist-group-title"
                          onClick={() => { setEditingGroupId(group.id); setEditingGroupTitle(group.title); }}
                          title="Click to rename"
                        >
                          {group.title}
                        </span>
                      )}
                      {groupItems.length > 0 && (
                        <span className="kb-checklist-group-count">{groupDone}/{groupItems.length}</span>
                      )}
                      <button
                        className="kb-btn-icon-sm"
                        onClick={() => { if (confirm(`Delete "${group.title}" and all its items?`)) onDeleteChecklistGroup(group.id); }}
                        title="Delete checklist"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                    {groupItems.length > 0 && (
                      <>
                        <div className="kb-checklist-progress" style={{ marginTop: 4, marginBottom: 6 }}>
                          <div className="kb-checklist-bar">
                            <div className="kb-checklist-fill" style={{ width: `${(groupDone / groupItems.length) * 100}%` }} />
                          </div>
                        </div>
                        <div className="kb-checklist-items">
                          {groupItems.map(item => renderChecklistItem(item))}
                        </div>
                      </>
                    )}
                    {activeAddSection === group.id ? (
                      <div className="kb-checklist-add" style={{ marginTop: 4 }}>
                        <input
                          className="kb-input"
                          value={checklistText}
                          autoFocus
                          onChange={e => setChecklistText(e.target.value)}
                          placeholder="Add item..."
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddChecklist();
                            if (e.key === 'Escape') { setActiveAddSection(null); setChecklistText(''); }
                          }}
                          style={{ flex: 1 }}
                        />
                        <button className="kb-btn kb-btn-primary kb-btn-sm" onClick={handleAddChecklist} disabled={!checklistText.trim()}>Add</button>
                        <button className="kb-btn kb-btn-sm" onClick={() => { setActiveAddSection(null); setChecklistText(''); }}>Cancel</button>
                      </div>
                    ) : (
                      <button
                        className="kb-btn kb-btn-ghost kb-btn-sm kb-checklist-add-btn"
                        onClick={() => { setActiveAddSection(group.id); setChecklistText(''); }}
                      >
                        <Plus size={12} /> Add item
                      </button>
                    )}
                  </div>
                );
              })}

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
                      <button className="kb-btn-icon-sm" onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.content); }} title="Edit">
                        <Pencil size={11} />
                      </button>
                      <button className="kb-btn-icon-sm" onClick={() => onDeleteComment(comment.id)} title="Delete">
                        <Trash2 size={11} />
                      </button>
                    </div>
                    {editingCommentId === comment.id ? (
                      <div className="kb-comment-edit">
                        <textarea
                          className="kb-textarea"
                          value={editingCommentText}
                          onChange={e => setEditingCommentText(e.target.value)}
                          rows={2}
                          autoFocus
                        />
                        <div className="kb-comment-edit-actions">
                          <button className="kb-btn kb-btn-primary kb-btn-sm" onClick={async () => { await onUpdateComment(comment.id, editingCommentText.trim()); setEditingCommentId(null); }} disabled={!editingCommentText.trim()}>Save</button>
                          <button className="kb-btn kb-btn-sm" onClick={() => setEditingCommentId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="kb-comment-text">
                          {comment.content.split('\n').map((line, i, arr) => (
                            <span key={i}>{linkifyText(line)}{i < arr.length - 1 && <br />}</span>
                          ))}
                        </p>
                        {renderContactActions(extractTextContacts(comment.content), 'comment')}
                      </>
                    )}
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
            {/* Dates — kept at top of the sidebar; scheduling is the most time-sensitive info on a card */}
            <div className="kb-form-group">
              <div className="kb-detail-section-label"><CalendarDays size={13} /> Start Date</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="kb-input"
                  type="date"
                  value={editStartDate}
                  onChange={e => setEditStartDate(e.target.value)}
                  style={{ flex: 1 }}
                />
                {editStartDate && (
                  <button
                    type="button"
                    className="kb-btn kb-btn-ghost kb-btn-sm"
                    onClick={() => setEditStartDate('')}
                    title="Clear start date"
                    style={{ flexShrink: 0 }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="kb-form-group">
              <div className="kb-detail-section-label"><Clock size={13} /> Due Date</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="kb-input"
                  type="date"
                  value={editDueDate}
                  onChange={e => {
                    const next = e.target.value;
                    setEditDueDate(next);
                    if (!next) setEditDueTime('');
                  }}
                  style={{ flex: 1 }}
                />
                {editDueDate && (
                  <button
                    type="button"
                    className="kb-btn kb-btn-ghost kb-btn-sm"
                    onClick={() => {
                      setEditDueDate('');
                      setEditDueTime('');
                    }}
                    title="Clear due date"
                    style={{ flexShrink: 0 }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <select
                className="kb-input"
                value={editDueTime}
                onChange={e => setEditDueTime(e.target.value)}
                disabled={!editDueDate}
                title="Due time in Central Time"
                style={{ marginTop: 6 }}
              >
                <option value="">No time</option>
                {TIME_OPTIONS_15_MIN.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {isDueDateOverdue && (
                <button
                  type="button"
                  className="kb-modal-snooze-btn"
                  onClick={handleSnoozeDueDate}
                  title="Move due date forward one day"
                >
                  <Clock size={12} />
                  Snooze 1 day
                </button>
              )}
            </div>

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

            {/* Assignees */}
            <div className="kb-form-group">
              <div className="kb-detail-section-label"><User size={13} /> Assignees</div>
              <AssigneePicker
                assignments={card.assignments || []}
                onAssign={onAssignCard}
                onUnassign={onUnassignCard}
                fetchSystemUsers={fetchSystemUsers}
              />
            </div>

            {/* Repeat */}
            <div className="kb-form-group">
              <div className="kb-detail-section-label"><Repeat2 size={13} /> Repeat</div>
              <select
                className="kb-input"
                value={editRepeatRule}
                onChange={e => {
                  const val = e.target.value as TodoRepeatRule;
                  setEditRepeatRule(val);
                  if (val !== 'daily') setEditRepeatDays([]);
                }}
              >
                <option value="none">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
              {editRepeatRule === 'daily' && (
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                  {(['S','M','T','W','T','F','S'] as const).map((label, idx) => {
                    const active = editRepeatDays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setEditRepeatDays(prev =>
                          prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort()
                        )}
                        style={{
                          width: 30, height: 30, borderRadius: 6, border: 'none',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          background: active ? '#33B233' : '#1e2030',
                          color: active ? '#fff' : '#6b7280',
                          transition: 'all 0.15s',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              {editRepeatRule !== 'none' && editRepeatRule !== 'daily' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{ color: '#9ca3af', fontSize: 12 }}>Every</span>
                  <input
                    className="kb-input"
                    type="number"
                    min={1}
                    max={365}
                    value={editRepeatInterval}
                    onChange={e => setEditRepeatInterval(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ width: 56, textAlign: 'center' }}
                  />
                  <span style={{ color: '#9ca3af', fontSize: 12 }}>
                    {editRepeatRule === 'weekly' ? 'week(s)' : editRepeatRule === 'monthly' ? 'month(s)' : 'year(s)'}
                  </span>
                </div>
              )}
              {editRepeatRule !== 'none' && editRepeatRule !== 'daily' && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
                  {buildRepeatLabel(editRepeatRule, editRepeatInterval)}
                  {!editDueDate && ' — set a due date for repeat to work'}
                </div>
              )}
              {editRepeatRule === 'daily' && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
                  {editRepeatDays.length > 0
                    ? `Repeats on ${editRepeatDays.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}`
                    : 'Every day'}
                  {!editDueDate && ' — set a due date for repeat to work'}
                </div>
              )}
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

            {/* Move to Board */}
            <div className="kb-form-group">
              <div className="kb-detail-section-label"><FolderKanban size={13} /> Move to Board</div>
              <select
                className="kb-input"
                value={targetBoardId}
                onChange={e => handleTargetBoardChange(e.target.value)}
              >
                <option value="">— select board —</option>
                {allBoards.filter(b => b.id !== board.id).map(b => (
                  <option key={b.id} value={b.id}>{b.title}</option>
                ))}
              </select>
              {targetBoardId && (
                <>
                  <select
                    className="kb-input"
                    value={targetColumnId}
                    onChange={e => setTargetColumnId(e.target.value)}
                    style={{ marginTop: 6 }}
                  >
                    {targetBoardColumns.map(col => (
                      <option key={col.id} value={col.id}>{col.title}</option>
                    ))}
                  </select>
                  <button
                    className="kb-btn kb-btn-primary"
                    onClick={handleMoveToBoard}
                    disabled={movingToBoard || !targetColumnId}
                    style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
                  >
                    {movingToBoard ? 'Moving...' : 'Move Card'}
                  </button>
                </>
              )}
            </div>

            {/* Circle Leader */}
            <div className="kb-form-group">
              <div className="kb-detail-section-label"><User size={13} /> Circle Leader</div>
              {linkedLeaderId ? (() => {
                const leader = allLeaders.find(l => l.id === linkedLeaderId);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Link
                        href={`/circle/${linkedLeaderId}`}
                        style={{ flex: 1, color: '#56c93f', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                      >
                        {leader?.name ?? `Leader #${linkedLeaderId}`}
                      </Link>
                      <button
                        className="kb-btn-icon-sm"
                        onClick={() => setLinkedLeaderId(null)}
                        title="Remove link"
                      ><X size={12} /></button>
                    </div>
                    {leader?.ccb_group_id && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <a
                          href={`https://valleycreekchurch.ccbchurch.com/goto/groups/${leader.ccb_group_id}/events`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="kb-btn kb-btn-ghost"
                          style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                        >
                          <CalendarDays size={13} />
                          View CCB Calendar
                        </a>
                        <a
                          href={`https://valleycreekchurch.ccbchurch.com/group_edit.php?ax=edit&group_id=${leader.ccb_group_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="kb-btn kb-btn-ghost"
                          style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                        >
                          <ExternalLink size={13} />
                          Edit Group in CCB
                        </a>
                      </div>
                    )}
                  </div>
                );
              })() : (
                <select
                  className="kb-input"
                  value=""
                  onChange={e => setLinkedLeaderId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— link a leader —</option>
                  {allLeaders.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
            </div>

            {/* Focus */}
            <div className="kb-form-group">
              <button
                className={`kb-btn ${isFocused ? 'kb-btn-primary' : 'kb-btn-ghost'}`}
                onClick={handleToggleFocus}
                style={{ width: '100%', justifyContent: 'center', gap: 6 }}
              >
                {isFocused ? <Star size={14} /> : <Circle size={14} />}
                {isFocused ? 'Focused' : 'Set as Focus'}
              </button>
            </div>

            {/* Actions */}
            <div style={{ borderTop: '1px solid #2a2d3a', paddingTop: 16, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className={`kb-btn ${copyStatus === 'copied' ? 'kb-btn-primary' : 'kb-btn-ghost'}`}
                onClick={handleCopyCardForAi}
                style={{ width: '100%', justifyContent: 'center' }}
                title="Copy this card as formatted text for an AI chat"
              >
                {copyStatus === 'copied' ? <Check size={13} /> : <Copy size={13} />}
                {copyStatus === 'copied' ? 'Copied for AI' : copyStatus === 'error' ? 'Copy Failed' : 'Copy content'}
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
                    if (screenshotUrl) {
                      await supabase.storage.from('card-screenshots').remove([`${card.id}/screenshot.jpg`]);
                    }
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
