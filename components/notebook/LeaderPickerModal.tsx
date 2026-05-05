'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { CircleLeader } from '../../lib/supabase';

interface LeaderPickerModalProps {
  excludeIds?: number[];
  onSelect: (leader: CircleLeader) => void;
  onClose: () => void;
}

export default function LeaderPickerModal({ excludeIds = [], onSelect, onClose }: LeaderPickerModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CircleLeader[]>([]);
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
        .from('circle_leaders')
        .select('id, name, campus, status')
        .ilike('name', `%${query}%`)
        .order('name')
        .limit(20);
      setResults((data || []).filter(l => !excludeIds.includes(l.id)));
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
              placeholder="Search leaders by name…"
              className="w-full bg-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
            />
          </div>
        </div>

        <div className="max-h-56 overflow-y-auto">
          {loading && <p className="text-xs text-gray-500 px-4 py-3">Searching…</p>}
          {!loading && query && results.length === 0 && (
            <p className="text-xs text-gray-600 px-4 py-3">No leaders found for "{query}"</p>
          )}
          {!loading && !query && (
            <p className="text-xs text-gray-600 px-4 py-3">Type a name to search</p>
          )}
          {results.map(leader => (
            <button
              key={leader.id}
              onClick={() => onSelect(leader)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.06] transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-xs font-semibold text-indigo-300 flex-shrink-0">
                {leader.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{leader.name}</p>
                {leader.campus && <p className="text-xs text-gray-500">{leader.campus}</p>}
              </div>
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
