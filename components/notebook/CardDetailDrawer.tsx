'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useNotebookContext } from '../../contexts/NotebookContext';
import type { NotebookPageCard, CardChecklist, CardComment } from '../../lib/supabase';

interface ChecklistSuggestion {
  text: string;
  kind: 'next_step' | 'open_item';
  sourceLine: number;
  sourceQuote: string;
}

const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  high:   { label: 'High',   color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  low:    { label: 'Low',    color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
} as const;

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function suggestionDescription(suggestion: ChecklistSuggestion): string {
  return `${suggestion.kind === 'open_item' ? 'Open item' : 'Next step'} · line ${suggestion.sourceLine}: "${suggestion.sourceQuote}"`;
}

interface CardDetailDrawerProps {
  link: NotebookPageCard;
  onClose: () => void;
}

export default function CardDetailDrawer({ link, onClose }: CardDetailDrawerProps) {
  const { activePage, updateLinkedCard } = useNotebookContext();
  const card = link.board_card;

  // Card fields
  const [title, setTitle] = useState(card?.title ?? '');
  const [description, setDescription] = useState(card?.description ?? '');
  const [priority, setPriority] = useState(card?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(card?.due_date ?? '');
  const [isComplete, setIsComplete] = useState(card?.is_complete ?? false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Checklists
  const [checklists, setChecklists] = useState<CardChecklist[]>([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('');
  const [isSuggestingChecklist, setIsSuggestingChecklist] = useState(false);
  const [checklistSuggestionError, setChecklistSuggestionError] = useState('');
  const [checklistSuggestions, setChecklistSuggestions] = useState<ChecklistSuggestion[]>([]);
  const [selectedChecklistSuggestions, setSelectedChecklistSuggestions] = useState<Set<number>>(new Set());

  // Comments
  const [comments, setComments] = useState<CardComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  // Sync card fields when card changes
  useEffect(() => {
    if (!card) return;
    setTitle(card.title);
    setDescription(card.description ?? '');
    setPriority(card.priority);
    setDueDate(card.due_date ?? '');
    setIsComplete(card.is_complete);
  }, [card, link.card_id]);

  // Load checklists + comments
  useEffect(() => {
    if (!link.card_id) return;
    (async () => {
      const [{ data: clData }, { data: cmData }] = await Promise.all([
        supabase.from('card_checklists').select('*').eq('card_id', link.card_id).order('position'),
        supabase.from('card_comments').select('*, users(name)').eq('card_id', link.card_id).order('created_at', { ascending: true }),
      ]);
      if (clData) setChecklists(clData as CardChecklist[]);
      if (cmData) setComments(cmData as CardComment[]);
    })();
  }, [link.card_id]);

  // ─── Card field updates ─────────────────────────────────────
  function scheduleUpdate(updates: Parameters<typeof updateLinkedCard>[1]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      await updateLinkedCard(link.card_id, updates);
      setSaving(false);
    }, 600);
  }

  function handleTitleChange(val: string) {
    setTitle(val);
    scheduleUpdate({ title: val, description, priority, due_date: dueDate || null });
  }

  function handleDescChange(val: string) {
    setDescription(val);
    scheduleUpdate({ title, description: val, priority, due_date: dueDate || null });
  }

  function handlePriorityChange(val: string) {
    setPriority(val as typeof priority);
    scheduleUpdate({ title, description, priority: val, due_date: dueDate || null });
  }

  function handleDueDateChange(val: string) {
    setDueDate(val);
    scheduleUpdate({ title, description, priority, due_date: val || null });
  }

  async function handleToggleComplete() {
    const next = !isComplete;
    setIsComplete(next);
    await updateLinkedCard(link.card_id, { is_complete: next });
  }

  // ─── Checklists ─────────────────────────────────────────────
  async function handleAddChecklistItem() {
    const t = newChecklistTitle.trim();
    if (!t) return;
    const maxPos = checklists.reduce((m, cl) => Math.max(m, cl.position), -1);
    const { data, error } = await supabase
      .from('card_checklists')
      .insert({ card_id: link.card_id, title: t, position: maxPos + 1 })
      .select()
      .single();
    if (!error && data) {
      setChecklists(prev => [...prev, data as CardChecklist]);
      setNewChecklistTitle('');
    }
  }

  async function handleToggleChecklist(item: CardChecklist) {
    const next = !item.is_completed;
    setChecklists(prev => prev.map(cl => cl.id === item.id ? { ...cl, is_completed: next } : cl));
    await supabase.from('card_checklists').update({ is_completed: next }).eq('id', item.id);
  }

  async function handleRenameChecklist(item: CardChecklist) {
    const t = editingChecklistTitle.trim();
    if (t && t !== item.title) {
      setChecklists(prev => prev.map(cl => cl.id === item.id ? { ...cl, title: t } : cl));
      await supabase.from('card_checklists').update({ title: t }).eq('id', item.id);
    }
    setEditingChecklistId(null);
  }

  async function handleDeleteChecklist(itemId: string) {
    setChecklists(prev => prev.filter(cl => cl.id !== itemId));
    await supabase.from('card_checklists').delete().eq('id', itemId);
  }

  async function handleChecklistDueDate(itemId: string, dueDate: string | null) {
    setChecklists(prev => prev.map(cl => cl.id === itemId ? { ...cl, due_date: dueDate ?? undefined } : cl));
    await supabase.from('card_checklists').update({ due_date: dueDate }).eq('id', itemId);
  }

  async function handleSuggestCardChecklistItems() {
    if (isSuggestingChecklist) return;

    const noteText = activePage?.content ? htmlToPlainText(activePage.content) : '';
    if (!noteText) {
      setChecklistSuggestionError('Write a note before asking for card checklist suggestions.');
      return;
    }

    setIsSuggestingChecklist(true);
    setChecklistSuggestionError('');
    setChecklistSuggestions([]);
    setSelectedChecklistSuggestions(new Set());

    try {
      const response = await fetch('/api/notebook/checklist-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: noteText }),
      });

      const data = await response.json();

      if (!response.ok) {
        setChecklistSuggestionError(data.error || 'Failed to suggest card checklist items.');
        return;
      }

      const nextSuggestions: ChecklistSuggestion[] = Array.isArray(data.suggestions) ? data.suggestions : [];
      setChecklistSuggestions(nextSuggestions);
      setSelectedChecklistSuggestions(new Set(nextSuggestions.map((_, index) => index)));

      if (nextSuggestions.length === 0) {
        setChecklistSuggestionError('No clear next steps or outstanding items were found in this note.');
      }
    } catch (err) {
      console.error('Card checklist suggestion error:', err);
      setChecklistSuggestionError('Network error. Please try again.');
    } finally {
      setIsSuggestingChecklist(false);
    }
  }

  function toggleCardChecklistSuggestion(index: number) {
    setSelectedChecklistSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  async function addSelectedCardChecklistSuggestions() {
    if (checklistSuggestions.length === 0 || selectedChecklistSuggestions.size === 0) return;

    const existingTitles = new Set(checklists.map(item => item.title.trim().toLowerCase()).filter(Boolean));
    const selectedItems = checklistSuggestions
      .filter((_, index) => selectedChecklistSuggestions.has(index))
      .map(suggestion => ({ ...suggestion, text: suggestion.text.trim() }))
      .filter(suggestion => suggestion.text && !existingTitles.has(suggestion.text.toLowerCase()));

    if (selectedItems.length === 0) {
      setChecklistSuggestionError('Those items are already on this card.');
      return;
    }

    const maxPos = checklists.reduce((m, cl) => Math.max(m, cl.position), -1);
    const rows = selectedItems.map((suggestion, index) => ({
      card_id: link.card_id,
      title: suggestion.text,
      description: suggestionDescription(suggestion),
      position: maxPos + index + 1,
    }));

    let { data, error } = await supabase
      .from('card_checklists')
      .insert(rows)
      .select();

    if (error && /description/i.test(error.message || '')) {
      const fallbackRows = rows.map(row => ({
        card_id: row.card_id,
        title: row.title,
        position: row.position,
      }));
      const fallbackResult = await supabase
        .from('card_checklists')
        .insert(fallbackRows)
        .select();

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      setChecklistSuggestionError(error.message || 'Failed to add checklist items.');
      return;
    }

    if (data) {
      setChecklists(prev => [...prev, ...(data as CardChecklist[])]);
    }

    setChecklistSuggestions([]);
    setSelectedChecklistSuggestions(new Set());
    setChecklistSuggestionError('');
  }

  // ─── Comments ───────────────────────────────────────────────
  async function handleAddComment() {
    const content = newComment.trim();
    if (!content) return;
    setSavingComment(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingComment(false); return; }
    const { data, error } = await supabase
      .from('card_comments')
      .insert({ card_id: link.card_id, user_id: user.id, content })
      .select('*, users(name)')
      .single();
    if (!error && data) {
      setComments(prev => [...prev, data as CardComment]);
      setNewComment('');
    }
    setSavingComment(false);
  }

  async function handleUpdateComment(commentId: string) {
    const content = editingCommentContent.trim();
    if (!content) return;
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, content } : c));
    await supabase.from('card_comments').update({ content }).eq('id', commentId);
    setEditingCommentId(null);
  }

  async function handleDeleteComment(commentId: string) {
    setComments(prev => prev.filter(c => c.id !== commentId));
    await supabase.from('card_comments').delete().eq('id', commentId);
  }

  if (!card) return null;

  const pCfg = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;
  const completedCount = checklists.filter(cl => cl.is_completed).length;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-[#13151c] border-l border-white/[0.08] shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={handleToggleComplete}
              title={isComplete ? 'Mark incomplete' : 'Mark complete'}
              className="flex-shrink-0"
            >
              {isComplete ? (
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-500 hover:text-gray-300 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <circle cx="12" cy="12" r="9" />
                </svg>
              )}
            </button>
            <span className="text-xs text-gray-500 truncate">
              {card.project_board?.title ?? 'Board'} · {card.board_column?.title ?? 'Column'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {saving && (
              <span className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
            )}
            <Link
              href={`/boards/${card.board_id}?card=${card.id}`}
              target="_blank"
              rel="noopener"
              title="Open in board"
              className="text-gray-500 hover:text-indigo-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </Link>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* Title */}
          <textarea
            value={title}
            onChange={e => handleTitleChange(e.target.value)}
            rows={5}
            className={`w-full bg-transparent text-lg font-semibold text-white placeholder-white/20 border-none outline-none resize-none leading-relaxed py-3 ${
              isComplete ? 'line-through text-gray-400' : ''
            }`}
            placeholder="Card title"
          />

          {/* Priority + Due date */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={priority}
              onChange={e => handlePriorityChange(e.target.value)}
              className="text-xs font-medium rounded-full px-2.5 py-1 border-0 outline-none cursor-pointer"
              style={{ color: pCfg.color, backgroundColor: pCfg.bg }}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
              </svg>
              <input
                type="date"
                value={dueDate}
                onChange={e => handleDueDateChange(e.target.value)}
                className="bg-transparent text-xs text-gray-400 border-none outline-none cursor-pointer"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Description</p>
            <textarea
              value={description}
              onChange={e => handleDescChange(e.target.value)}
              rows={4}
              placeholder="Add a description…"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-400/40 resize-none transition-colors leading-relaxed"
            />
          </div>

          <div className="h-px bg-white/[0.06]" />

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                Checklist{checklists.length > 0 ? ` · ${completedCount}/${checklists.length}` : ''}
              </p>
              <button
                onClick={handleSuggestCardChecklistItems}
                disabled={isSuggestingChecklist}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-violet-400 transition-colors hover:bg-violet-500/10 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
                title="Suggest card checklist items from this note"
              >
                {isSuggestingChecklist ? (
                  <span className="h-3 w-3 rounded-full border border-violet-400 border-t-transparent animate-spin" />
                ) : (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                )}
                Suggest
              </button>
            </div>

            {checklistSuggestionError && (
              <div className="mb-3 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
                {checklistSuggestionError}
              </div>
            )}

            {checklistSuggestions.length > 0 && (
              <div className="mb-3 rounded-lg border border-violet-400/20 bg-violet-500/10 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-300">Suggested Card Items</p>
                  <button
                    onClick={() => {
                      setChecklistSuggestions([]);
                      setSelectedChecklistSuggestions(new Set());
                    }}
                    className="text-violet-400 hover:text-violet-200"
                    title="Dismiss suggestions"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-1.5">
                  {checklistSuggestions.map((suggestion, index) => (
                    <label key={`${suggestion.sourceLine}-${index}`} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-white/[0.05]">
                      <input
                        type="checkbox"
                        checked={selectedChecklistSuggestions.has(index)}
                        onChange={() => toggleCardChecklistSuggestion(index)}
                        className="mt-1 h-3 w-3 rounded border-white/20 bg-transparent accent-violet-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] leading-4 text-gray-200">{suggestion.text}</span>
                        <span className="block text-[9px] leading-3 text-gray-500">
                          {suggestion.kind === 'open_item' ? 'Open item' : 'Next step'} · line {suggestion.sourceLine}: &quot;{suggestion.sourceQuote}&quot;
                        </span>
                      </span>
                    </label>
                  ))}
                </div>

                <button
                  onClick={addSelectedCardChecklistSuggestions}
                  disabled={selectedChecklistSuggestions.size === 0}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-violet-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add selected to card
                </button>
              </div>
            )}

            {/* Progress bar */}
            {checklists.length > 0 && (
              <div className="h-1 bg-white/[0.08] rounded-full mb-3 overflow-hidden">
                <div
                  className="h-1 bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${(completedCount / checklists.length) * 100}%` }}
                />
              </div>
            )}

            {/* Items */}
            <div className="space-y-2 mb-2">
              {checklists.map(item => (
                <div key={item.id} className="group">
                  {/* Title row */}
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleToggleChecklist(item)} className="flex-shrink-0">
                      {item.is_completed ? (
                        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                          <circle cx="12" cy="12" r="9" />
                        </svg>
                      )}
                    </button>

                    {editingChecklistId === item.id ? (
                      <input
                        autoFocus
                        value={editingChecklistTitle}
                        onChange={e => setEditingChecklistTitle(e.target.value)}
                        onBlur={() => handleRenameChecklist(item)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameChecklist(item);
                          if (e.key === 'Escape') setEditingChecklistId(null);
                        }}
                        className="flex-1 text-sm bg-white/[0.06] border border-indigo-400/60 rounded px-2 py-0.5 text-white focus:outline-none"
                      />
                    ) : (
                      <div
                        onDoubleClick={() => { setEditingChecklistId(item.id); setEditingChecklistTitle(item.title); }}
                        className="flex-1 min-w-0 cursor-default select-none"
                      >
                        <p className={`text-sm leading-5 ${item.is_completed ? 'line-through text-gray-500 decoration-emerald-400/60 decoration-2' : 'text-gray-300'}`}>
                          {item.title}
                        </p>
                        {item.description && (
                          <p className={`mt-0.5 text-[11px] leading-4 ${item.is_completed ? 'text-gray-600' : 'text-gray-500'}`}>
                            {item.description}
                          </p>
                        )}
                      </div>
                    )}

                    <button
                      onClick={() => handleDeleteChecklist(item.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400 flex-shrink-0"
                      title="Remove"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Due date row — indented to align with title */}
                  <div className="flex items-center gap-1.5 pl-6 mt-0.5">
                    <svg className="w-3 h-3 text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                    </svg>
                    <input
                      type="date"
                      value={item.due_date ?? ''}
                      onChange={e => handleChecklistDueDate(item.id, e.target.value || null)}
                      className={`bg-transparent text-[11px] border-none outline-none cursor-pointer ${
                        item.due_date ? 'text-gray-400' : 'text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity'
                      }`}
                    />
                    {item.due_date && (
                      <button
                        onClick={() => handleChecklistDueDate(item.id, null)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400"
                        title="Clear date"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add item */}
            <div className="flex items-center gap-2">
              <input
                value={newChecklistTitle}
                onChange={e => setNewChecklistTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddChecklistItem(); }}
                placeholder="Add item…"
                className="flex-1 text-sm bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-400/40 transition-colors"
              />
              <button
                onClick={handleAddChecklistItem}
                disabled={!newChecklistTitle.trim()}
                className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                Add
              </button>
            </div>
          </div>

          <div className="h-px bg-white/[0.06]" />

          {/* Comments */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-3">
              Comments{comments.length > 0 ? ` · ${comments.length}` : ''}
            </p>

            <div className="space-y-3 mb-3">
              {comments.map(comment => (
                <div key={comment.id} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-gray-500 font-medium">{comment.users?.name ?? 'You'}</span>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingCommentId(comment.id);
                          setEditingCommentContent(comment.content);
                        }}
                        className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="text-[11px] text-gray-500 hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {editingCommentId === comment.id ? (
                    <div className="space-y-1.5">
                      <textarea
                        autoFocus
                        value={editingCommentContent}
                        onChange={e => setEditingCommentContent(e.target.value)}
                        rows={3}
                        className="w-full bg-white/[0.06] border border-indigo-400/40 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none resize-none leading-relaxed"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateComment(comment.id)}
                          className="text-xs px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingCommentId(null)}
                          className="text-xs px-2.5 py-1 text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-300 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 leading-relaxed">
                      {comment.content}
                    </p>
                  )}
                </div>
              ))}

              {comments.length === 0 && (
                <p className="text-xs text-gray-600">No comments yet</p>
              )}
            </div>

            {/* Add comment */}
            <div className="space-y-1.5">
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment(); }}
                placeholder="Add a comment… (⌘↵ to post)"
                rows={2}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-400/40 resize-none transition-colors leading-relaxed"
              />
              {newComment.trim() && (
                <button
                  onClick={handleAddComment}
                  disabled={savingComment}
                  className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingComment ? 'Posting…' : 'Post'}
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/[0.06]">
          <Link
            href={`/boards/${card.board_id}?card=${card.id}`}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-center gap-1.5 w-full py-2 text-sm text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:border-indigo-400/50 rounded-lg transition-colors"
          >
            Open full card in board
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </Link>
        </div>

      </div>
    </>
  );
}
