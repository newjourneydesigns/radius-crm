'use client';

import { useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { Pencil, Search, UserRound, X } from 'lucide-react';

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
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fuse = useMemo(
    () => new Fuse(leaders, { keys: ['name'], threshold: 0.4, ignoreLocation: true }),
    [leaders]
  );

  const filtered = useMemo(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];
    return fuse.search(trimmedQuery).map(r => r.item).slice(0, 30);
  }, [query, fuse]);

  const selectedLeader = leaders.find(l => String(l.id) === value);

  const handleSelect = (leader: Leader) => {
    onChange(String(leader.id));
    setQuery('');
    setIsSearching(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
    setIsSearching(false);
  };

  const handleStartSearch = () => {
    setIsSearching(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // On touch, tapping an option blurs the search input, which dismisses the
  // keyboard, reflows the page, and slides the option out from under the finger
  // before `click` fires — so the first tap did nothing and you had to close the
  // keyboard first. Committing the choice on pointer-up (before that reflow)
  // fixes it. The movement threshold keeps a list-scroll drag from being read as
  // a tap. `onClick` stays for mouse and keyboard (Enter/Space) activation.
  const tapStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const beginTap = (e: React.PointerEvent) => {
    tapStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const endTap = (action: () => void) => (e: React.PointerEvent) => {
    const start = tapStart.current;
    tapStart.current = null;
    if (!start || start.id !== e.pointerId) return;
    if (Math.abs(e.clientX - start.x) > 10 || Math.abs(e.clientY - start.y) > 10) return;
    e.preventDefault();
    action();
  };

  const inputClass =
    'w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-vc-500 transition-colors';

  if (isLoading) {
    return (
      <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-400 text-sm">
        Loading leaders...
      </div>
    );
  }

  // Selected state - keep the current selection visible and editable.
  if (selectedLeader && !isSearching) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700">
        <UserRound className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
        <span className="flex-1 text-sm text-gray-900 dark:text-white">{selectedLeader.name}</span>
        {!disabled && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleStartSearch}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 rounded transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              Change
            </button>
            {optional && (
              <button
                type="button"
                onClick={handleClear}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-0.5 rounded"
                aria-label="Clear leader selection"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Unselected/searching state - only show matching leaders after the user types.
  return (
    <div>
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setIsSearching(true);
          }}
          onFocus={() => setIsSearching(true)}
          placeholder={selectedLeader ? 'Search to change leader...' : placeholder}
          className={inputClass}
          disabled={disabled}
          autoComplete="off"
        />
        {selectedLeader && !disabled && (
          <button
            type="button"
            onClick={() => setIsSearching(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-0.5 rounded"
            aria-label="Cancel leader change"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {isSearching && query.trim() && (
        <div className="mt-1 max-h-36 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 divide-y divide-gray-100 dark:divide-gray-600/50">
          {optional && value && (
            <button
              type="button"
              onPointerDown={beginTap}
              onPointerUp={endTap(handleClear)}
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
                onPointerDown={beginTap}
                onPointerUp={endTap(() => handleSelect(leader))}
                onClick={() => handleSelect(leader)}
                disabled={disabled}
                className="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600/60 active:bg-gray-100 dark:active:bg-gray-600 transition-colors"
              >
                {leader.name}
              </button>
            ))
          )}
        </div>
      )}

      {selectedLeader && isSearching && (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>Current: {selectedLeader.name}</span>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
