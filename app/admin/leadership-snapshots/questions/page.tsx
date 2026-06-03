'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../../../components/ProtectedRoute';
import { useAuth } from '../../../../contexts/AuthContext';
import { supabase } from '../../../../lib/supabase';

type Q = { id: string; stem: string };
type Cat = { id: string; label: string; subtitle: string; reflectionId: string; reflectionPrompt: string; questions: Q[] };
type ScalePt = { value: number; label: string };
type Template = { version?: number; scale: ScalePt[]; categories: Cat[] };

const newId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function HealthQuestionsEditorPage() {
  const { isAdmin } = useAuth();
  const [tpl, setTpl] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/leadership-snapshot/template', { headers: await authHeaders() });
        const json = await res.json();
        if (res.ok && json.template) setTpl(json.template);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function patch(updater: (t: Template) => Template) {
    setTpl((t) => (t ? updater(structuredClone(t)) : t));
    setMsg(null);
  }

  // ── Scale ops ──
  const setScaleLabel = (i: number, label: string) => patch((t) => { t.scale[i].label = label; return t; });
  const addScale = () => patch((t) => { t.scale.push({ value: t.scale.length + 1, label: '' }); return t; });
  const removeScale = () => patch((t) => { if (t.scale.length > 2) t.scale.pop(); return t; });

  // ── Category ops ──
  const addCategory = () => patch((t) => {
    const id = newId('c');
    t.categories.push({ id, label: '', subtitle: '', reflectionId: `r_${id}`, reflectionPrompt: '', questions: [{ id: newId('q'), stem: '' }] });
    return t;
  });
  const removeCategory = (ci: number) => patch((t) => { t.categories.splice(ci, 1); return t; });
  const moveCategory = (ci: number, dir: -1 | 1) => patch((t) => {
    const j = ci + dir;
    if (j < 0 || j >= t.categories.length) return t;
    [t.categories[ci], t.categories[j]] = [t.categories[j], t.categories[ci]];
    return t;
  });
  const setCat = (ci: number, key: keyof Cat, val: string) => patch((t) => { (t.categories[ci] as any)[key] = val; return t; });

  // ── Question ops ──
  const addQuestion = (ci: number) => patch((t) => { t.categories[ci].questions.push({ id: newId('q'), stem: '' }); return t; });
  const removeQuestion = (ci: number, qi: number) => patch((t) => { t.categories[ci].questions.splice(qi, 1); return t; });
  const moveQuestion = (ci: number, qi: number, dir: -1 | 1) => patch((t) => {
    const qs = t.categories[ci].questions; const j = qi + dir;
    if (j < 0 || j >= qs.length) return t;
    [qs[qi], qs[j]] = [qs[j], qs[qi]];
    return t;
  });
  const setQ = (ci: number, qi: number, stem: string) => patch((t) => { t.categories[ci].questions[qi].stem = stem; return t; });

  async function save() {
    if (!tpl) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/leadership-snapshot/template', {
        method: 'PUT',
        headers: await authHeaders(),
        body: JSON.stringify({ scale: tpl.scale, categories: tpl.categories }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ type: 'err', text: json.error || 'Save failed.' });
      } else {
        setTpl(json.template);
        setMsg({ type: 'ok', text: `Saved as version ${json.template.version}. New submissions use these questions; past results are unchanged.` });
      }
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Save failed.' });
    } finally {
      setSaving(false);
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
      <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 lg:pb-10">
          <div className="mb-6">
            <Link href="/admin/leadership-snapshots" className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm mb-3 w-fit">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
              <span>Back to review</span>
            </Link>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-white tracking-tight">Health Assessment Questions</h1>
                <p className="text-sm text-slate-400 mt-1">Edit the areas, questions, prompts, and rating scale. Saving creates a new version — past results stay frozen.</p>
              </div>
              <button onClick={save} disabled={saving || !tpl} className="bg-btn-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>

          {msg && (
            <div className={`mb-5 rounded-lg px-4 py-3 text-sm ${msg.type === 'ok' ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300' : 'bg-red-500/10 border border-red-500/40 text-red-300'}`}>
              {msg.text}
            </div>
          )}

          {loading || !tpl ? (
            <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" /></div>
          ) : (
            <div className="space-y-5">
              {/* Scale */}
              <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 shadow-card-glass">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white">Rating scale</h2>
                  <div className="flex gap-2">
                    <button onClick={removeScale} disabled={tpl.scale.length <= 2} className="text-xs px-2.5 py-1 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 transition-colors">– Remove</button>
                    <button onClick={addScale} className="text-xs px-2.5 py-1 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">+ Add point</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {tpl.scale.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 text-center text-sm font-bold text-indigo-300 shrink-0">{i + 1}</span>
                      <input value={s.label} onChange={(e) => setScaleLabel(i, e.target.value)} placeholder="Label (e.g. Often)" className={inp} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Categories */}
              {tpl.categories.map((cat, ci) => (
                <div key={cat.id} className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 shadow-card-glass">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Area {ci + 1}</span>
                    <div className="flex gap-1">
                      <IconBtn label="Move up" disabled={ci === 0} onClick={() => moveCategory(ci, -1)} d="M5 15l7-7 7 7" />
                      <IconBtn label="Move down" disabled={ci === tpl.categories.length - 1} onClick={() => moveCategory(ci, 1)} d="M19 9l-7 7-7-7" />
                      <button onClick={() => removeCategory(ci)} className="text-xs px-2.5 py-1 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors">Remove</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <input value={cat.label} onChange={(e) => setCat(ci, 'label', e.target.value)} placeholder="Area name (e.g. Personal Spiritual Health)" className={`${inp} font-semibold`} />
                    <input value={cat.subtitle} onChange={(e) => setCat(ci, 'subtitle', e.target.value)} placeholder="Short subtitle (optional)" className={inp} />
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Questions</div>
                    {cat.questions.map((q, qi) => (
                      <div key={q.id} className="flex items-start gap-2">
                        <div className="flex flex-col gap-0.5 pt-1">
                          <IconBtn small label="Up" disabled={qi === 0} onClick={() => moveQuestion(ci, qi, -1)} d="M5 15l7-7 7 7" />
                          <IconBtn small label="Down" disabled={qi === cat.questions.length - 1} onClick={() => moveQuestion(ci, qi, 1)} d="M19 9l-7 7-7-7" />
                        </div>
                        <textarea value={q.stem} onChange={(e) => setQ(ci, qi, e.target.value)} placeholder="Question statement…" rows={2} className={`${inp} resize-y`} />
                        <button onClick={() => removeQuestion(ci, qi)} disabled={cat.questions.length <= 1} className="mt-1 text-slate-500 hover:text-red-400 disabled:opacity-30 transition-colors p-1" aria-label="Remove question">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                    <button onClick={() => addQuestion(ci)} className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">+ Add question</button>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Reflection prompt</div>
                    <textarea value={cat.reflectionPrompt} onChange={(e) => setCat(ci, 'reflectionPrompt', e.target.value)} placeholder="Open-ended reflection question (optional)" rows={2} className={`${inp} resize-y`} />
                  </div>
                </div>
              ))}

              <button onClick={addCategory} className="w-full rounded-xl border-2 border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 py-3 text-sm font-medium transition-colors">
                + Add area
              </button>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

const inp = 'w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors';

function IconBtn({ label, onClick, disabled, d, small }: { label: string; onClick: () => void; disabled?: boolean; d: string; small?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className={`${small ? 'p-0.5' : 'px-1.5 py-1'} rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 transition-colors`}>
      <svg className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={d} /></svg>
    </button>
  );
}
