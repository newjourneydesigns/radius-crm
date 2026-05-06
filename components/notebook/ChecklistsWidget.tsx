'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNotebookContext } from '../../contexts/NotebookContext';
import type { NotebookChecklist, NotebookChecklistItem } from '../../lib/supabase';

interface ChecklistSuggestion {
  text: string;
  kind: 'next_step' | 'open_item';
  sourceLine: number;
  sourceQuote: string;
}

const NEW_CHECKLIST_TARGET = '__new__';

function uid() {
  return crypto.randomUUID();
}

function suggestionDescription(suggestion: ChecklistSuggestion): string {
  return `${suggestion.kind === 'open_item' ? 'Open item' : 'Next step'} · line ${suggestion.sourceLine}: "${suggestion.sourceQuote}"`;
}

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

export default function ChecklistsWidget() {
  const { activePage, updatePage } = useNotebookContext();
  const [checklists, setChecklists] = useState<NotebookChecklist[]>([]);
  const [openChecklistActionsId, setOpenChecklistActionsId] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [suggestions, setSuggestions] = useState<ChecklistSuggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [targetChecklistId, setTargetChecklistId] = useState(NEW_CHECKLIST_TARGET);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageIdRef = useRef<string | null>(null);
  // Tracks which item id should receive focus after render
  const focusItemId = useRef<string | null>(null);

  useEffect(() => {
    if (!activePage) return;
    if (activePage.id !== pageIdRef.current) {
      pageIdRef.current = activePage.id;
      setChecklists(activePage.checklists || []);
      setOpenChecklistActionsId(null);
      setSuggestionError('');
      setSuggestions([]);
      setSelectedSuggestions(new Set());
      setTargetChecklistId(activePage.checklists?.[0]?.id ?? NEW_CHECKLIST_TARGET);
    }
  }, [activePage]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-checklist-actions-menu]')) {
        setOpenChecklistActionsId(null);
      }
    }

    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, []);

  const persist = useCallback((updated: NotebookChecklist[]) => {
    if (!activePage) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updatePage(activePage.id, { checklists: updated });
    }, 600);
  }, [activePage, updatePage]);

  const mutate = useCallback((updated: NotebookChecklist[]) => {
    setChecklists(updated);
    persist(updated);
  }, [persist]);

  function addChecklist() {
    const newChecklist = { id: uid(), title: 'Checklist', items: [] };
    mutate([...checklists, newChecklist]);
    setTargetChecklistId(newChecklist.id);
  }

  function deleteChecklist(id: string) {
    mutate(checklists.filter(c => c.id !== id));
  }

  function renameChecklist(id: string, title: string) {
    mutate(checklists.map(c => c.id === id ? { ...c, title } : c));
  }

  function addItem(checklistId: string) {
    const newId = uid();
    focusItemId.current = newId;
    mutate(checklists.map(c =>
      c.id === checklistId
        ? { ...c, items: [...c.items, { id: newId, text: '', checked: false }] }
        : c
    ));
  }

  function deleteItem(checklistId: string, itemId: string) {
    mutate(checklists.map(c =>
      c.id === checklistId
        ? { ...c, items: c.items.filter(i => i.id !== itemId) }
        : c
    ));
  }

  function toggleItem(checklistId: string, itemId: string) {
    mutate(checklists.map(c =>
      c.id === checklistId
        ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i) }
        : c
    ));
  }

  function updateItemText(checklistId: string, itemId: string, text: string) {
    mutate(checklists.map(c =>
      c.id === checklistId
        ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, text } : i) }
        : c
    ));
  }

  function markAllComplete(checklistId: string) {
    mutate(checklists.map(c =>
      c.id === checklistId
        ? { ...c, items: c.items.map(i => ({ ...i, checked: true })) }
        : c
    ));
  }

  function clearCompleted(checklistId: string) {
    mutate(checklists.map(c =>
      c.id === checklistId
        ? { ...c, items: c.items.filter(i => !i.checked) }
        : c
    ));
  }

  function duplicateChecklist(checklistId: string) {
    const source = checklists.find(c => c.id === checklistId);
    if (!source) return;
    const copy: NotebookChecklist = {
      id: uid(),
      title: `${source.title || 'Checklist'} (Copy)`,
      items: source.items.map(item => ({
        id: uid(),
        text: item.text,
        description: item.description,
        checked: item.checked,
      })),
    };
    mutate([...checklists, copy]);
    setOpenChecklistActionsId(null);
  }

  async function suggestChecklistItems() {
    if (!activePage || isSuggesting) return;

    const noteText = htmlToPlainText(activePage.content);
    if (!noteText) {
      setSuggestionError('Write a note before asking for checklist suggestions.');
      return;
    }

    setIsSuggesting(true);
    setSuggestionError('');
    setSuggestions([]);
    setSelectedSuggestions(new Set());

    try {
      const response = await fetch('/api/notebook/checklist-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: noteText }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSuggestionError(data.error || 'Failed to suggest checklist items.');
        return;
      }

      const nextSuggestions: ChecklistSuggestion[] = Array.isArray(data.suggestions) ? data.suggestions : [];
      setSuggestions(nextSuggestions);
      setSelectedSuggestions(new Set(nextSuggestions.map((_, index) => index)));
      setTargetChecklistId(checklists[0]?.id ?? NEW_CHECKLIST_TARGET);

      if (nextSuggestions.length === 0) {
        setSuggestionError('No clear next steps or outstanding items were found in this note.');
      }
    } catch (err) {
      console.error('Checklist suggestion error:', err);
      setSuggestionError('Network error. Please try again.');
    } finally {
      setIsSuggesting(false);
    }
  }

  function toggleSuggestion(index: number) {
    setSelectedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function addSelectedSuggestions() {
    if (suggestions.length === 0 || selectedSuggestions.size === 0) return;

    const selectedItems = suggestions
      .filter((_, index) => selectedSuggestions.has(index))
      .map(suggestion => ({
        id: uid(),
        text: suggestion.text,
        description: suggestionDescription(suggestion),
        checked: false,
      }));

    if (selectedItems.length === 0) return;

    const existingTexts = new Set(
      checklists.flatMap(checklist => checklist.items.map(item => item.text.trim().toLowerCase())).filter(Boolean)
    );
    const uniqueItems = selectedItems.filter(item => !existingTexts.has(item.text.trim().toLowerCase()));

    if (uniqueItems.length === 0) {
      setSuggestionError('Those items are already in your checklists.');
      return;
    }

    let updated: NotebookChecklist[];
    if (targetChecklistId === NEW_CHECKLIST_TARGET || checklists.length === 0) {
      updated = [
        ...checklists,
        { id: uid(), title: 'Suggested Items', items: uniqueItems },
      ];
    } else {
      updated = checklists.map(checklist =>
        checklist.id === targetChecklistId
          ? { ...checklist, items: [...checklist.items, ...uniqueItems] }
          : checklist
      );
    }

    mutate(updated);
    setSuggestions([]);
    setSelectedSuggestions(new Set());
    setSuggestionError('');
  }

  if (!activePage) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Checklists</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={suggestChecklistItems}
            disabled={isSuggesting}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 active:bg-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Suggest checklist items from this note"
          >
            {isSuggesting ? (
              <span className="w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            )}
            Suggest
          </button>
          <button
            onClick={addChecklist}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 active:bg-indigo-500/20 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New
          </button>
        </div>
      </div>

      {suggestionError && (
        <div className="mb-3 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
          {suggestionError}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mb-3 rounded-lg border border-violet-400/20 bg-violet-500/10 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-300">Suggested Items</p>
            <button
              onClick={() => {
                setSuggestions([]);
                setSelectedSuggestions(new Set());
              }}
              className="text-violet-400 hover:text-violet-200"
              title="Dismiss suggestions"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-1.5">
            {suggestions.map((suggestion, index) => (
              <label key={`${suggestion.sourceLine}-${index}`} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-white/[0.05]">
                <input
                  type="checkbox"
                  checked={selectedSuggestions.has(index)}
                  onChange={() => toggleSuggestion(index)}
                  className="mt-1 h-3 w-3 rounded border-white/20 bg-transparent accent-violet-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] leading-4 text-gray-200">{suggestion.text}</span>
                  <span className="block text-[9px] leading-3 text-gray-500">
                    {suggestion.kind === 'open_item' ? 'Open item' : 'Next step'} · line {suggestion.sourceLine}: “{suggestion.sourceQuote}”
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <select
              value={targetChecklistId}
              onChange={event => setTargetChecklistId(event.target.value)}
              className="w-full rounded-md border border-white/[0.08] bg-[#111522] px-2 py-1.5 text-[11px] text-gray-300 outline-none focus:border-violet-400/50"
            >
              <option value={NEW_CHECKLIST_TARGET}>New checklist: Suggested Items</option>
              {checklists.map(checklist => (
                <option key={checklist.id} value={checklist.id}>{checklist.title || 'Untitled checklist'}</option>
              ))}
            </select>

            <button
              onClick={addSelectedSuggestions}
              disabled={selectedSuggestions.size === 0}
              className="inline-flex items-center justify-center rounded-md bg-violet-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add selected
            </button>
          </div>
        </div>
      )}

      {checklists.length === 0 ? (
        <p className="text-xs text-gray-600 italic">None yet</p>
      ) : (
        <div className="space-y-3">
          {checklists.map(checklist => {
            const done = checklist.items.filter(i => i.checked).length;
            const total = checklist.items.length;
            const pct = total > 0 ? (done / total) * 100 : 0;
            const allDone = total > 0 && done === total;
            const hasCompleted = done > 0;
            const hasIncomplete = total > done;

            return (
              <div key={checklist.id} className="rounded-lg border border-white/[0.08] bg-[#131722]/80 p-3 shadow-sm shadow-black/10">
                {/* Title row */}
                <div className="flex items-center gap-1.5 mb-2">
                  <input
                    type="text"
                    value={checklist.title}
                    onChange={e => renameChecklist(checklist.id, e.target.value)}
                    className="flex-1 text-[10px] font-semibold text-gray-200 bg-transparent border-none outline-none min-w-0 placeholder-gray-600 pl-1"
                    placeholder="Checklist title"
                  />
                  {total > 0 && (
                    <span className={`text-[9px] shrink-0 font-medium tabular-nums ${allDone ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {done}/{total}
                    </span>
                  )}

                  {total > 0 && (
                    <div className="relative shrink-0" data-checklist-actions-menu>
                      <button
                        onClick={() => setOpenChecklistActionsId(prev => prev === checklist.id ? null : checklist.id)}
                        className="text-gray-600 hover:text-gray-300 transition-colors p-0.5"
                        aria-label="Checklist actions"
                        title="Checklist actions"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zm0 6a.75.75 0 110-1.5.75.75 0 010 1.5zm0 6a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                        </svg>
                      </button>

                      {openChecklistActionsId === checklist.id && (
                        <div className="absolute right-0 top-5 z-20 min-w-[140px] rounded-md border border-white/[0.08] bg-[#171b27] p-1 shadow-xl">
                          <button
                            onClick={() => {
                              markAllComplete(checklist.id);
                              setOpenChecklistActionsId(null);
                            }}
                            disabled={!hasIncomplete}
                            className="w-full rounded px-2 py-1.5 text-left text-[10px] text-gray-300 hover:bg-white/[0.06] disabled:opacity-40 disabled:hover:bg-transparent"
                          >
                            Mark all complete
                          </button>
                          <button
                            onClick={() => {
                              clearCompleted(checklist.id);
                              setOpenChecklistActionsId(null);
                            }}
                            disabled={!hasCompleted}
                            className="w-full rounded px-2 py-1.5 text-left text-[10px] text-gray-300 hover:bg-white/[0.06] disabled:opacity-40 disabled:hover:bg-transparent"
                          >
                            Clear completed
                          </button>
                          <button
                            onClick={() => duplicateChecklist(checklist.id)}
                            className="w-full rounded px-2 py-1.5 text-left text-[10px] text-gray-300 hover:bg-white/[0.06]"
                          >
                            Duplicate checklist
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => deleteChecklist(checklist.id)}
                    className="shrink-0 text-gray-600 hover:text-red-400 transition-colors p-0.5"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Progress bar */}
                {total > 0 && (
                  <div className="h-0.5 rounded-full bg-white/[0.08] mb-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, background: allDone ? '#10b981' : '#6366f1' }}
                    />
                  </div>
                )}

                {/* Items */}
                <div className="space-y-1.5">
                  {checklist.items.map(item => (
                    <ChecklistItemRow
                      key={item.id}
                      item={item}
                      autoFocus={focusItemId.current === item.id}
                      onFocused={() => { focusItemId.current = null; }}
                      onToggle={() => toggleItem(checklist.id, item.id)}
                      onTextChange={text => updateItemText(checklist.id, item.id, text)}
                      onDelete={() => deleteItem(checklist.id, item.id)}
                      onEnter={() => addItem(checklist.id)}
                    />
                  ))}
                </div>

                <button
                  onClick={() => addItem(checklist.id)}
                  className="mt-2.5 flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-indigo-400 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add item
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChecklistItemRow({
  item,
  autoFocus,
  onFocused,
  onToggle,
  onTextChange,
  onDelete,
  onEnter,
}: {
  item: NotebookChecklistItem;
  autoFocus: boolean;
  onFocused: () => void;
  onToggle: () => void;
  onTextChange: (text: string) => void;
  onDelete: () => void;
  onEnter: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resizeTextarea(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }

  // Focus this input when it first mounts with autoFocus=true
  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
      onFocused();
    }
    resizeTextarea(textareaRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [item.text]);

  return (
    <div
      className={`group flex items-start gap-2.5 rounded-md border px-2 py-1.5 transition-colors focus-within:border-indigo-400/50 focus-within:bg-white/[0.055] ${
        item.checked
          ? 'border-emerald-400/10 bg-emerald-400/[0.035]'
          : 'border-white/[0.055] bg-white/[0.025] hover:border-white/[0.1] hover:bg-white/[0.045]'
      }`}
    >
      <button
        onClick={onToggle}
        className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
        aria-label={item.checked ? 'Mark item incomplete' : 'Mark item complete'}
        style={item.checked
          ? { background: '#10b981', borderColor: '#10b981' }
          : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.18)' }
        }
      >
        {item.checked && (
          <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1.5,5 4,7.5 8.5,2.5" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <textarea
          ref={textareaRef}
          value={item.text}
          rows={1}
          onChange={e => {
            onTextChange(e.target.value);
            resizeTextarea(e.currentTarget);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnter(); }
            if (e.key === 'Backspace' && item.text === '') { e.preventDefault(); onDelete(); }
          }}
          className={`w-full resize-none overflow-hidden border-none bg-transparent py-0.5 text-[12px] leading-5 outline-none [overflow-wrap:anywhere] placeholder:text-gray-600 ${
            item.checked ? 'text-gray-500 line-through decoration-emerald-400/60 decoration-2' : 'text-gray-200'
          }`}
          placeholder="Item..."
        />

        {item.description && (
          <p className={`text-[10px] leading-4 ${item.checked ? 'text-gray-600' : 'text-gray-500'}`}>
            {item.description}
          </p>
        )}
      </div>

      <button
        onClick={onDelete}
        className="mt-0.5 shrink-0 rounded p-1 text-gray-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-400/30"
        aria-label="Delete checklist item"
        tabIndex={-1}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
