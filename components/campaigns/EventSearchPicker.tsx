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
// admins from hunting event IDs out of CCB URLs one at a time. Debounced;
// the first search warms a server-side cache of the full event list, so it can
// take a few seconds, after which searches are instant.
export default function EventSearchPicker({ selectedIds, onAdd }: {
  selectedIds: string[];
  onAdd: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EventResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(q: string) {
    setQuery(q);
    setError(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) { setResults([]); setSearching(false); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const headers = await authHeader();
        const res = await fetch(`/api/campaigns/event-search?q=${encodeURIComponent(q.trim())}`, { headers });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Event search failed');
        setResults(json.events ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Event search failed');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }

  const trimmedSelected = selectedIds.map(s => s.trim());

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
        <p className="text-xs text-slate-500">Searching CCB events… first search can take a few seconds.</p>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
      )}
      {!searching && query.trim().length >= 2 && results.length === 0 && !error && (
        <p className="text-xs text-slate-500">No events match “{query.trim()}”.</p>
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
    </div>
  );
}
