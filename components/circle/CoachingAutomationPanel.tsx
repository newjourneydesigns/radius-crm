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
 * Per-leader coaching automation overrides, shown on the Circle detail page for
 * ACPD admins. A leader inherits the org defaults until an admin customizes them
 * here; "Use org defaults" clears the override back to inherited.
 */

interface Props {
  leaderId: number;
  initialOverride: CoachingConfigOverride | null | undefined;
}

export default function CoachingAutomationPanel({ leaderId, initialOverride }: Props) {
  const [open, setOpen] = useState(false);
  const [defaults, setDefaults] = useState<CoachingConfig>(COACHING_DEFAULTS);
  const [override, setOverride] = useState<CoachingConfigOverride | null>(initialOverride ?? null);
  const [draft, setDraft] = useState<CoachingConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadedDefaults, setLoadedDefaults] = useState(false);

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
      setLoadedDefaults(true);
    }
  }, []);

  useEffect(() => {
    if (open && !loadedDefaults) loadDefaults();
  }, [open, loadedDefaults, loadDefaults]);

  // Seed the editable draft from the effective config when expanding into custom mode.
  useEffect(() => {
    if (open && customized && loadedDefaults) {
      setDraft(resolveLeaderConfig(defaults, override));
    }
  }, [open, customized, loadedDefaults]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return true;
  }

  async function handleEnableCustom() {
    const seeded = resolveLeaderConfig(defaults, override);
    setDraft(seeded);
    await persist(seeded);
  }

  async function handleUseDefaults() {
    setDraft(null);
    await persist(null);
  }

  async function handleSaveDraft() {
    if (!draft) return;
    await persist(draft);
  }

  return (
    <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <svg className="w-4 h-4 shrink-0 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a1 1 0 011 1v1.07A6.002 6.002 0 0116 10v3l1.3 1.3a1 1 0 01-.7 1.7H3.4a1 1 0 01-.7-1.7L4 13v-3a6.002 6.002 0 014-5.93V3a1 1 0 011-1z" />
          </svg>
          <span className="text-xs font-medium text-slate-300 whitespace-nowrap">Coaching Automations</span>
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
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-zinc-700/60 pt-3">
          {!customized ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 leading-relaxed">
                This leader follows the org-wide defaults. Customize to set different thresholds just for them.
              </p>
              <button
                type="button"
                onClick={handleEnableCustom}
                disabled={saving || !loadedDefaults}
                className="text-xs px-3 py-1.5 rounded-md border border-emerald-800/40 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/45 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Customize for this leader'}
              </button>
            </div>
          ) : draft ? (
            <div className="space-y-3">
              <CoachingAutomationForm value={draft} onChange={setDraft} disabled={saving} />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={handleUseDefaults}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 rounded-md border border-zinc-700 text-slate-300 hover:bg-zinc-700/40 disabled:opacity-50"
                >
                  Use org defaults
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Loading…</p>
          )}
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
