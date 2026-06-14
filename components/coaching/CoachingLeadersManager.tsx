'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import CoachingAutomationForm from './CoachingAutomationForm';
import {
  COACHING_DEFAULTS,
  resolveLeaderConfig,
  type CoachingConfig,
  type CoachingConfigOverride,
} from '../../lib/circle-leader-toolkit/coaching/config';

/**
 * Filterable roster of leaders and their coaching settings, with the ability to
 * mass-apply settings to a selection or fine-tune a single leader inline.
 */

interface LeaderRow {
  id: number;
  name: string;
  campus: string | null;
  circle_type: string | null;
  acpd: string | null;
  status: string | null;
  coaching_automation_overrides: CoachingConfigOverride | null;
}

function summarize(cfg: CoachingConfig): string {
  if (!cfg.enabled) return 'All off';
  const parts: string[] = [];
  if (cfg.multiplication.enabled) parts.push(`Mult ${cfg.multiplication.rosterThreshold}`);
  if (cfg.newMember.enabled) parts.push('New');
  if (cfg.inactivity.enabled) parts.push(`Inact ${cfg.inactivity.weeks}w`);
  if (cfg.birthday.enabled) parts.push('Bday');
  if (cfg.didNotMeet.enabled) parts.push(`DNM ${cfg.didNotMeet.weeks}w`);
  if (cfg.firstTimeAttendee.enabled) parts.push('1st');
  return parts.join(' · ') || 'All off';
}

function uniqueSorted(values: Array<string | null>): string[] {
  return Array.from(new Set(values.map((v) => (v || '').trim()).filter(Boolean))).sort();
}

