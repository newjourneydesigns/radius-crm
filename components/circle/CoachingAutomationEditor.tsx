'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import CoachingAutomationForm from '../coaching/CoachingAutomationForm';
import {
  COACHING_DEFAULTS,
  resolveLeaderConfig,
  type CoachingConfig,
  type CoachingConfigOverride,
} from '../../lib/circle-leader-toolkit/coaching/config';

/**
 * Full-page editor for a single leader's coaching automation overrides (ACPD only).
 * A leader inherits the org defaults until an admin customizes them here;
 * "Reset to org defaults" clears the override back to inherited.
 */

interface Props {
  leaderId: number;
  initialOverride: CoachingConfigOverride | null | undefined;
}

function MasterToggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`shrink-0 min-w-[72px] text-xs px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50 ${
        on
          ? 'text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/45 border-emerald-800/40'
          : 'text-slate-300 bg-zinc-700/30 hover:bg-zinc-700/60 border-zinc-700'
      }`}
    >
      {on ? 'Enabled' : 'Disabled'}
    </button>
  );
}

export default function CoachingAutomationEditor({ leaderId, initialOverride }: Props) {
  const [defaults, setDefaults] = useState<CoachingConfig>(COACHING_DEFAULTS);
  const [override, setOverride] = useState<CoachingConfigOverride | null>(initialOverride ?? null);
  const [draft, setDraft] = useState<CoachingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const customized = override != null;

  const loadDefaults = useCallback(async () => {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/circle-leader-toolkit/coaching-settings', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok && data.defaults) setDefaults(data.defaults as CoachingConfig);
    } catch {
      // Fall back to built-in defaults; non-fatal.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDefaults();
  }, [loadDefaults]);

  // Seed the editable draft from the effective config once defaults are loaded.
  useEffect(() => {
    if (!loading && customized) setDraft(resolveLeaderConfig(defaults, override));
  }, [loading, customized]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(next: CoachingConfigOverride | null) {
    setSaving(true);
    setError('');
    const { error: dbError } = await supabase
      .from('circle_leaders')
      .update({ coaching_automation_overrides: next })
      .eq('id', leaderId);
    setSaving(false);
    if (dbError) {
      setError(dbError.message);
      return false;
    }
    setOverride(next);
    setSavedAt(Date.now());
    return true;
  }

  async function handleEnableCustom() {
    const seeded = resolveLeaderConfig(defaults, override);
    setDraft(seeded);
    await persist(seeded);
  }

  async function handleReset() {
    setDraft(null);
    await persist(null);
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-brand-dark shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {customized ? 'Custom settings for this leader' : 'Following org-wide defaults'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {customized
                ? 'These thresholds apply only to this leader.'
                : 'This leader uses the organization defaults set on the Coaching Automations admin page.'}
            </p>
          </div>
          <span
            className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${
              customized
                ? 'text-amber-300 bg-amber-900/20 border-amber-800/40'
                : 'text-slate-400 bg-zinc-700/30 border-zinc-700'
            }`}
          >
            {customized ? 'Custom' : 'Org defaults'}
          </span>
        </div>

        <div className="p-5">
          {!customized ? (
            <div className="space-y-4">
              <div className="opacity-60 pointer-events-none">
                <CoachingAutomationForm value={defaults} onChange={() => {}} disabled />
              </div>
              <button
                type="button"
                onClick={handleEnableCustom}
                disabled={saving}
                className="rounded-lg border border-emerald-800/40 bg-emerald-900/30 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/45 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Customize for this leader'}
              </button>
            </div>
          ) : draft ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900/30 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Automations enabled</p>
                  <p className="text-xs text-slate-400">Master switch for this leader’s coaching nudges.</p>
                </div>
                <MasterToggle
                  on={draft.enabled}
                  disabled={saving}
                  onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
                />
              </div>

              <div className={draft.enabled ? '' : 'opacity-50 pointer-events-none'}>
                <CoachingAutomationForm value={draft} onChange={setDraft} disabled={saving} />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => persist(draft)}
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={saving}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-slate-300 hover:bg-zinc-700/40 disabled:opacity-50"
                >
                  Reset to org defaults
                </button>
                {savedAt && !saving && <span className="text-xs text-emerald-400">Saved</span>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Loading…</p>
          )}
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
