'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMarkCircleAppEntered } from '../../../../lib/circle-leader-toolkit/appEntered';
import {
  GROUP_SIZE_OPTIONS,
  computeCategoryScores,
  overallScore,
  STRENGTH_THRESHOLD,
  DEFAULT_TEMPLATE,
  formatRating,
  type SnapshotTemplate,
  type ScaleOption,
} from '../../../../lib/leadershipSnapshot';
import type { LeadershipSnapshot } from '../../../../lib/supabase';

type View = 'overview' | 'intro' | 'category' | 'results';

function scoreClass(score: number): string {
  if (score >= STRENGTH_THRESHOLD) return 'cs-score-strong';
  if (score >= 50) return 'cs-score-warn';
  return 'cs-score-low';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtDateStr(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Template a given snapshot was taken under (frozen), or the default. */
function snapTemplate(snap: LeadershipSnapshot): SnapshotTemplate {
  return (snap.template as SnapshotTemplate) || DEFAULT_TEMPLATE;
}

/** The rating scale max a snapshot was scored on (frozen, or inferred). */
function snapMax(snap: LeadershipSnapshot): number {
  return snapTemplate(snap).scale?.length || (snap.template_version === 1 ? 4 : 5);
}

export default function CircleSummaryHealthPage() {
  useMarkCircleAppEntered();

  const [loading, setLoading] = useState(true);
  const [snapshots, setSnapshots] = useState<LeadershipSnapshot[]>([]);
  const [template, setTemplate] = useState<SnapshotTemplate>(DEFAULT_TEMPLATE);
  const [formWindow, setFormWindow] = useState<{ isOpen: boolean; opensOn: string | null; closesOn: string | null }>({
    isOpen: true,
    opensOn: null,
    closesOn: null,
  });
  const [view, setView] = useState<View>('overview');
  const [catIndex, setCatIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [reflections, setReflections] = useState<Record<string, string>>({});
  const [groupSize, setGroupSize] = useState('');
  const [missingQs, setMissingQs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LeadershipSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories = template.categories;
  const scale = template.scale;

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/circle-leader-toolkit/health/', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.snapshots || []);
        if (data.template) setTemplate(data.template);
        if (data.window) setFormWindow(data.window);
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  function startAssessment() {
    if (!formWindow.isOpen) return;
    setAnswers({});
    setReflections({});
    setMissingQs([]);
    setResult(null);
    setError(null);
    setCatIndex(0);
    setView('intro');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goCategory(idx: number) {
    setCatIndex(idx);
    setView('category');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function nextFromCategory() {
    const cat = categories[catIndex];
    const missing = cat.questions.filter((q) => !answers[q.id]).map((q) => q.id);
    if (missing.length) {
      setMissingQs(missing);
      return;
    }
    setMissingQs([]);
    if (catIndex < categories.length - 1) {
      goCategory(catIndex + 1);
    } else {
      handleSubmit();
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setView('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const res = await fetch('/api/circle-leader-toolkit/health/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, reflections, group_size: groupSize || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong saving your snapshot.');
      } else {
        setResult(data.snapshot);
      }
    } catch {
      setError('Something went wrong saving your snapshot.');
    } finally {
      setSubmitting(false);
    }
  }

  async function finishResults() {
    await load();
    setResult(null);
    setView('overview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const liveScores = useMemo(() => computeCategoryScores(answers, template), [answers, template]);

  // Closed-window messaging (server is the source of truth for isOpen).
  const todayStr = new Date().toISOString().slice(0, 10);
  const reopensOn = formWindow.opensOn && formWindow.opensOn > todayStr ? formWindow.opensOn : null;
  const closedNote = reopensOn
    ? `The Leadership Snapshot reopens ${fmtDateStr(reopensOn)}.`
    : 'The Leadership Snapshot is currently closed.';

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="cs-card p-5 space-y-3">
          <div className="cs-skeleton h-4 w-2/3" />
          <div className="cs-skeleton h-3 w-full" />
          <div className="cs-skeleton h-3 w-5/6" />
          <div className="cs-skeleton h-20 w-full" />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {/* ── OVERVIEW ── */}
      {view === 'overview' && (
        <div className="space-y-4">
          {snapshots.length === 0 ? (
            <div className="cs-card text-center py-10 px-5">
              <div
                className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(52,178,51,0.12)' }}
              >
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="#1f7320" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="cs-step-title mb-2" style={{ fontSize: '1.4rem' }}>Leadership Snapshot</h1>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--cs-ink-soft)' }}>
                Take a few honest minutes to reflect on {categories.length} areas of leadership health. You&apos;ll get a
                personalized summary and next steps to spark a great conversation with your campus leader.
              </p>
              {formWindow.isOpen ? (
                <button onClick={startAssessment} className="cs-btn cs-btn-primary mt-5 w-full">
                  Start my Snapshot
                </button>
              ) : (
                <div className="cs-alert cs-alert-warning mt-5 text-left">{closedNote} Check back when it opens.</div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="cs-step-title" style={{ fontSize: '1.4rem' }}>Your Snapshot</h1>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--cs-muted)' }}>
                    Last taken {fmtDate(snapshots[0].created_at)}
                  </p>
                </div>
                {formWindow.isOpen ? (
                  <button onClick={startAssessment} className="cs-btn cs-btn-outline" style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}>
                    Reassess
                  </button>
                ) : (
                  <span className="cs-badge cs-badge-muted shrink-0">Closed</span>
                )}
              </div>

              {!formWindow.isOpen && (
                <div className="cs-alert cs-alert-warning">{closedNote} You can still review your results below.</div>
              )}

              <ResultsBlock snap={snapshots[0]} />

              {snapshots.length > 1 && (
                <div className="cs-card">
                  <div className="cs-label" style={{ marginBottom: '0.75rem' }}>Previous snapshots</div>
                  <div className="space-y-2">
                    {snapshots.slice(1).map((snap) => {
                      const open = expandedId === snap.id;
                      return (
                        <div key={snap.id} className="cs-drill">
                          <button
                            onClick={() => setExpandedId(open ? null : snap.id)}
                            className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left"
                          >
                            <span className="text-sm font-semibold">{fmtDate(snap.created_at)}</span>
                            <span className="flex items-center gap-2.5">
                              <span className="flex items-baseline gap-0.5">
                                <span className={`text-lg font-extrabold ${scoreClass(snap.overall_score)}`}>{formatRating(snap.overall_score, snapMax(snap))}</span>
                                <span className="text-xs font-semibold" style={{ color: 'var(--cs-muted)' }}>/ {snapMax(snap)}</span>
                              </span>
                              <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </span>
                          </button>
                          {open && (
                            <div className="px-3.5 pb-3.5 pt-1">
                              <ResultsBlock snap={snap} bare />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── INTRO (before starting) ── */}
      {view === 'intro' && (
        <div className="space-y-4">
          <div className="cs-card">
            <div className="cs-step">
              <span className="cs-step-num">✓</span>
              <span className="cs-step-title">Before you begin</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--cs-ink-soft)' }}>
              You&apos;ll rate yourself across {categories.length} areas using this scale, then add a short reflection for
              each. Answer honestly — there are no wrong answers.
            </p>
            <ScaleGuide scale={scale} className="mt-4" />
            <div className="mt-5">
              <label className="cs-label">How big is your Circle right now? <span style={{ color: 'var(--cs-muted)', fontWeight: 400 }}>(optional)</span></label>
              <select className="cs-select" value={groupSize} onChange={(e) => setGroupSize(e.target.value)}>
                <option value="">Select size…</option>
                {GROUP_SIZE_OPTIONS.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => setView('overview')} className="cs-btn cs-btn-ghost">← Back</button>
            <button onClick={() => goCategory(0)} className="cs-btn cs-btn-primary">Begin →</button>
          </div>
        </div>
      )}

      {/* ── CATEGORY ── */}
      {view === 'category' && categories[catIndex] && (() => {
        const cat = categories[catIndex];
        const isLast = catIndex === categories.length - 1;
        return (
          <div className="space-y-4">
            <div className="cs-card">
              <div className="cs-step">
                <span className="cs-step-num">{catIndex + 1}</span>
                <span className="cs-step-title">{cat.label}</span>
              </div>
              {cat.subtitle && <p className="text-sm -mt-1 mb-3" style={{ color: 'var(--cs-muted)' }}>{cat.subtitle}</p>}
              <ScaleGuide scale={scale} />

              <div className="mt-4 space-y-3.5">
                {cat.questions.map((q) => (
                  <div key={q.id}>
                    <p className="text-sm font-semibold mb-2" style={{ color: missingQs.includes(q.id) ? '#b91c1c' : 'var(--cs-ink)' }}>
                      {q.stem}
                    </p>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${scale.length}, minmax(0, 1fr))` }}>
                      {scale.map((opt) => {
                        const selected = answers[q.id] === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setAnswers({ ...answers, [q.id]: opt.value });
                              setMissingQs((m) => m.filter((id) => id !== q.id));
                            }}
                            className={`cs-rate ${selected ? 'is-selected' : ''}`}
                          >
                            <span className="cs-rate-num">{opt.value}</span>
                            <span className="cs-rate-label">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {cat.reflectionPrompt && (
                <div className="mt-5">
                  <label className="cs-label">{cat.reflectionPrompt}</label>
                  <textarea
                    className="cs-textarea"
                    maxLength={500}
                    value={reflections[cat.reflectionId] || ''}
                    onChange={(e) => setReflections({ ...reflections, [cat.reflectionId]: e.target.value })}
                    placeholder="Share a few honest thoughts…"
                  />
                  <div className="text-right text-xs mt-1" style={{ color: 'var(--cs-muted)' }}>
                    {(reflections[cat.reflectionId] || '').length} / 500
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => (catIndex === 0 ? setView('intro') : goCategory(catIndex - 1))}
                className="cs-btn cs-btn-ghost"
              >
                ← Back
              </button>
              <span className="text-xs font-semibold" style={{ color: 'var(--cs-muted)' }}>
                {catIndex + 1} of {categories.length}
              </span>
              <button onClick={nextFromCategory} className="cs-btn cs-btn-primary">
                {isLast ? 'See results →' : 'Next →'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── RESULTS (just submitted) ── */}
      {view === 'results' && (
        <div className="space-y-4">
          {submitting ? (
            <div className="cs-card text-center py-12">
              <div className="w-9 h-9 mx-auto mb-4 rounded-full border-[3px] border-neutral-200 animate-spin" style={{ borderTopColor: 'var(--cs-green)' }} />
              <p className="text-sm" style={{ color: 'var(--cs-ink-soft)' }}>Scoring your snapshot and writing your summary…</p>
            </div>
          ) : error ? (
            <>
              <div className="cs-alert cs-alert-error">{error}</div>
              <div className="cs-card">
                <p className="text-sm mb-3" style={{ color: 'var(--cs-ink-soft)' }}>
                  Here are your scores — they&apos;re saved and ready to share even though the summary didn&apos;t generate.
                </p>
                <ScoresGrid scores={liveScores} overall={overallScore(liveScores)} max={template.scale.length} bare />
              </div>
              <button onClick={finishResults} className="cs-btn cs-btn-primary w-full">Done</button>
            </>
          ) : result ? (
            <>
              <div className="cs-card cs-previous-notes">
                <div className="cs-previous-notes-label">Snapshot complete</div>
                <p className="cs-previous-notes-help">
                  Nice work. Bring this to your next conversation with your campus leader.
                </p>
              </div>
              <ResultsBlock snap={result} />
              <button onClick={finishResults} className="cs-btn cs-btn-primary w-full">Done</button>
            </>
          ) : null}
        </div>
      )}
    </main>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ScaleGuide({ scale, className = '' }: { scale: ScaleOption[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {scale.map((s) => (
        <span
          key={s.value}
          className="inline-flex items-center gap-1 text-xs rounded-md px-2 py-1"
          style={{ background: 'var(--cs-bg-soft)', border: '1px solid var(--cs-border)', color: 'var(--cs-ink-soft)' }}
        >
          <strong style={{ color: 'var(--cs-ink)' }}>{s.value}</strong> {s.label}
        </span>
      ))}
    </div>
  );
}

function ScoresGrid({
  scores,
  overall,
  max,
  bare,
}: {
  scores: { id: string; label: string; score: number; isStrength: boolean }[];
  overall: number;
  max: number;
  bare?: boolean;
}) {
  return (
    <div>
      {!bare && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm" style={{ color: 'var(--cs-muted)' }}>Overall</span>
          <span className="flex items-baseline gap-1">
            <span className={`text-3xl font-extrabold ${scoreClass(overall)}`}>{formatRating(overall, max)}</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--cs-muted)' }}>/ {max}</span>
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {scores.map((s) => (
          <div key={s.id} className={`cs-score-card ${s.isStrength ? 'strength' : 'growth'}`}>
            <div className="text-[0.62rem] font-bold uppercase tracking-wide leading-tight mb-1" style={{ color: 'var(--cs-muted)' }}>
              {s.label}
            </div>
            <div className="flex items-baseline justify-center gap-0.5">
              <span className={`text-2xl font-extrabold ${scoreClass(s.score)}`}>{formatRating(s.score, max)}</span>
              <span className="text-[0.7rem] font-semibold" style={{ color: 'var(--cs-muted)' }}>/ {max}</span>
            </div>
            <span className={`cs-badge mt-1.5 ${s.isStrength ? 'cs-badge-success' : 'cs-badge-warning'}`}>
              {s.isStrength ? 'Strength' : 'Growth'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultsBlock({ snap, bare }: { snap: LeadershipSnapshot; bare?: boolean }) {
  const [openCat, setOpenCat] = useState<string | null>(null);
  const scores = snap.category_scores || [];
  const nextSteps = snap.ai_category_next_steps || {};
  const cats = snapTemplate(snap).categories;
  const max = snapMax(snap);

  return (
    <div className={bare ? 'space-y-3' : 'space-y-4'}>
      <div className={bare ? '' : 'cs-card'}>
        <ScoresGrid scores={scores} overall={snap.overall_score} max={max} bare={bare} />
      </div>

      {snap.ai_summary && (
        <div className={bare ? '' : 'cs-card'}>
          <div className="cs-label" style={{ marginBottom: '0.6rem' }}>Your personalized summary</div>
          <div className="space-y-2 text-[0.95rem]" style={{ color: 'var(--cs-ink)', lineHeight: 1.7 }}>
            {snap.ai_summary.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>
      )}

      <div className={bare ? '' : 'cs-card'}>
        <div className="cs-label" style={{ marginBottom: '0.6rem' }}>Next steps by area</div>
        <div>
          {cats.map((cat) => {
            const s = scores.find((x) => x.id === cat.id);
            const open = openCat === cat.id;
            const reflection = snap.reflections?.[cat.reflectionId];
            const steps = nextSteps[cat.id];
            return (
              <div key={cat.id} className="cs-drill">
                <button
                  onClick={() => setOpenCat(open ? null : cat.id)}
                  className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left"
                >
                  <span className="text-sm font-semibold">{cat.label}</span>
                  <span className="flex items-center gap-2.5">
                    <span className="flex items-baseline gap-0.5">
                      <span className={`text-base font-extrabold ${scoreClass(s?.score ?? 0)}`}>{formatRating(s?.score ?? 0, max)}</span>
                      <span className="text-[0.7rem] font-semibold" style={{ color: 'var(--cs-muted)' }}>/ {max}</span>
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>
                {open && (
                  <div className="px-3.5 pb-3.5 space-y-2.5">
                    {reflection?.trim() && (
                      <p className="text-sm italic pl-3" style={{ color: 'var(--cs-muted)', borderLeft: '2px solid var(--cs-border)' }}>
                        “{reflection}”
                      </p>
                    )}
                    <div>
                      <div className="text-[0.7rem] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--cs-green-darker)' }}>
                        Suggested next steps
                      </div>
                      <p className="text-sm whitespace-pre-line" style={{ color: 'var(--cs-ink)', lineHeight: 1.6 }}>
                        {steps || 'No suggestions were generated for this area.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