export default function CoachingLeadersManager() {
  const [defaults, setDefaults] = useState<CoachingConfig>(COACHING_DEFAULTS);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [campus, setCampus] = useState('');
  const [circleType, setCircleType] = useState('');
  const [acpd, setAcpd] = useState('');

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rowDraft, setRowDraft] = useState<CoachingConfig | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDraft, setBulkDraft] = useState<CoachingConfig>(COACHING_DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const getToken = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const defRes = await fetch('/api/circle-leader-toolkit/coaching-settings', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      const defJson = await defRes.json();
      if (defRes.ok && defJson.defaults) setDefaults(defJson.defaults as CoachingConfig);

      const { data, error: dbError } = await supabase
        .from('circle_leaders')
        .select('id, name, campus, circle_type, acpd, status, coaching_automation_overrides')
        .order('name');
      if (dbError) throw new Error(dbError.message);
      setLeaders((data || []) as LeaderRow[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load leaders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const campuses = useMemo(() => uniqueSorted(leaders.map((l) => l.campus)), [leaders]);
  const types = useMemo(() => uniqueSorted(leaders.map((l) => l.circle_type)), [leaders]);
  const acpds = useMemo(() => uniqueSorted(leaders.map((l) => l.acpd)), [leaders]);

  const filtered = useMemo(
    () =>
      leaders.filter(
        (l) =>
          (!campus || l.campus === campus) &&
          (!circleType || l.circle_type === circleType) &&
          (!acpd || l.acpd === acpd)
      ),
    [leaders, campus, circleType, acpd]
  );

  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((l) => next.delete(l.id));
      else filtered.forEach((l) => next.add(l.id));
      return next;
    });
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startRowEdit(leader: LeaderRow) {
    if (expandedId === leader.id) {
      setExpandedId(null);
      setRowDraft(null);
      return;
    }
    setExpandedId(leader.id);
    setRowDraft(resolveLeaderConfig(defaults, leader.coaching_automation_overrides));
  }

  async function persistOverrides(ids: number[], value: CoachingConfigOverride | null) {
    setBusy(true);
    setNotice('');
    setError('');
    const { error: dbError } = await supabase
      .from('circle_leaders')
      .update({ coaching_automation_overrides: value })
      .in('id', ids);
    setBusy(false);
    if (dbError) {
      setError(dbError.message);
      return false;
    }
    // Reflect locally without a full reload.
    setLeaders((prev) =>
      prev.map((l) => (ids.includes(l.id) ? { ...l, coaching_automation_overrides: value } : l))
    );
    return true;
  }

  async function applyBulk() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const ok = await persistOverrides(ids, bulkDraft);
    if (ok) {
      setNotice(`Applied settings to ${ids.length} leader${ids.length === 1 ? '' : 's'}.`);
      setBulkOpen(false);
    }
  }

  async function resetSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const ok = await persistOverrides(ids, null);
    if (ok) setNotice(`Reset ${ids.length} leader${ids.length === 1 ? '' : 's'} to org defaults.`);
  }

  async function saveRow(leaderId: number) {
    if (!rowDraft) return;
    const ok = await persistOverrides([leaderId], rowDraft);
    if (ok) {
      setNotice('Leader settings saved.');
      setExpandedId(null);
      setRowDraft(null);
    }
  }

  async function resetRow(leaderId: number) {
    const ok = await persistOverrides([leaderId], null);
    if (ok) {
      setNotice('Leader reset to org defaults.');
      setExpandedId(null);
      setRowDraft(null);
    }
  }

  const selectClass =
    'rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none';

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Campus
          <select className={selectClass} value={campus} onChange={(e) => setCampus(e.target.value)}>
            <option value="">All campuses</option>
            {campuses.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Circle type
          <select className={selectClass} value={circleType} onChange={(e) => setCircleType(e.target.value)}>
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          ACPD
          <select className={selectClass} value={acpd} onChange={(e) => setAcpd(e.target.value)}>
            <option value="">All ACPDs</option>
            {acpds.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400 self-center">
          {filtered.length} leader{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-emerald-500">{notice}</p>}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-800/40 bg-emerald-900/10 px-4 py-2.5">
          <span className="text-sm text-slate-200">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => { setBulkDraft(defaults); setBulkOpen((v) => !v); }}
            className="text-xs px-3 py-1.5 rounded-md border border-emerald-800/40 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/45"
          >
            {bulkOpen ? 'Close bulk editor' : 'Edit selected…'}
          </button>
          <button
            type="button"
            onClick={resetSelected}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md border border-zinc-700 text-slate-300 hover:bg-zinc-700/40 disabled:opacity-50"
          >
            Reset to org defaults
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs px-3 py-1.5 rounded-md text-slate-400 hover:text-white"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Bulk editor */}
      {selected.size > 0 && bulkOpen && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-brand-dark p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900/30 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-100">Automations enabled</p>
              <p className="text-xs text-slate-400">Master switch applied to the selected leaders.</p>
            </div>
            <button
              type="button"
              onClick={() => setBulkDraft((c) => ({ ...c, enabled: !c.enabled }))}
              className={`shrink-0 min-w-[72px] text-xs px-3 py-1.5 rounded-md border transition-colors ${
                bulkDraft.enabled
                  ? 'text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/45 border-emerald-800/40'
                  : 'text-slate-300 bg-zinc-700/30 hover:bg-zinc-700/60 border-zinc-700'
              }`}
            >
              {bulkDraft.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          <div className={bulkDraft.enabled ? '' : 'opacity-50 pointer-events-none'}>
            <CoachingAutomationForm value={bulkDraft} onChange={setBulkDraft} disabled={busy} />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={applyBulk}
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? 'Applying…' : `Apply to ${selected.size} leader${selected.size === 1 ? '' : 's'}`}
            </button>
            <span className="text-xs text-slate-400">These thresholds become each selected leader’s custom settings.</span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2.5 w-10">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th className="px-3 py-2.5">Leader</th>
              <th className="px-3 py-2.5 hidden sm:table-cell">Campus</th>
              <th className="px-3 py-2.5 hidden md:table-cell">Type</th>
              <th className="px-3 py-2.5 hidden md:table-cell">ACPD</th>
              <th className="px-3 py-2.5">Settings</th>
              <th className="px-3 py-2.5 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700/60">
            {filtered.map((leader) => {
              const customized = leader.coaching_automation_overrides != null;
              const effective = resolveLeaderConfig(defaults, leader.coaching_automation_overrides);
              const expanded = expandedId === leader.id;
              return (
                <Fragment key={leader.id}>
                  <tr className="text-slate-700 dark:text-slate-200">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(leader.id)}
                        onChange={() => toggleOne(leader.id)}
                        aria-label={`Select ${leader.name}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{leader.name}</div>
                      <span
                        className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full border ${
                          customized
                            ? 'text-amber-300 bg-amber-900/20 border-amber-800/40'
                            : 'text-slate-400 bg-zinc-700/20 border-zinc-700'
                        }`}
                      >
                        {customized ? 'Custom' : 'Org defaults'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-slate-500 dark:text-slate-400">{leader.campus || '—'}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-slate-500 dark:text-slate-400">{leader.circle_type || '—'}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-slate-500 dark:text-slate-400">{leader.acpd || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{summarize(effective)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => startRowEdit(leader)}
                        className="text-xs px-2.5 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/40"
                      >
                        {expanded ? 'Close' : 'Edit'}
                      </button>
                    </td>
                  </tr>
                  {expanded && rowDraft && (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 bg-zinc-50 dark:bg-zinc-900/40">
                        <div className="max-w-2xl space-y-4">
                          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900/30 px-4 py-3">
                            <p className="text-sm font-semibold text-slate-100">Automations enabled</p>
                            <button
                              type="button"
                              onClick={() => setRowDraft({ ...rowDraft, enabled: !rowDraft.enabled })}
                              className={`shrink-0 min-w-[72px] text-xs px-3 py-1.5 rounded-md border transition-colors ${
                                rowDraft.enabled
                                  ? 'text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/45 border-emerald-800/40'
                                  : 'text-slate-300 bg-zinc-700/30 hover:bg-zinc-700/60 border-zinc-700'
                              }`}
                            >
                              {rowDraft.enabled ? 'Enabled' : 'Disabled'}
                            </button>
                          </div>
                          <div className={rowDraft.enabled ? '' : 'opacity-50 pointer-events-none'}>
                            <CoachingAutomationForm value={rowDraft} onChange={setRowDraft} disabled={busy} />
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => saveRow(leader.id)}
                              disabled={busy}
                              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                            >
                              {busy ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => resetRow(leader.id)}
                              disabled={busy}
                              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-slate-300 hover:bg-zinc-700/40 disabled:opacity-50"
                            >
                              Reset to org defaults
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">
                  No leaders match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
