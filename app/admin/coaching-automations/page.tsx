'use client';

import { useCallback, useEffect, useState } from 'react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import ConfirmModal from '../../../components/ui/ConfirmModal';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import CoachingAutomationForm from '../../../components/coaching/CoachingAutomationForm';
import { COACHING_DEFAULTS, type CoachingConfig } from '../../../lib/circle-leader-toolkit/coaching/config';

export default function AdminCoachingAutomationsPage() {
  const { isAdmin } = useAuth();
  const [config, setConfig] = useState<CoachingConfig>(COACHING_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);

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
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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

  if (!isAdmin()) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] flex items-center justify-center px-4">
          <p className="text-slate-400 text-sm">This page is available to ACPD admins only.</p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <header className="mb-6">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Coaching Automations</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Set the org-wide defaults for the life-giving nudges delivered to leaders’ Toolkit inboxes.
              You can fine-tune any single leader from their Circle page.
            </p>
          </header>

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

          {/* Apply to all leaders */}
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
