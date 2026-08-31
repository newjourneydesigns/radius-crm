'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type PickedGroup = {
  ccb_group_id: string;
  label: string;
};

type SearchResult = {
  id: string;
  name: string;
  campus: string | null;
  groupType: string | null;
  mainLeader: string | null;
  memberCount: number | null;
  inactive: boolean;
};

type Props = {
  token: string | null;
  /** Seeds the search box — usually the campus the staff member is filling in. */
  initialQuery?: string;
  busy?: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (group: PickedGroup) => void;
};

const inputClass =
  'w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500';

function formatSyncedAt(iso: string | null): string {
  if (!iso) return 'The group list has never been synced from CCB.';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  return `Group list last synced from CCB ${when.toLocaleString()}.`;
}

/**
 * Picks a CCB group for the student group map.
 *
 * Search reads `ccb_group_cache` through /api/ccb/group-search — it never calls
 * CCB, so browsing costs nothing against the shared daily request budget. The
 * raw-ID field is the escape hatch for a group created since the last nightly
 * cache sweep, which search cannot see yet.
 */
export default function CCBGroupPicker({
  token,
  initialQuery = '',
  busy = false,
  submitLabel,
  onCancel,
  onSubmit,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PickedGroup | null>(null);
  const [manualId, setManualId] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const requestId = useRef(0);

  const runSearch = useCallback(
    async (text: string) => {
      if (!token || text.trim().length < 2) {
        setResults([]);
        setTotal(0);
        return;
      }
      const thisRequest = ++requestId.current;
      setSearching(true);
      setSearchError(null);
      try {
        const res = await fetch('/api/ccb/group-search/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ query: text.trim() }),
        });
        const data = await res.json();
        if (thisRequest !== requestId.current) return; // A newer keystroke won.
        if (!res.ok) throw new Error(data.error || 'Search failed.');
        setResults(data.data || []);
        setTotal(data.total || 0);
        setSyncedAt(data.syncedAt || null);
      } catch (err: unknown) {
        if (thisRequest !== requestId.current) return;
        setSearchError(err instanceof Error ? err.message : 'Search failed.');
        setResults([]);
      } finally {
        if (thisRequest === requestId.current) setSearching(false);
      }
    },
    [token]
  );

  // Debounced so a typed campus name is one search, not eight.
  useEffect(() => {
    const handle = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(handle);
  }, [query, runSearch]);

  const manualReady = useMemo(() => /^\d+$/.test(manualId.trim()), [manualId]);

  function submitSelected() {
    if (selected) onSubmit(selected);
  }

  function submitManual() {
    if (!manualReady) return;
    onSubmit({ ccb_group_id: manualId.trim(), label: manualLabel.trim() });
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
          Search CCB groups
        </label>
        <input
          className={inputClass}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="e.g. Denton students"
          autoFocus
        />
        <p className="text-xs text-slate-500 mt-1">
          Searches the nightly copy of CCB&apos;s group list, so it costs no CCB requests.{' '}
          {formatSyncedAt(syncedAt)}
        </p>
      </div>

      {searchError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3">
          {searchError}
        </div>
      )}

      {query.trim().length >= 2 && (
        <div className="max-h-64 overflow-auto rounded-lg border border-zinc-700 divide-y divide-zinc-700">
          {searching ? (
            <div className="p-3 bg-zinc-900/40 text-sm text-slate-400">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-3 bg-zinc-900/40 text-sm text-slate-400">
              No groups match that. Try fewer words, or paste the group ID below.
            </div>
          ) : (
            results.map((group) => {
              const isSelected = selected?.ccb_group_id === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setSelected({ ccb_group_id: group.id, label: group.name })}
                  className={`w-full text-left p-3 transition-colors ${
                    isSelected ? 'bg-vc-500/15' : 'bg-zinc-900/40 hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100">{group.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {[
                          group.campus,
                          group.groupType,
                          group.mainLeader,
                          group.memberCount != null ? `${group.memberCount} members` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'No campus on file'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-mono text-slate-500">#{group.id}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {total > results.length && (
        <p className="text-xs text-slate-500">
          Showing the {results.length} closest of {total} matches. Add a word to narrow it.
        </p>
      )}

      {selected && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-300">
            Selected <span className="font-medium text-white">{selected.label}</span>{' '}
            <span className="font-mono text-slate-500">#{selected.ccb_group_id}</span>
          </span>
          <button
            type="button"
            onClick={submitSelected}
            disabled={busy}
            className="bg-btn-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {busy ? 'Saving…' : submitLabel}
          </button>
        </div>
      )}

      <details className="group">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">
          Or paste a CCB group ID
        </summary>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Group ID</label>
            <input
              className={inputClass}
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 1842"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Label (optional)</label>
            <input
              className={inputClass}
              value={manualLabel}
              onChange={(e) => setManualLabel(e.target.value)}
              placeholder="e.g. Denton 7th Grade Guys"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          The number at the end of the group&apos;s CCB URL. Use this for a group created since last
          night, which search cannot see yet.
        </p>
        <button
          type="button"
          onClick={submitManual}
          disabled={!manualReady || busy}
          className="mt-3 bg-btn-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
      </details>

      <button
        type="button"
        onClick={onCancel}
        className="text-slate-400 hover:text-white hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-sm transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
