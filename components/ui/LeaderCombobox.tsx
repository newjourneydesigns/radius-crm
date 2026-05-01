'use client';

import { useState, useMemo } from 'react';
import Fuse from 'fuse.js';

interface Leader { id: number; name: string; }

interface LeaderComboboxProps {
  leaders: Leader[];
  value: string; // selected leader id as string, '' = none
  onChange: (leaderId: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  optional?: boolean; // if true, renders a "No leader" clear option
}

export default function LeaderCombobox({
  leaders,
  value,
  onChange,
  disabled = false,
  isLoading = false,
  placeholder = 'Search leaders...',
  optional = false,
}: LeaderComboboxProps) {
  const [query, setQuery] = useState('');

  const fuse = useMemo(
    () => new Fuse(leaders, { keys: ['name'], threshold: 0.4, ignoreLocation: true }),
    [leaders]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return leaders.slice(0, 30);
    return fuse.search(query.trim()).map(r => r.item);
  }, [query, fuse, leaders]);

  const selectedLeader = leaders.find(l => String(l.id) === value);

  const handleSelect = (leader: Leader) => {
    onChange(String(leader.id));
    setQuery('');
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
  };

  const inputClass =
    'w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors';

  if (isLoading) {
    return (
      <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-400 text-sm">
        Loading leaders...
      </div>
    );
  }

  // Selected state — show pill with clear button
  if (selectedLeader) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700">
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
        <span className="flex-1 text-sm text-gray-900 dark:text-white">{selectedLeader.name}</span>
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-0.5 rounded"
            aria-label="Clear selection"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // Unselected state — search input + results list
  return (
    <div>
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      <div className="mt-1 max-h-36 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 divide-y divide-gray-100 dark:divide-gray-600/50">
        {optional && (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="w-full text-left px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-600/50 transition-colors italic"
          >
            No leader link
          </button>
        )}
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
            No leaders found
          </div>
        ) : (
          filtered.map(leader => (
            <button
              key={leader.id}
              type="button"
              onClick={() => handleSelect(leader)}
              disabled={disabled}
              className="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600/60 active:bg-gray-100 dark:active:bg-gray-600 transition-colors"
            >
              {leader.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
