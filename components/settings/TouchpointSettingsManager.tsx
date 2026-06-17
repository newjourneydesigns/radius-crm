'use client';

import { useEffect, useState } from 'react';
import { supabase, type TouchpointSettingsConfig, type TouchpointTerm } from '../../lib/supabase';

const DEFAULTS: TouchpointSettingsConfig = { target_per_period: 1, terms: [] };

function newTerm(): TouchpointTerm {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `term-${Math.random().toString(36).slice(2)}`;
  return { id, name: '', start: '', end: '' };
}

export default function TouchpointSettingsManager() {
  const [config, setConfig] = useState<TouchpointSettingsConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token ?? null;
        const res = await fetch('/api/touchpoint-settings', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load settings.');
        if (!cancelled && data.config) setConfig({ target_per_period: data.config.target_per_period ?? 1, terms: data.config.terms ?? [] });
      } catch (e) {
        if (!cancelled) setStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'Failed to load settings.' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateTerm = (id: string, patch: Partial<TouchpointTerm>) =>
    setConfig((c) => ({ ...c, terms: c.terms.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));

  const removeTerm = (id: string) => setConfig((c) => ({ ...c, terms: c.terms.filter((t) => t.id !== id) }));

  const addTerm = () => setConfig((c) => ({ ...c, terms: [...c.terms, newTerm()] }));

  const save = async () => {
    // Client-side guard for clearly-invalid ranges (server also normalizes).
    const bad = config.terms.find((t) => t.start && t.end && t.start > t.end);
    if (bad) {
      setStatus({ kind: 'err', msg: `"${bad.name || 'A period'}" ends before it starts.` });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? null;
      const res = await fetch('/api/touchpoint-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save.');
      setConfig({ target_per_period: data.config.target_per_period ?? 1, terms: data.config.terms ?? [] });
      setStatus({ kind: 'ok', msg: 'Saved.' });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />;
  }

  const inputClass =
    'px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-vc-500';

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          One central target for <strong>every campus</strong>: how many touchpoints each ACPD should log with each Circle Leader
          within a period before that leader counts as covered. Define your own periods below — the tracker uses whichever period
          contains today.
        </p>
      </div>

      {/* Target */}
      <div>
        <label htmlFor="tp-target" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Touchpoints required per period
        </label>
        <input
          id="tp-target"
          type="number"
          min={1}
          max={50}
          value={config.target_per_period}
          onChange={(e) => setConfig((c) => ({ ...c, target_per_period: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }))}
          className={`${inputClass} w-28`}
        />
      </div>

      {/* Periods */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Periods</label>
          <button onClick={addTerm} className="btn-secondary px-3 py-1.5 rounded-lg text-xs">
            + Add period
          </button>
        </div>

        {config.terms.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
            No periods yet. Add Spring, Summer, and Fall (or any ranges you like) with start and end dates. Until you add one, the
            tracker falls back to the current calendar semester.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Column labels */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-1 text-xs text-gray-500 dark:text-gray-400">
              <div className="col-span-4">Name</div>
              <div className="col-span-3">Start</div>
              <div className="col-span-3">End</div>
              <div className="col-span-2" />
            </div>
            {config.terms.map((t) => (
              <div key={t.id} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  placeholder="e.g. Spring 2026"
                  value={t.name}
                  onChange={(e) => updateTerm(t.id, { name: e.target.value })}
                  className={`${inputClass} col-span-12 sm:col-span-4 w-full`}
                />
                <input
                  type="date"
                  value={t.start}
                  onChange={(e) => updateTerm(t.id, { start: e.target.value })}
                  className={`${inputClass} col-span-5 sm:col-span-3 w-full`}
                />
                <input
                  type="date"
                  value={t.end}
                  onChange={(e) => updateTerm(t.id, { end: e.target.value })}
                  className={`${inputClass} col-span-5 sm:col-span-3 w-full`}
                />
                <button
                  onClick={() => removeTerm(t.id)}
                  className="col-span-2 inline-flex items-center justify-center text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  aria-label="Remove period"
                  title="Remove period"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-7 0v12a1 1 0 001 1h6a1 1 0 001-1V7" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary px-4 py-2 rounded-lg text-sm">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {status && (
          <span className={`text-sm ${status.kind === 'ok' ? 'text-vc-600 dark:text-vc-400' : 'text-red-600 dark:text-red-400'}`}>
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}
