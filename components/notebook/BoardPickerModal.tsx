'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { ProjectBoard } from '../../lib/supabase';

interface BoardPickerModalProps {
  excludeIds?: string[];
  onSelect: (board: ProjectBoard) => void;
  onClose: () => void;
}

export default function BoardPickerModal({ excludeIds = [], onSelect, onClose }: BoardPickerModalProps) {
  const [query, setQuery] = useState('');
  const [boards, setBoards] = useState<ProjectBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('project_boards')
        .select('id, title, description, user_id, created_at, updated_at, is_archived')
        .eq('is_archived', false)
        .order('title');
      setBoards((data as ProjectBoard[] || []).filter(b => !excludeIds.includes(b.id)));
      setLoading(false);
    })();
  }, []);

  const filtered = query.trim()
    ? boards.filter(b => b.title.toLowerCase().includes(query.toLowerCase()))
    : boards;

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
              placeholder="Search boards…"
              className="w-full bg-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
            />
          </div>
        </div>

        <div className="max-h-56 overflow-y-auto">
          {loading && <p className="text-xs text-gray-500 px-4 py-3">Loading boards…</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-xs text-gray-600 px-4 py-3">No boards found</p>
          )}
          {filtered.map(board => (
            <button
              key={board.id}
              onClick={() => onSelect(board)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.06] transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-md bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-indigo-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <rect x="3" y="3" width="7" height="9" rx="1.5" strokeLinecap="round" />
                  <rect x="14" y="3" width="7" height="5" rx="1.5" strokeLinecap="round" />
                  <rect x="14" y="12" width="7" height="9" rx="1.5" strokeLinecap="round" />
                  <rect x="3" y="16" width="7" height="5" rx="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-sm text-white truncate">{board.title}</p>
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
