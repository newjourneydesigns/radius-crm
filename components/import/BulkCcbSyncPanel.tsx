'use client';

import { useMemo, useRef, useState } from 'react';

/**
 * Mass Update → "Sync from CCB": refresh many circles from CCB at once.
 *
 * Runs in two explicit steps so nothing is written blind:
 *   1. Check — pulls each selected circle fresh from CCB in small paced
 *      batches and shows exactly which fields would change (from → to).
 *   2. Apply — writes the changes the admin kept ticked.
 *
 * Leader names are excluded by default: circles led by couples keep a combined
 * RADIUS name that CCB's single main leader would overwrite.
 */

interface PanelLeader {
  id: number;
  name: string;
  ccb_group_id: string | null;
}

interface SyncChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

interface PreviewOutcome {
  id: number;
  name: string;
  ok: boolean;
  error?: string;
  noGroupId?: boolean;
  notFound?: boolean;
  ccbInactive?: boolean;
  changes: SyncChange[];
  values: Record<string, any>;
}

interface ApplySummary {
  updated: number;
  failed: { id: number; name: string; error?: string }[];
}

// Each previewed circle costs several CCB calls, so batches stay small and the
// client pauses between them — same posture as the CCB status mass update.
const PREVIEW_BATCH_SIZE = 4;
const PREVIEW_BATCH_PAUSE_MS = 900;
const APPLY_BATCH_SIZE = 25;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function BulkCcbSyncPanel({
  selectedLeaders,
  accessToken,
  onApplied,
}: {
  selectedLeaders: PanelLeader[];
  accessToken: string | null;
  onApplied: () => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'checking' | 'checked' | 'applying' | 'applied'>('idle');
  const [results, setResults] = useState<PreviewOutcome[]>([]);
  const [checkedCount, setCheckedCount] = useState(0);
  const [checkTotal, setCheckTotal] = useState(0);
  const [includeNames, setIncludeNames] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());
  const [stopNote, setStopNote] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [applySummary, setApplySummary] = useState<ApplySummary | null>(null);
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number } | null>(null);
  const stopRequestedRef = useRef(false);

  const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  });

  // Changes that will actually be written, honoring the leader-name toggle.
  const effectiveChanges = (r: PreviewOutcome): SyncChange[] =>
    includeNames ? r.changes : r.changes.filter((c) => c.field !== 'name');

  const applicable = useMemo(
    () => results.filter((r) => r.ok && effectiveChanges(r).length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, includeNames]
  );
  const applyCount = applicable.filter((r) => !excludedIds.has(r.id)).length;
  const upToDate = results.filter((r) => r.ok && effectiveChanges(r).length === 0);
  const flagged = results.filter((r) => r.notFound || r.noGroupId || r.ccbInactive);
  const failures = results.filter((r) => !r.ok && !r.notFound && !r.noGroupId);

  const runCheck = async () => {
    const leaders = [...selectedLeaders];
    const withGroup = leaders.filter((l) => l.ccb_group_id);
    const withoutGroup = leaders.filter((l) => !l.ccb_group_id);

    stopRequestedRef.current = false;
    setPhase('checking');
    setApplySummary(null);
    setStopNote(null);
    setRunError(null);
    setExcludedIds(new Set());
    setCheckTotal(withGroup.length);
    setCheckedCount(0);

    // Circles with no CCB Group ID can be reported without asking the server.
    const collected: PreviewOutcome[] = withoutGroup.map((l) => ({
      id: l.id,
      name: l.name,
      ok: false,
      noGroupId: true,
      changes: [],
      values: {},
    }));
    setResults([...collected]);

    for (let i = 0; i < withGroup.length; i += PREVIEW_BATCH_SIZE) {
      if (stopRequestedRef.current) {
        setStopNote(`Stopped after checking ${i} of ${withGroup.length} circles. The results below are still ready to apply.`);
        break;
      }

      const chunk = withGroup.slice(i, i + PREVIEW_BATCH_SIZE);
      try {
        const res = await fetch('/api/ccb/bulk-resync', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ mode: 'preview', leaderIds: chunk.map((l) => l.id) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `Check failed (HTTP ${res.status})`);

        collected.push(...(json.results || []));
        setResults([...collected]);
        setCheckedCount(Math.min(i + chunk.length, withGroup.length));

        if (json.budgetStopped) {
          setStopNote(`Stopped early — today's CCB call budget ran out. ${collected.length - withoutGroup.length} of ${withGroup.length} circles were checked; apply those, then re-run for the rest after the budget resets.`);
          break;
        }
        if (json.rateLimitedRetryAfter) {
          setStopNote(`Stopped early — CCB rate limit. Try the remaining circles again in about ${Math.ceil(json.rateLimitedRetryAfter / 60)} minute${json.rateLimitedRetryAfter > 90 ? 's' : ''}.`);
          break;
        }
      } catch (err: any) {
        setRunError(`${err.message}. ${collected.length - withoutGroup.length} of ${withGroup.length} circles were checked before it stopped — their results below are still ready to apply.`);
        break;
      }

      if (i + PREVIEW_BATCH_SIZE < withGroup.length) {
        await sleep(PREVIEW_BATCH_PAUSE_MS);
      }
    }

    setPhase('checked');
  };

  const runApply = async () => {
    const toApply = applicable
      .filter((r) => !excludedIds.has(r.id))
      .map((r) => {
        const fields = effectiveChanges(r).map((c) => c.field);
        const values: Record<string, any> = {};
        for (const f of fields) {
          if (f in r.values) values[f] = r.values[f];
        }
        return { id: r.id, name: r.name, values };
      })
      .filter((a) => Object.keys(a.values).length > 0);

    if (toApply.length === 0) return;

    setPhase('applying');
    setApplyProgress({ done: 0, total: toApply.length });
    const summary: ApplySummary = { updated: 0, failed: [] };

    for (let i = 0; i < toApply.length; i += APPLY_BATCH_SIZE) {
      const chunk = toApply.slice(i, i + APPLY_BATCH_SIZE);
      try {
        const res = await fetch('/api/ccb/bulk-resync', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            mode: 'apply',
            applies: chunk.map(({ id, values }) => ({ id, values })),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `Apply failed (HTTP ${res.status})`);

        const byId = new Map(chunk.map((c) => [c.id, c]));
        for (const r of json.results || []) {
          if (r.ok) summary.updated += r.applied > 0 ? 1 : 0;
          else summary.failed.push({ id: r.id, name: byId.get(r.id)?.name || `#${r.id}`, error: r.error });
        }
      } catch (err: any) {
        for (const c of chunk) summary.failed.push({ id: c.id, name: c.name, error: err.message });
      }
      setApplyProgress({ done: Math.min(i + chunk.length, toApply.length), total: toApply.length });
    }

    setApplySummary(summary);
    setApplyProgress(null);
    setPhase('applied');
    onApplied();
  };

  const reset = () => {
    setPhase('idle');
    setResults([]);
    setApplySummary(null);
    setStopNote(null);
    setRunError(null);
    setExcludedIds(new Set());
  };

  const toggleExcluded = (id: number) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Rows with pending changes first, then flagged, then failures, then clean.
  const displayResults = useMemo(() => {
    const changed = results.filter((r) => r.ok && effectiveChanges(r).length > 0);
    const flaggedOnly = results.filter((r) => !r.ok && (r.notFound || r.noGroupId));
    const errored = results.filter((r) => !r.ok && !r.notFound && !r.noGroupId);
    const clean = results.filter((r) => r.ok && effectiveChanges(r).length === 0);
    return [...changed, ...flaggedOnly, ...errored, ...clean];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, includeNames]);

  const busy = phase === 'checking' || phase === 'applying';

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
      <div className="p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Sync from CCB</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Pull each selected circle&rsquo;s current data from CCB — meeting day, time, frequency,
          location, leader contact info, and linked events — and review exactly what would change
          before anything is written. CCB is read, never written.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={runCheck}
            disabled={busy || selectedLeaders.length === 0}
            className="btn-primary px-5 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {phase === 'checking'
              ? `Checking ${Math.min(checkedCount + PREVIEW_BATCH_SIZE, checkTotal)} of ${checkTotal}…`
              : `Check ${selectedLeaders.length} circle${selectedLeaders.length !== 1 ? 's' : ''} against CCB`}
          </button>

          {phase === 'checking' && (
            <button
              onClick={() => { stopRequestedRef.current = true; }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Stop
            </button>
          )}

          {results.length > 0 && !busy && (
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Start over
            </button>
          )}

          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeNames}
              onChange={(e) => setIncludeNames(e.target.checked)}
              disabled={busy}
              className="rounded border-gray-300 text-blue-600 focus:ring-vc-500"
            />
            Also sync leader names
          </label>
          <span className="text-xs text-gray-400 dark:text-gray-500 -ml-2">
            Off keeps RADIUS names — couple-led circles keep their combined name.
          </span>
        </div>

        {phase === 'checking' && checkTotal > 0 && (
          <div className="mt-4">
            <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${Math.round((checkedCount / checkTotal) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {(stopNote || runError) && (
          <div className={`mt-4 p-3 rounded-md text-sm ${runError ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200'}`}>
            {runError || stopNote}
          </div>
        )}

        {/* Result summary */}
        {results.length > 0 && phase !== 'checking' && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 font-medium">
              {applicable.length} with changes
            </span>
            <span className="px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 font-medium">
              {upToDate.length} up to date
            </span>
            {flagged.length > 0 && (
              <span className="px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 font-medium">
                {flagged.length} flagged
              </span>
            )}
            {failures.length > 0 && (
              <span className="px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 font-medium">
                {failures.length} failed
              </span>
            )}
          </div>
        )}

        {/* Per-circle results */}
        {displayResults.length > 0 && phase !== 'idle' && (
          <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 max-h-[28rem] overflow-y-auto">
            {displayResults.map((r) => {
              const rowChanges = r.ok ? effectiveChanges(r) : [];
              const nameOnly = r.ok && rowChanges.length === 0 && r.changes.length > 0;
              return (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.ok && rowChanges.length > 0 && (
                      <input
                        type="checkbox"
                        checked={!excludedIds.has(r.id)}
                        onChange={() => toggleExcluded(r.id)}
                        disabled={busy || phase === 'applied'}
                        className="rounded border-gray-300 text-blue-600 focus:ring-vc-500"
                      />
                    )}
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{r.name}</span>
                    {r.ccbInactive && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                        Inactive in CCB
                      </span>
                    )}
                    {r.notFound && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                        Not found in CCB — check the Group ID
                      </span>
                    )}
                    {r.noGroupId && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        No CCB Group ID
                      </span>
                    )}
                    {!r.ok && r.error && (
                      <span className="text-xs text-red-600 dark:text-red-400">{r.error}</span>
                    )}
                    {r.ok && rowChanges.length === 0 && (
                      <span className="text-xs text-green-700 dark:text-green-400">
                        {nameOnly ? 'Up to date (name change excluded)' : 'Up to date'}
                      </span>
                    )}
                  </div>

                  {r.ok && rowChanges.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {rowChanges.map((c) => (
                        <div key={c.field} className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="w-28 shrink-0 text-gray-400 dark:text-gray-500">{c.label}</span>
                          <span className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 line-through break-all">{c.from}</span>
                          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                          <span className="px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 break-all">{c.to}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Apply */}
        {(phase === 'checked' || phase === 'applying') && applicable.length > 0 && (
          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={runApply}
              disabled={busy || applyCount === 0}
              className="btn-primary px-5 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {phase === 'applying' && applyProgress
                ? `Applying ${applyProgress.done} of ${applyProgress.total}…`
                : `Apply updates to ${applyCount} circle${applyCount !== 1 ? 's' : ''}`}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Only the fields shown above change. Untick a circle to leave it as it is.
            </span>
          </div>
        )}

        {applySummary && (
          <div className={`mt-4 p-4 rounded-md ${applySummary.failed.length > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
            <p className={`text-sm ${applySummary.failed.length > 0 ? 'text-amber-900 dark:text-amber-200' : 'text-green-800 dark:text-green-300'}`}>
              Updated {applySummary.updated} circle{applySummary.updated !== 1 ? 's' : ''} from CCB.
            </p>
            {applySummary.failed.length > 0 && (
              <div className="mt-2 text-sm text-red-800 dark:text-red-300">
                <p className="font-medium">{applySummary.failed.length} did not update:</p>
                <ul className="mt-1 list-disc list-inside space-y-0.5">
                  {applySummary.failed.map((f) => (
                    <li key={f.id}>{f.name}{f.error ? ` — ${f.error}` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
