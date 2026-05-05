'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useNotebookContext } from '../../contexts/NotebookContext';
import type { NotebookPage } from '../../lib/supabase';

export default function NotebookSearch() {
  const { searchPages } = useNotebookContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NotebookPage[]>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(value: string) {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!value.trim()) { setResults([]); return; }

    timerRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchPages(value);
      setResults(res);
      setSearching(false);
    }, 300);
  }

  function clear() {
    setQuery('');
    setResults([]);
  }

  return (
    <div className="px-2 mb-2">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="Search pages…"
          className="w-full bg-white/[0.06] border border-white/[0.08] rounded-md pl-8 pr-7 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-400/60 transition-colors"
        />
        {query && (
          <button
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {query && (
        <div className="mt-1 max-h-48 overflow-y-auto">
          {searching && (
            <p className="text-xs text-gray-500 px-1 py-1">Searching…</p>
          )}
          {!searching && results.length === 0 && (
            <p className="text-xs text-gray-600 px-1 py-1">No results for "{query}"</p>
          )}
          {!searching && results.map(page => (
            <Link
              key={page.id}
              href={`/notebook/${page.id}`}
              onClick={clear}
              className="flex flex-col px-2 py-1.5 rounded-md hover:bg-white/[0.06] transition-colors"
            >
              <span className="text-sm text-gray-300 truncate">{page.title || 'Untitled'}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
