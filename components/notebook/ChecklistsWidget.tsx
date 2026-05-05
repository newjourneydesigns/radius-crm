'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNotebookContext } from '../../contexts/NotebookContext';
import type { NotebookChecklist, NotebookChecklistItem } from '../../lib/supabase';

function uid() {
  return crypto.randomUUID();
}

export default function ChecklistsWidget() {
  const { activePage, updatePage } = useNotebookContext();
  const [checklists, setChecklists] = useState<NotebookChecklist[]>([]);
  const [openChecklistActionsId, setOpenChecklistActionsId] = useState<string | null>(null);
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
      updatePage(activePage.id, { checklists: updated as any });
    }, 600);
  }, [activePage, updatePage]);

  const mutate = useCallback((updated: NotebookChecklist[]) => {
    setChecklists(updated);
    persist(updated);
  }, [persist]);

  function addChecklist() {
    mutate([...checklists, { id: uid(), title: 'Checklist', items: [] }]);
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
        checked: item.checked,
      })),
    };
    mutate([...checklists, copy]);
    setOpenChecklistActionsId(null);
  }

  if (!activePage) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Checklists</h3>
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
              <div key={checklist.id} className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
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
                <div className="space-y-0.5">
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
    <div className="group flex items-start gap-2 py-1">
      <button
        onClick={onToggle}
        className="flex-shrink-0 w-4 h-4 rounded border transition-colors flex items-center justify-center"
        style={item.checked
          ? { background: '#6366f1', borderColor: '#6366f1' }
          : { background: 'transparent', borderColor: 'rgba(255,255,255,0.2)' }
        }
      >
        {item.checked && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1.5,5 4,7.5 8.5,2.5" />
          </svg>
        )}
      </button>

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
        className={`flex-1 text-[11px] bg-transparent border-none outline-none min-w-0 py-0.5 pl-1 resize-none overflow-hidden [overflow-wrap:anywhere] leading-5 ${
          item.checked ? 'line-through text-gray-600' : 'text-gray-300'
        }`}
        placeholder="Item..."
      />

      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400 p-0.5 shrink-0 mt-0.5"
        tabIndex={-1}
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
