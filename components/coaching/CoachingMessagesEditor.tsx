'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { AutomationKind } from '../../lib/circle-leader-toolkit/coaching/config';
import { renderNudge, validateTemplate, type NudgeVars, type TemplateText } from '../../lib/circle-leader-toolkit/coaching/templates';

// Sample values used to render a realistic preview of each message.
const SAMPLE_VARS: Record<AutomationKind, NudgeVars> = {
  multiplication: { leaderName: 'Trip Ochenski', rosterCount: 12 },
  new_member: { leaderName: 'Trip Ochenski', memberNames: ['Alex Rivera'] },
  inactivity: { leaderName: 'Trip Ochenski', memberNames: ['Jordan Lee', 'Sam Park'], weeks: 4 },
  birthday: { leaderName: 'Trip Ochenski', memberNames: ['Jamie Chen'] },
  did_not_meet: { leaderName: 'Trip Ochenski', weeks: 2 },
  first_time: { leaderName: 'Trip Ochenski', memberNames: ['Taylor Kim'] },
};

/**
 * Editor for the coaching nudge copy. One card per automation with an editable
 * title + body and the placeholders that automation supports. Saving stores an
 * override; "Reset to default" restores the built-in copy.
 */

interface ApiShape {
  templates: Record<AutomationKind, TemplateText>;
  defaults: Record<AutomationKind, TemplateText>;
  placeholders: Record<AutomationKind, string[]>;
  labels: Record<AutomationKind, string>;
  order: AutomationKind[];
  customized: AutomationKind[];
}

export default function CoachingMessagesEditor() {
  const [data, setData] = useState<ApiShape | null>(null);
  const [drafts, setDrafts] = useState<Record<string, TemplateText>>({});
  const [loading, setLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [savedKind, setSavedKind] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<string | null>(null);

  const getToken = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null;

  // Turn a raw error into something actionable — the most common cause of a
  // failed save is the templates migration not having been run yet.
  const friendly = (message: string): string => {
    const m = (message || '').toLowerCase();
    if (m.includes('does not exist') || m.includes('coaching_automation_templates') || m.includes('schema cache')) {
      return 'Couldn’t save — the coaching messages table isn’t set up yet. Run the database migration 20260614150000_coaching_automation_templates.sql, then try again.';
    }
    return message || 'Something went wrong.';
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/circle-leader-toolkit/coaching-templates', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load messages.');
      setData(json as ApiShape);
      const seeded: Record<string, TemplateText> = {};
      (json.order as AutomationKind[]).forEach((k) => {
        seeded[k] = { title: json.templates[k].title, body_html: json.templates[k].body_html };
      });
      setDrafts(seeded);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(kind: AutomationKind) {
    setBusyKind(kind);
    setError('');
    setErrorKind(null);
    setSavedKind(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/circle-leader-toolkit/coaching-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ kind, title: drafts[kind].title, body_html: drafts[kind].body_html }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to save.');
      setSavedKind(kind);
      await load();
    } catch (e: unknown) {
      setError(friendly(e instanceof Error ? e.message : 'Failed to save.'));
      setErrorKind(kind);
    } finally {
      setBusyKind(null);
    }
  }

  async function resetToDefault(kind: AutomationKind) {
    setBusyKind(kind);
    setError('');
    setErrorKind(null);
    setSavedKind(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/circle-leader-toolkit/coaching-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ kind, reset: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to reset.');
      await load();
    } catch (e: unknown) {
      setError(friendly(e instanceof Error ? e.message : 'Failed to reset.'));
      setErrorKind(kind);
    } finally {
      setBusyKind(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (!data) return <p className="text-sm text-red-400">{error || 'Could not load messages.'}</p>;

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        These are the messages leaders receive in their Toolkit inbox. Basic HTML (like &lt;p&gt; and &lt;strong&gt;) is supported.
        Use the placeholders shown under each message — they’re filled in automatically when the nudge is sent.
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {data.order.map((kind) => {
        const draft = drafts[kind];
        if (!draft) return null;
        const isCustom = data.customized.includes(kind);
        const dirty =
          draft.title !== data.templates[kind].title || draft.body_html !== data.templates[kind].body_html;
        const validation = validateTemplate(kind, draft);
        return (
          <div
            key={kind}
            className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-brand-dark shadow-sm overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{data.labels[kind]}</p>
              <span
                className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${
                  isCustom
                    ? 'text-amber-300 bg-amber-900/20 border-amber-800/40'
                    : 'text-slate-400 bg-zinc-700/30 border-zinc-700'
                }`}
              >
                {isCustom ? 'Edited' : 'Default'}
              </span>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  value={draft.title}
                  disabled={busyKind === kind}
                  onChange={(e) => setDrafts((d) => ({ ...d, [kind]: { ...d[kind], title: e.target.value } }))}
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Message</label>
                <textarea
                  rows={6}
                  value={draft.body_html}
                  disabled={busyKind === kind}
                  onChange={(e) => setDrafts((d) => ({ ...d, [kind]: { ...d[kind], body_html: e.target.value } }))}
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm leading-relaxed text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">Placeholders:</span>
                {data.placeholders[kind].map((ph) => (
                  <code
                    key={ph}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-emerald-700 dark:text-emerald-300 border border-zinc-200 dark:border-zinc-700"
                  >
                    {`{{${ph}}}`}
                  </code>
                ))}
              </div>

              {(validation.unknownPlaceholders.length > 0 || validation.unbalancedTags.length > 0) && (
                <div className="rounded-md border border-amber-400/40 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 px-3 py-2 space-y-1">
                  {validation.unknownPlaceholders.map((ph) => (
                    <p key={ph} className="text-[11px] text-amber-700 dark:text-amber-300">
                      <code className="font-mono">{`{{${ph}}}`}</code> isn’t a supported placeholder — it won’t be filled in. Use one of the placeholders above.
                    </p>
                  ))}
                  {validation.unbalancedTags.length > 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      Unclosed or mismatched HTML: {validation.unbalancedTags.map((t) => `<${t}>`).join(', ')}. Close every tag before saving.
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => save(kind)}
                  disabled={busyKind === kind || !dirty || !validation.valid}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busyKind === kind ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => resetToDefault(kind)}
                  disabled={busyKind === kind || !isCustom}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/40 disabled:opacity-50"
                >
                  Reset to default
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewKind((p) => (p === kind ? null : kind))}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/40"
                >
                  {previewKind === kind ? 'Hide preview' : 'Preview'}
                </button>
                {savedKind === kind && busyKind !== kind && <span className="text-xs text-emerald-500">Saved</span>}
                {!dirty && !isCustom && busyKind !== kind && (
                  <span className="text-xs text-slate-400">Edit the text to enable Save</span>
                )}
              </div>

              {errorKind === kind && error && <p className="text-xs text-red-400">{error}</p>}

              {previewKind === kind && (() => {
                const rendered = renderNudge(kind, SAMPLE_VARS[kind], draft);
                return (
                  <div className="mt-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">Preview (sample data)</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{rendered.title}</p>
                    <div
                      className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed [&_p]:mb-2"
                      dangerouslySetInnerHTML={{ __html: rendered.bodyHtml }}
                    />
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
