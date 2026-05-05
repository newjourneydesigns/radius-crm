'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

interface CardResult {
  id: string;
  title: string;
  priority: string;
  is_complete: boolean;
  due_date?: string;
  board_id: string;
  project_board: { id: string; title: string } | null;
  board_column: { id: string; title: string } | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#f59e0b',
  low:    '#6b7280',
};

interface CardPickerModalProps {
  excludeIds?: string[];
  onSelect: (card: CardResult) => void;
  onClose: () => void;
}

export default function CardPickerModal({ excludeIds = [], onSelect, onClose }: CardPickerModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CardResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); return; }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from('board_cards')
        .select(`
          id, title, priority, is_complete, due_date, board_id,
          project_board:project_boards(id, title),
          board_column:board_columns(id, title)
        `)
        .ilike('title', `%${query}%`)
        .eq('is_archived', false)
        .order('updated_at', { ascending: false })
        .limit(25);

      setResults(
        ((data as unknown as CardResult[]) || []).filter(c => !excludeIds.includes(c.id))
      );
      setLoading(false);
    }, 250);
  }, [query]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/4 z-50 max-w-sm mx-auto bg-[#1e2130] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.08]">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search cards by title…"
              className="w-full bg-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
            />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {loading && <p className="text-xs text-gray-500 px-4 py-3">Searching…</p>}
          {!loading && query && results.length === 0 && (
            <p className="text-xs text-gray-600 px-4 py-3">No cards found for "{query}"</p>
          )}
          {!loading && !query && (
            <p className="text-xs text-gray-600 px-4 py-3">Type to search across all boards</p>
          )}
          {results.map(card => (
            <button
              key={card.id}
              onClick={() => onSelect(card)}
              className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.06] transition-colors text-left"
            >
              {/* Priority dot */}
              <span
                className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: PRIORITY_COLORS[card.priority] ?? '#6b7280' }}
              />
              <div className="min-w-0 flex-1">
                <p className={`text-sm truncate ${card.is_complete ? 'line-through text-gray-500' : 'text-white'}`}>
                  {card.title}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {card.project_board?.title ?? 'Board'} · {card.board_column?.title ?? 'Column'}
                </p>
              </div>
              {card.is_complete && (
                <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </button>
          ))}
        </div>

        <div className="px-4 py-2.5 border-t border-white/[0.06]">
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
