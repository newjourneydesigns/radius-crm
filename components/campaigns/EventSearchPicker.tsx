'use client';

import { useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { supabase } from '../../lib/supabase';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type EventResult = { id: string; title: string; startDate: string | null };

// Find CCB events by partial name and add their IDs to a campaign — spares
// admins from hunting event IDs out of CCB URLs one at a time. Debounced.
// Searches recently created/edited events by default (fast); "Search all
// events" widens to the full church history for the rare older event.
export default function EventSearchPicker({ selectedIds, onAdd }: {
  selectedIds: string[];
  onAdd: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EventResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 'recent' = events touched in the last ~6 months; 'all' = everything.
  const [scope, setScope] = useState<'recent' | 'all'>('recent');
  const [searchedScope, setSearchedScope] = useState<'recent' | 'all' | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function runSearch(q: string, useScope: 'recent' | 'all') {
    setSearching(true);
    setError(null);
    try {
      const headers = await authHeader();
      const params = new URLSearchParams({ q });
      if (useScope === 'all') params.set('all', 'true');
      const res = await fetch(`/api/campaigns/event-search?${params}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Event search failed');
      setResults(json.events ?? []);
      setSearchedScope(useScope);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Event search failed');
      setResults([]);
      setSearchedScope(null);
    } finally {
      setSearching(false);
    }
  }

  function handleChange(q: string) {
    setQuery(q);
    setError(null);
    // A new query starts back at the fast recent scope.
    setScope('recent');
    setSearchedScope(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) { setResults([]); setSearching(false); return; }
    timerRef.current = setTimeout(() => runSearch(q.trim(), 'recent'), 400);
  }

  function widenToAll() {
    if (query.trim().length < 2) return;
    setScope('all');
    runSearch(query.trim(), 'all');
  }

  const trimmedSelected = selectedIds.map(s => s.trim());
  const searchedEmpty = !searching && !error && query.trim().length >= 2 && results.length === 0 && searchedScope !== null;

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="text"
          className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-slate-500 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          placeholder="Search events by name… e.g. Fuel the Fire"
          value={query}
          onChange={e => handleChange(e.target.value)}
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
      </div>

      {searching && (
        <p className="text-xs text-slate-500">
          {scope === 'all'
            ? 'Searching the full event history… this one takes longer.'
            : 'Searching recent CCB events… first search may take a few seconds.'}
        </p>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
      )}
      {searchedEmpty && (
        <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
          <span>
            No {searchedScope === 'recent' ? 'recent ' : ''}events match “{query.trim()}”.
          </span>
          {searchedScope === 'recent' && (
            <button
              type="button"
              className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              onClick={widenToAll}
            >
              Search all events (slower)
            </button>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="divide-y divide-zinc-800/70 rounded-lg border border-zinc-700 overflow-hidden max-h-56 overflow-y-auto">
          {results.map(ev => {
            const added = trimmedSelected.includes(ev.id);
            return (
              <div key={ev.id} className="flex items-center gap-3 px-3 py-2 bg-zinc-800/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate" title={ev.title}>{ev.title}</p>
                  <p className="text-xs text-slate-500">
                    {ev.startDate ? DateTime.fromISO(ev.startDate).toFormat('M/d/yyyy') : 'No date'} · ID {ev.id}
                  </p>
                </div>
                <button
                  type="button"
                  className={`flex-shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    added
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30 cursor-default'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-zinc-600'
                  }`}
                  disabled={added}
                  onClick={() => onAdd(ev.id)}
                >
                  {added ? 'Added' : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {results.length > 0 && searchedScope === 'recent' && (
        <p className="text-xs text-slate-600">
          Showing events from the last 6 months.{' '}
          <button type="button" className="text-indigo-400/80 hover:text-indigo-300 transition-colors" onClick={widenToAll}>
            Search all events
          </button>
        </p>
      )}
    </div>
  );
}
