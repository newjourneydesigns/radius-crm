'use client';

import { useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useLeadershipSnapshots } from '../../hooks/useLeadershipSnapshots';
import {
  ROLE_OPTIONS,
  CAMPUS_OPTIONS,
  CIRCLE_TYPE_OPTIONS,
  GROUP_SIZE_OPTIONS,
  computeCategoryScores,
  overallScore,
  STRENGTH_THRESHOLD,
  DEFAULT_TEMPLATE,
  formatRating,
  type SnapshotTemplate,
  type ScaleOption,
} from '../../lib/leadershipSnapshot';
import type { LeadershipSnapshot, LeadershipSnapshotCategoryScore } from '../../lib/supabase';

type Contact = {
  respondent_name: string;
  respondent_email: string;
  respondent_phone: string;
  role: string;
  campus: string;
  circle_type: string;
  group_size: string;
};

function scoreColor(score: number): string {
  if (score >= STRENGTH_THRESHOLD) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

export default function LeadershipSnapshotPage() {
  const { user } = useAuth();
  const { submit, error } = useLeadershipSnapshots();

  const [template, setTemplate] = useState<SnapshotTemplate>(DEFAULT_TEMPLATE);
  const categories = template.categories;
  const scale = template.scale;

  // step is 'intro' | 'contact' | <categoryId> | 'results'
  const [step, setStep] = useState<string>('intro');
  const [contact, setContact] = useState<Contact>({
    respondent_name: '',
    respondent_email: '',
    respondent_phone: '',
    role: '',
    campus: '',
    circle_type: '',
    group_size: '',
  });
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [reflections, setReflections] = useState<Record<string, string>>({});
  const [contactErrors, setContactErrors] = useState<Record<string, boolean>>({});
  const [missingQs, setMissingQs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LeadershipSnapshot | null>(null);
  const [openCat, setOpenCat] = useState<string | null>(null);

  const stepIds = useMemo(() => ['intro', 'contact', ...categories.map((c) => c.id), 'results'], [categories]);

  // Load the active template.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      try {
        const res = await fetch('/api/leadership-snapshot/template', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const json = await res.json();
          if (json.template) setTemplate(json.template);
        }
      } catch {
        /* fall back to DEFAULT_TEMPLATE */
      }
    })();
  }, []);

  // Prefill from the logged-in user + their matched Circle Leader record.
  useEffect(() => {
    if (!user) return;
    setContact((c) => ({
      ...c,
      respondent_name: c.respondent_name || user.name || '',
      respondent_email: c.respondent_email || user.email || '',
    }));
    if (!user.email) return;
    supabase
      .from('circle_leaders')
      .select('name, email, phone, campus, circle_type')
      .ilike('email', user.email)
      .limit(1)
      .then(({ data }) => {
        const leader = data?.[0];
        if (!leader) return;
        setContact((c) => ({
          ...c,
          respondent_name: c.respondent_name || leader.name || '',
          respondent_phone: c.respondent_phone || leader.phone || '',
          campus: c.campus || (CAMPUS_OPTIONS.includes(leader.campus) ? leader.campus : ''),
        }));
      });
  }, [user]);

  const stepIndex = stepIds.indexOf(step);
  const progress = Math.round((Math.max(0, stepIndex) / (stepIds.length - 1)) * 100);
  const liveScores = useMemo<LeadershipSnapshotCategoryScore[]>(
    () => computeCategoryScores(answers, template),
    [answers, template]
  );

  function go(next: string) {
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validateContact() {
    const errs: Record<string, boolean> = {};
    if (contact.respondent_name.trim().length < 2) errs.respondent_name = true;
    if (!/\S+@\S+\.\S+/.test(contact.respondent_email)) errs.respondent_email = true;
    if (!contact.role) errs.role = true;
    if (!contact.campus) errs.campus = true;
    if (!contact.circle_type) errs.circle_type = true;
    if (!contact.group_size) errs.group_size = true;
    setContactErrors(errs);
    if (Object.keys(errs).length === 0) go(categories[0].id);
  }

  function nextFromCategory(catId: string, nextStep: string) {
    const cat = categories.find((c) => c.id === catId)!;
    const missing = cat.questions.filter((q) => !answers[q.id]).map((q) => q.id);
    if (missing.length) {
      setMissingQs(missing);
      return;
    }
    setMissingQs([]);
    go(nextStep);
  }

  async function handleSubmit() {
    const cat = categories[categories.length - 1];
    const missing = cat.questions.filter((q) => !answers[q.id]).map((q) => q.id);
    if (missing.length) {
      setMissingQs(missing);
      return;
    }
    setSubmitting(true);
    go('results');
    const snapshot = await submit({
      respondent_name: contact.respondent_name.trim(),
      respondent_email: contact.respondent_email.trim(),
      respondent_phone: contact.respondent_phone.trim(),
      role: contact.role,
      campus: contact.campus,
      circle_type: contact.circle_type,
      group_size: contact.group_size,
      answers,
      reflections,
    });
    setResult(snapshot);
    setSubmitting(false);
  }

  function restart() {
    setAnswers({});
    setReflections({});
    setResult(null);
    setOpenCat(null);
    setMissingQs([]);
    go('intro');
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117]">
        <div className="sticky top-0 z-20 h-1 bg-slate-200 dark:bg-slate-800">
          <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-28 lg:pb-10">
          {/* ── INTRO ── */}
          {step === 'intro' && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 text-white shadow-glow-brand">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-200 mb-3">Valley Creek Church</p>
                <h1 className="text-3xl font-bold leading-tight mb-3">Leadership Snapshot</h1>
                <p className="text-indigo-100 leading-relaxed text-[15px] max-w-xl">
                  Take a few honest minutes to reflect on where you are as a Circle Leader. You&apos;ll assess
                  {' '}{categories.length} key areas of leadership health and get a personalized summary to spark a great
                  conversation with your campus leader.
                </p>
              </div>

              <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 shadow-card-glass">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">How it works</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  You&apos;ll move through {categories.length} short sections, each with a few rating questions and a
                  reflection prompt. At the end you&apos;ll receive an AI-generated summary based on your responses.
                </p>
                <ScaleGuide scale={scale} className="mt-5" />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => go('contact')}
                  className="bg-btn-primary text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Get Started →
                </button>
              </div>
            </div>
          )}

          {/* ── CONTACT ── */}
          {step === 'contact' && (
            <div className="space-y-6">
              <SectionHeading label="Your Information" title="Let's start with you" sub="This helps your campus leader follow up with you personally." />
              <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 shadow-card-glass grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full Name" required error={contactErrors.respondent_name} errMsg="Please enter your name.">
                  <input className={inputCls} value={contact.respondent_name} onChange={(e) => setContact({ ...contact, respondent_name: e.target.value })} placeholder="First and last name" />
                </Field>
                <Field label="Email" required error={contactErrors.respondent_email} errMsg="Please enter a valid email.">
                  <input type="email" className={inputCls} value={contact.respondent_email} onChange={(e) => setContact({ ...contact, respondent_email: e.target.value })} placeholder="you@email.com" />
                </Field>
                <Field label="Phone">
                  <input type="tel" className={inputCls} value={contact.respondent_phone} onChange={(e) => setContact({ ...contact, respondent_phone: e.target.value })} placeholder="(555) 000-0000" />
                </Field>
                <Field label="Your Role" required error={contactErrors.role} errMsg="Please select your role.">
                  <select className={inputCls} value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })}>
                    <option value="">Select role…</option>
                    {ROLE_OPTIONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="Campus" required error={contactErrors.campus} errMsg="Please select your campus.">
                  <select className={inputCls} value={contact.campus} onChange={(e) => setContact({ ...contact, campus: e.target.value })}>
                    <option value="">Select campus…</option>
                    {CAMPUS_OPTIONS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Circle Type" required error={contactErrors.circle_type} errMsg="Please select your circle type.">
                  <select className={inputCls} value={contact.circle_type} onChange={(e) => setContact({ ...contact, circle_type: e.target.value })}>
                    <option value="">Select type…</option>
                    {CIRCLE_TYPE_OPTIONS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Group Size" required error={contactErrors.group_size} errMsg="Please select your group size.">
                  <select className={inputCls} value={contact.group_size} onChange={(e) => setContact({ ...contact, group_size: e.target.value })}>
                    <option value="">Select size…</option>
                    {GROUP_SIZE_OPTIONS.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </Field>
              </div>
              <NavRow onBack={() => go('intro')} onNext={validateContact} nextLabel="Next →" />
            </div>
          )}

          {/* ── CATEGORY SCREENS ── */}
          {categories.map((cat, i) => {
            if (step !== cat.id) return null;
            const isLast = i === categories.length - 1;
            const prevStep = i === 0 ? 'contact' : categories[i - 1].id;
            return (
              <div key={cat.id} className="space-y-6">
                <SectionHeading label={`Category ${i + 1} of ${categories.length}`} title={cat.label} sub={cat.subtitle} />
                <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 sm:p-6 shadow-card-glass">
                  <ScaleGuide scale={scale} className="mb-5" />
                  <div className="space-y-4">
                    {cat.questions.map((q) => (
                      <div
                        key={q.id}
                        className={`rounded-xl border ${missingQs.includes(q.id) ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'} overflow-hidden`}
                      >
                        <p className="px-4 pt-3 pb-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700/70">
                          {q.stem}
                        </p>
                        <div className="grid" style={{ gridTemplateColumns: `repeat(${scale.length}, minmax(0, 1fr))` }}>
                          {scale.map((opt) => {
                            const selected = answers[q.id] === opt.value;
                            return (
                              <button
                                key={opt.value}
                                onClick={() => {
                                  setAnswers({ ...answers, [q.id]: opt.value });
                                  setMissingQs((m) => m.filter((id) => id !== q.id));
                                }}
                                className={`py-3 px-1 text-center border-r last:border-r-0 border-slate-200 dark:border-slate-700/70 transition-colors ${
                                  selected ? 'bg-indigo-500 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-500'
                                }`}
                              >
                                <span className="block text-lg font-bold leading-none">{opt.value}</span>
                                <span className="block text-[11px] mt-1 opacity-90">{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {cat.reflectionPrompt && (
                    <div className="mt-5">
                      <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">{cat.reflectionPrompt}</label>
                      <textarea
                        maxLength={500}
                        value={reflections[cat.reflectionId] || ''}
                        onChange={(e) => setReflections({ ...reflections, [cat.reflectionId]: e.target.value })}
                        placeholder="Share a few honest thoughts…"
                        className={`${inputCls} min-h-[110px] resize-y`}
                      />
                      <div className="text-right text-xs text-slate-400 mt-1">{(reflections[cat.reflectionId] || '').length} / 500</div>
                    </div>
                  )}
                </div>

                <NavRow
                  onBack={() => go(prevStep)}
                  onNext={() => (isLast ? handleSubmit() : nextFromCategory(cat.id, categories[i + 1].id))}
                  nextLabel={isLast ? 'See My Results →' : 'Next →'}
                />
              </div>
            );
          })}

          {/* ── RESULTS ── */}
          {step === 'results' && (
            <ResultsView
              submitting={submitting}
              result={result}
              error={error}
              liveScores={liveScores}
              categories={result?.template?.categories || categories}
              max={result?.template?.scale?.length || scale.length}
              reflections={reflections}
              openCat={openCat}
              setOpenCat={setOpenCat}
              onRestart={restart}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors';

function ScaleGuide({ scale, className = '' }: { scale: ScaleOption[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {scale.map((s) => (
        <span
          key={s.value}
          className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 rounded-md px-2.5 py-1"
        >
          <strong className="text-slate-900 dark:text-white">{s.value}</strong> {s.label}
        </span>
      ))}
    </div>
  );
}

function SectionHeading({ label, title, sub }: { label: string; title: string; sub: string }) {
  return (
    <div>
      <span className="inline-block bg-indigo-500/15 text-indigo-300 text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded mb-2">
        {label}
      </span>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">{title}</h2>
      {sub && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function Field({
  label,
  required,
  error,
  errMsg,
  children,
}: {
  label: string;
  required?: boolean;
  error?: boolean;
  errMsg?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">
        {label} {required && <span className="text-indigo-400">*</span>}
      </label>
      {children}
      {error && errMsg && <span className="text-xs text-red-400">{errMsg}</span>}
    </div>
  );
}

function NavRow({ onBack, onNext, nextLabel }: { onBack: () => void; onNext: () => void; nextLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        onClick={onBack}
        className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-4 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 transition-colors"
      >
        ← Back
      </button>
      <button
        onClick={onNext}
        className="bg-btn-primary text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
      >
        {nextLabel}
      </button>
    </div>
  );
}

function ResultsView({
  submitting,
  result,
  error,
  liveScores,
  categories,
  max,
  reflections,
  openCat,
  setOpenCat,
  onRestart,
}: {
  submitting: boolean;
  result: LeadershipSnapshot | null;
  error: string | null;
  liveScores: LeadershipSnapshotCategoryScore[];
  categories: SnapshotTemplate['categories'];
  max: number;
  reflections: Record<string, string>;
  openCat: string | null;
  setOpenCat: (id: string | null) => void;
  onRestart: () => void;
}) {
  const scores = result?.category_scores?.length ? result.category_scores : liveScores;
  const overall = result?.overall_score ?? overallScore(liveScores);
  const nextSteps = result?.ai_category_next_steps || {};

  return (
    <div className="space-y-6">
      <SectionHeading label="Your Results" title="Leadership Snapshot" sub="A snapshot of your leadership health across each area." />

      <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 shadow-card-glass">
        <div className="flex items-center justify-between mb-5">
          <span className="text-sm text-slate-500 dark:text-slate-400">Overall</span>
          <span className="flex items-baseline gap-1">
            <span className={`text-3xl font-bold ${scoreColor(overall)}`}>{formatRating(overall, max)}</span>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">/ {max}</span>
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {scores.map((s) => (
            <div
              key={s.id}
              className={`rounded-xl border p-4 text-center ${s.isStrength ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">{s.label}</div>
              <div className="flex items-baseline justify-center gap-0.5">
                <span className={`text-2xl font-bold ${scoreColor(s.score)}`}>{formatRating(s.score, max)}</span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">/ {max}</span>
              </div>
              <span className={`inline-block mt-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${s.isStrength ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                {s.isStrength ? 'Strength' : 'Growth'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 shadow-card-glass">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">Your Personalized Summary</div>
        {submitting ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-8 h-8 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Generating your personalized results…</p>
          </div>
        ) : result?.ai_summary ? (
          <div className="space-y-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
            {result.ai_summary.split(/\n\n+/).map((p, idx) => <p key={idx}>{p}</p>)}
          </div>
        ) : (
          <p className="text-sm text-amber-400">
            We weren&apos;t able to generate your AI summary right now. Your scores above are still ready to share with your campus leader.
          </p>
        )}
      </div>

      {!submitting && (
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden shadow-card-glass">
          <div className="px-5 pt-5 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Drill into each area</div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700/60">
            {categories.map((cat) => {
              const s = scores.find((x) => x.id === cat.id);
              const open = openCat === cat.id;
              return (
                <div key={cat.id}>
                  <button
                    onClick={() => setOpenCat(open ? null : cat.id)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{cat.label}</span>
                    <span className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${scoreColor(s?.score ?? 0)}`}>{formatRating(s?.score ?? 0, max)}<span className="text-slate-500 font-medium"> / {max}</span></span>
                      <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </button>
                  {open && (
                    <div className="px-5 pb-5 space-y-3">
                      {reflections[cat.reflectionId]?.trim() && (
                        <div className="text-sm text-slate-500 dark:text-slate-400 italic border-l-2 border-slate-300 dark:border-slate-600 pl-3">
                          “{reflections[cat.reflectionId]}”
                        </div>
                      )}
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-400 mb-1">Suggested Next Steps</div>
                        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line">
                          {nextSteps[cat.id] || 'No AI suggestions were generated for this area.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!submitting && (
        <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 text-white">
          <h3 className="text-base font-semibold mb-2">What&apos;s next for you?</h3>
          <p className="text-sm text-indigo-100 leading-relaxed">
            Your results are a great conversation starter. Bring this snapshot to your next conversation with your campus leader.
          </p>
        </div>
      )}

      {!submitting && (
        <div className="flex justify-center">
          <button
            onClick={onRestart}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-4 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 transition-colors"
          >
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}
