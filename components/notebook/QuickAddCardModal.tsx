'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { ProjectBoard, BoardColumn } from '../../lib/supabase';

interface QuickAddCardModalProps {
  pageId: string;
  pageTitle?: string;
  onCreated: (cardId: string) => void;
  onClose: () => void;
}

function buildNotebookDescription(pageId: string, pageTitle?: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const noteUrl = `${origin}/notebook/${pageId}`;
  const title = pageTitle?.trim() || 'Untitled note';

  return `Created from notebook note: ${title}\n${noteUrl}`;
}

export default function QuickAddCardModal({ pageId, pageTitle, onCreated, onClose }: QuickAddCardModalProps) {
  const [title, setTitle] = useState(pageTitle?.trim() || '');
  const [boards, setBoards] = useState<ProjectBoard[]>([]);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [boardId, setBoardId] = useState('');
  const [columnId, setColumnId] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  const STORAGE_BOARD_KEY = 'notebook_quick_add_board_id';
  const STORAGE_COLUMN_KEY = 'notebook_quick_add_column_id';

  useEffect(() => {
    titleRef.current?.focus();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('project_boards')
        .select('id, title, description, user_id, created_at, updated_at, is_archived, is_public, notes')
        .eq('is_archived', false)
        .order('title');
      const boardList = (data as ProjectBoard[]) || [];
      setBoards(boardList);
      if (boardList.length > 0) {
        const savedBoardId = localStorage.getItem(STORAGE_BOARD_KEY);
        const match = savedBoardId && boardList.find(b => b.id === savedBoardId);
        setBoardId(match ? savedBoardId! : boardList[0].id);
      }
    })();
  }, []);

  // Fetch columns when board changes
  useEffect(() => {
    if (!boardId) { setColumns([]); setColumnId(''); return; }
    (async () => {
      const { data } = await supabase
        .from('board_columns')
        .select('id, board_id, title, position, color, automations, created_at')
        .eq('board_id', boardId)
        .order('position');
      const cols = (data as BoardColumn[]) || [];
      setColumns(cols);
      const savedColumnId = localStorage.getItem(STORAGE_COLUMN_KEY);
      const matchCol = savedColumnId && cols.find(c => c.id === savedColumnId);
      setColumnId(matchCol ? savedColumnId! : (cols[0]?.id ?? ''));
    })();
  }, [boardId]);

  async function handleCreate() {
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!boardId || !columnId) { setError('Select a board and column.'); return; }

    setSaving(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create the card
      const { data: newCard, error: cardErr } = await supabase
        .from('board_cards')
        .insert({
          title: title.trim(),
          description: buildNotebookDescription(pageId, pageTitle),
          board_id: boardId,
          column_id: columnId,
          priority,
          due_date: dueDate || null,
          created_by: user.id,
          position: 0,
        })
        .select()
        .single();
      if (cardErr) throw cardErr;

      // Link it to the notebook page
      const { error: linkErr } = await supabase
        .from('notebook_page_cards')
        .insert({ page_id: pageId, card_id: newCard.id, linked_by: user.id });
      if (linkErr) throw linkErr;

      onCreated(newCard.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create card.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/4 z-50 max-w-sm mx-auto bg-[#1e2130] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
          <h3 className="text-sm font-semibold text-white">New Card</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          {/* Title */}
          <div>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Card title…"
              className="w-full bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-400/60 transition-colors"
            />
          </div>

          {/* Board */}
          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wide mb-1 block">Board</label>
            <select
              value={boardId}
              onChange={e => {
                setBoardId(e.target.value);
                localStorage.setItem(STORAGE_BOARD_KEY, e.target.value);
                localStorage.removeItem(STORAGE_COLUMN_KEY);
              }}
              className="w-full bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400/60 transition-colors"
            >
              {boards.map(b => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          </div>

          {/* Column */}
          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wide mb-1 block">Column</label>
            <select
              value={columnId}
              onChange={e => {
                setColumnId(e.target.value);
                localStorage.setItem(STORAGE_COLUMN_KEY, e.target.value);
              }}
              disabled={columns.length === 0}
              className="w-full bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400/60 transition-colors disabled:opacity-50"
            >
              {columns.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>

          {/* Priority + Due date (inline row) */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[11px] text-gray-500 uppercase tracking-wide mb-1 block">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as typeof priority)}
                className="w-full bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400/60 transition-colors"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[11px] text-gray-500 uppercase tracking-wide mb-1 block">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400/60 transition-colors"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !title.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            )}
            Create & Link
          </button>
        </div>
      </div>
    </>
  );
}
