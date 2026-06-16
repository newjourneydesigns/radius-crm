'use client';

import { useCallback, useEffect, useState } from 'react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import ConfirmModal from '../../../components/ui/ConfirmModal';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import CoachingAutomationForm from '../../../components/coaching/CoachingAutomationForm';
import CoachingLeadersManager from '../../../components/coaching/CoachingLeadersManager';
import CoachingMessagesEditor from '../../../components/coaching/CoachingMessagesEditor';
import { isCoachingAutomationsEnabled } from '../../../lib/circle-leader-toolkit/coaching/feature-flag';
import { COACHING_DEFAULTS, type CoachingConfig } from '../../../lib/circle-leader-toolkit/coaching/config';
import { AUTOMATION_LABELS } from '../../../lib/circle-leader-toolkit/coaching/templates';
import type { AutomationKind } from '../../../lib/circle-leader-toolkit/coaching/config';

interface RunResult {
  dryRun: boolean;
  eligibleLeaders: number;
  sentCount: number;
  sentByKind: Record<string, number>;
  preview?: Array<{ leaderId: number | string; name: string; kinds: string[] }>;
}

interface RunHistoryItem {
  id: string;
  trigger: 'cron' | 'manual' | 'dry_run' | string;
  ok: boolean;
  eligible_leaders: number;
  sent_count: number;
  sent_by_kind: Record<string, number>;
  errors: Array<{ leaderId: number | string; error: string }>;
  duration_ms: number | null;
  started_at: string;
}

type Tab = 'defaults' | 'leaders' | 'messages' | 'history';

const TABS: { key: Tab; label: string }[] = [
  { key: 'defaults', label: 'Org Defaults' },
  { key: 'leaders', label: 'Leaders' },
  { key: 'messages', label: 'Messages' },
  { key: 'history', label: 'Run history' },
];

const TRIGGER_LABELS: Record<string, string> = {
  cron: 'Scheduled',
  manual: 'Run now',
  dry_run: 'Preview',
};

function formatRunTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AdminCoachingAutomationsPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('defaults');

  const [config, setConfig] = useState<CoachingConfig>(COACHING_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [running, setRunning] = useState<'preview' | 'live' | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState('');
  const [history, setHistory] = useState<RunHistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const getToken = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/circle-leader-toolkit/coaching-settings', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load settings.');
      setConfig(data.defaults as CoachingConfig);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin()) load();
  }, [isAdmin, load]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/circle-leader-toolkit/coaching-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save settings.');
      setConfig(data.defaults as CoachingConfig);
      setSavedAt(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyToAll() {
    setApplying(true);
    setApplyResult(null);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/circle-leader-toolkit/coaching-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'apply_to_all' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to apply defaults.');
      const n = Number(data.cleared || 0);
      setApplyResult(
        n === 0
          ? 'All leaders were already on the org defaults.'
          : `Reset ${n} leader${n === 1 ? '' : 's'} to the org defaults.`
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to apply defaults.');
    } finally {
      setApplying(false);
      setConfirmOpen(false);
    }
  }

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/circle-leader-toolkit/coaching-runs', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load run history.');
      setHistory((data.runs ?? []) as RunHistoryItem[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load run history.';
      setHistoryError(
        /does not exist|coaching_automation_runs|schema cache/i.test(msg)
          ? 'Run history isn’t set up yet. Run the migration 20260615000000_coaching_automation_runs.sql, then refresh.'
          : msg
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin() && tab === 'history' && history === null) loadHistory();
  }, [isAdmin, tab, history, loadHistory]);

  async function runNow(dryRun: boolean) {
    setRunning(dryRun ? 'preview' : 'live');
    setRunError('');
    setRunResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/circle-leader-toolkit/coaching-automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Run failed.');
      setRunResult(data as RunResult);
      // The run was just logged — drop the cache so the History tab reloads.
      setHistory(null);
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : 'Run failed.');
    } finally {
      setRunning(null);
    }
  }

  if (!isAdmin()) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] flex items-center justify-center px-4">
          <p className="text-slate-400 text-sm">This page is available to ACPD admins only.</p>
        </div>
      </ProtectedRoute>
    );
  }

  // Feature gate: keep the whole page hidden until coaching automations are turned on.
  if (!isCoachingAutomationsEnabled()) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] flex items-center justify-center px-4">
          <p className="text-slate-400 text-sm">This feature isn’t available yet.</p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <header className="mb-5">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Coaching Automations</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Manage the life-giving nudges delivered to leaders’ Toolkit inboxes — set defaults, tune individual
              leaders, and edit the messages.
            </p>
          </header>

          {/* Tabs */}
          <div className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.key
                    ? 'border-emerald-500 text-slate-900 dark:text-white'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'defaults' && (
            <div className="max-w-2xl">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-brand-dark shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Automations enabled</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Master switch for all coaching nudges across every Circle.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
                    aria-pressed={config.enabled}
                    className={`shrink-0 min-w-[72px] text-xs px-3 py-1.5 rounded-md border transition-colors ${
                      config.enabled
                        ? 'text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/45 border-emerald-800/40'
                        : 'text-slate-300 bg-zinc-700/30 hover:bg-zinc-700/60 border-zinc-700'
                    }`}
                  >
                    {config.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                <div className={`p-5 ${config.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
                  {loading ? (
                    <p className="text-sm text-slate-400">Loading…</p>
                  ) : (
                    <CoachingAutomationForm value={config} onChange={setConfig} />
                  )}
                </div>
              </div>

              {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || loading}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save defaults'}
                </button>
                {savedAt && !saving && <span className="text-xs text-emerald-400">Saved</span>}
              </div>

              {/* Test & run */}
              <div className="mt-8 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-brand-dark p-5">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Test &amp; run</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Preview shows what the next run would send, without delivering anything. Run now delivers due nudges
                  immediately — it’s safe to repeat, since each nudge is only ever sent once.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => runNow(true)}
                    disabled={running !== null}
                    className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-zinc-700/40 disabled:opacity-50"
                  >
                    {running === 'preview' ? 'Checking…' : 'Preview (dry run)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => runNow(false)}
                    disabled={running !== null}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {running === 'live' ? 'Running…' : 'Run now (send)'}
                  </button>
                </div>

                {runError && <p className="mt-3 text-sm text-red-400">{runError}</p>}

                {runResult && (
                  <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 p-4 text-sm">
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      {runResult.dryRun ? 'Would send' : 'Sent'} {runResult.sentCount} nudge
                      {runResult.sentCount === 1 ? '' : 's'} · {runResult.eligibleLeaders} eligible leaders
                    </p>
                    {Object.keys(runResult.sentByKind).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(runResult.sentByKind).map(([kind, n]) => (
                          <span
                            key={kind}
                            className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-800/40 bg-emerald-900/20 text-emerald-300"
                          >
                            {AUTOMATION_LABELS[kind as AutomationKind] || kind}: {n}
                          </span>
                        ))}
                      </div>
                    )}
                    {runResult.dryRun && runResult.preview && runResult.preview.length > 0 && (
                      <ul className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400 max-h-48 overflow-auto">
                        {runResult.preview.slice(0, 50).map((p) => (
                          <li key={String(p.leaderId)}>
                            <span className="text-slate-700 dark:text-slate-200">{p.name}</span>
                            {' — '}
                            {p.kinds.map((k) => AUTOMATION_LABELS[k as AutomationKind] || k).join(', ')}
                          </li>
                        ))}
                        {runResult.preview.length > 50 && <li>…and {runResult.preview.length - 50} more</li>}
                      </ul>
                    )}
                    {runResult.sentCount === 0 && (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Nothing is due right now (or everything due has already been sent).
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-8 rounded-xl border border-red-300/40 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-5">
                <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">Apply defaults to all leaders</h2>
                <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/70 leading-relaxed">
                  Removes every leader’s custom coaching settings so all of them follow the org defaults above.
                  This affects all Circles and can’t be undone.
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={applying || loading}
                  className="mt-3 rounded-lg border border-red-400/50 dark:border-red-800/50 bg-red-100 dark:bg-red-900/30 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                >
                  {applying ? 'Applying…' : 'Apply defaults to all leaders'}
                </button>
                {applyResult && <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">{applyResult}</p>}
              </div>
            </div>
          )}

          {tab === 'leaders' && <CoachingLeadersManager />}
          {tab === 'messages' && <CoachingMessagesEditor />}

          {tab === 'history' && (
            <div className="max-w-3xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Every scheduled, manual, and preview run is recorded here so you can confirm the worker ran and see
                  what it sent.
                </p>
                <button
                  type="button"
                  onClick={loadHistory}
                  disabled={historyLoading}
                  className="shrink-0 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/40 disabled:opacity-50"
                >
                  {historyLoading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {historyError && <p className="text-sm text-red-400">{historyError}</p>}

              {historyLoading && history === null && <p className="text-sm text-slate-400">Loading…</p>}

              {history !== null && history.length === 0 && !historyError && (
                <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No runs yet. The scheduled sweep runs each morning, or use “Run now” on the Org Defaults tab.
                  </p>
                </div>
              )}

              {history !== null && history.length > 0 && (
                <ul className="space-y-2.5">
                  {history.map((run) => (
                    <li
                      key={run.id}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-brand-dark p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span
                          className={`inline-flex h-2 w-2 rounded-full ${
                            run.errors?.length ? 'bg-red-500' : run.sent_count > 0 ? 'bg-emerald-500' : 'bg-zinc-400'
                          }`}
                          aria-hidden
                        />
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {formatRunTime(run.started_at)}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-slate-500 dark:text-slate-400">
                          {TRIGGER_LABELS[run.trigger] || run.trigger}
                        </span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {run.trigger === 'dry_run' ? 'Would send' : 'Sent'} {run.sent_count} · {run.eligible_leaders}{' '}
                          eligible
                          {run.duration_ms != null && (
                            <span className="text-slate-400 dark:text-slate-500"> · {(run.duration_ms / 1000).toFixed(1)}s</span>
                          )}
                        </span>
                      </div>

                      {Object.keys(run.sent_by_kind || {}).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {Object.entries(run.sent_by_kind).map(([kind, n]) => (
                            <span
                              key={kind}
                              className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-800/40 bg-emerald-900/20 text-emerald-300"
                            >
                              {AUTOMATION_LABELS[kind as AutomationKind] || kind}: {n}
                            </span>
                          ))}
                        </div>
                      )}

                      {run.errors?.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {run.errors.slice(0, 5).map((err, i) => (
                            <p key={i} className="text-[11px] text-red-400">
                              Leader {String(err.leaderId)}: {err.error}
                            </p>
                          ))}
                          {run.errors.length > 5 && (
                            <p className="text-[11px] text-red-400/80">…and {run.errors.length - 5} more</p>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleApplyToAll}
        type="danger"
        title="Apply defaults to all leaders?"
        message="This permanently removes any custom coaching automation settings on individual leaders and makes every leader follow the current org defaults. This cannot be undone."
        confirmText={applying ? 'Applying…' : 'Yes, overwrite all'}
        cancelText="Cancel"
        isLoading={applying}
      />
    </ProtectedRoute>
  );
}
