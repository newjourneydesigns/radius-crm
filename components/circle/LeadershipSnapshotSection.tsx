'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import Modal from '../ui/Modal';
import { useLeadershipSnapshots } from '../../hooks/useLeadershipSnapshots';
import { STRENGTH_THRESHOLD, computeCategoryScores, DEFAULT_TEMPLATE, formatRating, pctToRating, type SnapshotTemplate } from '../../lib/leadershipSnapshot';
import type { LeadershipSnapshot, LeadershipSnapshotRevision } from '../../lib/supabase';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const CAT_COLORS = ['#6366f1', '#22c55e', '#a855f7', '#f97316', '#06b6d4'];

function scoreColor(score: number): string {
  if (score >= STRENGTH_THRESHOLD) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Template a given snapshot was taken under (frozen), or the default. */
function tplOf(snap: LeadershipSnapshot): SnapshotTemplate {
  return (snap.template as SnapshotTemplate) || DEFAULT_TEMPLATE;
}

/** The rating scale max a snapshot was scored on (frozen, or inferred). */
function snapMax(snap: LeadershipSnapshot): number {
  return tplOf(snap).scale?.length || (snap.template_version === 1 ? 4 : 5);
}

interface Props {
  leaderId: number;
  isAdmin: boolean;
}

export default function LeadershipSnapshotSection({ leaderId, isAdmin }: Props) {
  const { snapshots, isLoading, loadForLeader, confirmLink, update, loadOne, revert } = useLeadershipSnapshots();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<LeadershipSnapshot | null>(null);
  const [historyFor, setHistoryFor] = useState<LeadershipSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => loadForLeader(leaderId), [leaderId, loadForLeader]);

  useEffect(() => {
    reload();
  }, [reload]);

  const chronological = useMemo(
    () => [...snapshots].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [snapshots]
  );

  const chartData = useMemo(() => {
    if (chronological.length < 2) return null;
    const labels = chronological.map((s) => fmtDate(s.created_at));
    const datasets = [
      {
        label: 'Overall',
        data: chronological.map((s) => pctToRating(s.overall_score, snapMax(s))),
        borderColor: '#e2e8f0',
        backgroundColor: 'rgba(226,232,240,0.1)',
        borderWidth: 3,
        tension: 0.3,
        pointRadius: 4,
      },
      ...tplOf(chronological[chronological.length - 1]).categories.map((cat, i) => ({
        label: cat.label,
        data: chronological.map((s) => {
          const p = s.category_scores?.find((c) => c.id === cat.id)?.score;
          return p == null ? null : pctToRating(p, snapMax(s));
        }),
        borderColor: CAT_COLORS[i % CAT_COLORS.length],
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 3,
        spanGaps: true,
      })),
    ];
    return { labels, datasets };
  }, [chronological]);

  const chartMax = useMemo(() => Math.max(5, ...snapshots.map(snapMax)), [snapshots]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: { color: 'rgba(255,255,255,0.7)', usePointStyle: true, pointStyle: 'circle' as const, padding: 12, font: { size: 10 } },
        },
        tooltip: {
          backgroundColor: 'rgba(17,24,39,0.95)',
          callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y ?? '—'} / ${chartMax}` },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 }, maxRotation: 45 } },
        y: { min: 0, max: chartMax, ticks: { stepSize: 1, color: 'rgba(255,255,255,0.5)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
      },
    }),
    [chartMax]
  );

  async function handleConfirm(snap: LeadershipSnapshot) {
    setBusy(true);
    await confirmLink(snap.id, leaderId);
    await reload();
    setBusy(false);
  }

  if (isLoading && snapshots.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center py-12 px-6 shadow-card-glass">
        <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
        <p className="text-slate-400 text-sm">No Leadership Snapshots yet.</p>
        <p className="text-slate-500 text-xs mt-1">Submissions matched to this leader will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Trend */}
      {chartData && (
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 shadow-card-glass">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Score Trends ({chronological.length} snapshots)</h3>
          <div style={{ height: 240 }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      )}

      {/* History list (newest first) */}
      {snapshots.map((snap) => {
        const open = expanded === snap.id;
        return (
          <div key={snap.id} className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-card-glass overflow-hidden">
            <button
              onClick={() => setExpanded(open ? null : snap.id)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{fmtDate(snap.created_at)}</span>
                  {snap.version > 1 && <span className="text-[10px] text-slate-500">edited · v{snap.version}</span>}
                  {!snap.leader_link_confirmed && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">Needs confirm</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 truncate">
                  {snap.respondent_name || '—'} · {snap.role || '—'}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="flex items-baseline gap-0.5">
                  <span className={`text-xl font-bold ${scoreColor(snap.overall_score)}`}>{formatRating(snap.overall_score, snapMax(snap))}</span>
                  <span className="text-xs font-medium text-slate-500">/ {snapMax(snap)}</span>
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {open && (
              <div className="px-5 pb-5 space-y-4 border-t border-slate-200 dark:border-slate-700/60 pt-4">
                {/* Category chips */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {(snap.category_scores || []).map((c) => (
                    <div key={c.id} className={`rounded-lg border p-2.5 text-center ${c.isStrength ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
                      <div className="text-[10px] text-slate-400 leading-tight mb-1">{c.label}</div>
                      <div className={`text-base font-bold ${scoreColor(c.score)}`}>{formatRating(c.score, snapMax(snap))}<span className="text-[0.7rem] font-medium text-slate-500"> / {snapMax(snap)}</span></div>
                    </div>
                  ))}
                </div>

                {/* AI summary */}
                {snap.ai_summary && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Summary</div>
                    <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed space-y-2">
                      {snap.ai_summary.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}
                    </div>
                  </div>
                )}

                {/* Per-category reflections + next steps */}
                <div className="space-y-3">
                  {tplOf(snap).categories.map((cat) => {
                    const reflection = snap.reflections?.[cat.reflectionId];
                    const steps = snap.ai_category_next_steps?.[cat.id];
                    if (!reflection && !steps) return null;
                    return (
                      <div key={cat.id} className="rounded-lg bg-slate-50 dark:bg-slate-700/30 p-3">
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{cat.label}</div>
                        {reflection && <p className="text-xs text-slate-500 dark:text-slate-400 italic mb-1.5">“{reflection}”</p>}
                        {steps && (
                          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line">
                            <span className="text-indigo-400 font-semibold">Next steps: </span>
                            {steps}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Admin actions */}
                {isAdmin && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!snap.leader_link_confirmed && (
                      <button
                        onClick={() => handleConfirm(snap)}
                        disabled={busy}
                        className="bg-btn-success text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        Confirm link to this leader
                      </button>
                    )}
                    <button onClick={() => setEditing(snap)} className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                      Edit
                    </button>
                    <button onClick={() => setHistoryFor(snap)} className="text-slate-400 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs transition-colors">
                      Version history
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {editing && (
        <EditSnapshotModal
          snapshot={editing}
          onClose={() => setEditing(null)}
          onSave={async (changes) => {
            await update(editing.id, changes);
            await reload();
            setEditing(null);
          }}
        />
      )}

      {historyFor && (
        <HistoryModal
          snapshot={historyFor}
          loadOne={loadOne}
          onRevert={async (version) => {
            await revert(historyFor.id, version);
            await reload();
            setHistoryFor(null);
          }}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

// ── Edit modal ──────────────────────────────────────────────────────────────
function EditSnapshotModal({
  snapshot,
  onClose,
  onSave,
}: {
  snapshot: LeadershipSnapshot;
  onClose: () => void;
  onSave: (changes: Record<string, any>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({ ...snapshot.answers });
  const [reflections, setReflections] = useState<Record<string, string>>({ ...snapshot.reflections });
  const [regenerate, setRegenerate] = useState(false);
  const [saving, setSaving] = useState(false);

  const template = tplOf(snapshot);
  const liveScores = computeCategoryScores(answers, template);

  async function save() {
    setSaving(true);
    await onSave({ answers, reflections, regenerate });
    setSaving(false);
  }

  return (
    <Modal isOpen onClose={onClose} title="Edit Snapshot" size="xl">
      <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
        {template.categories.map((cat) => {
          const live = liveScores.find((c) => c.id === cat.id);
          return (
            <div key={cat.id} className="rounded-lg border border-slate-700 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white">{cat.label}</span>
                <span className={`text-sm font-bold ${scoreColor(live?.score ?? 0)}`}>{formatRating(live?.score ?? 0, template.scale.length)}<span className="text-slate-500 font-medium"> / {template.scale.length}</span></span>
              </div>
              <div className="space-y-2">
                {cat.questions.map((q) => (
                  <div key={q.id}>
                    <p className="text-xs text-slate-300 mb-1">{q.stem}</p>
                    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${template.scale.length}, minmax(0, 1fr))` }}>
                      {template.scale.map((opt) => {
                        const sel = answers[q.id] === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => setAnswers({ ...answers, [q.id]: opt.value })}
                            className={`py-1.5 rounded text-xs font-medium transition-colors ${sel ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                          >
                            {opt.value}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <textarea
                value={reflections[cat.reflectionId] || ''}
                onChange={(e) => setReflections({ ...reflections, [cat.reflectionId]: e.target.value })}
                placeholder="Reflection…"
                maxLength={500}
                className="mt-2 w-full bg-slate-700 border border-slate-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y min-h-[60px]"
              />
            </div>
          );
        })}

        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={regenerate} onChange={(e) => setRegenerate(e.target.checked)} className="rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-indigo-500" />
          Regenerate AI summary &amp; next steps (uses Gemini quota)
        </label>
      </div>

      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-700">
        <button onClick={onClose} className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors">Cancel</button>
        <button onClick={save} disabled={saving} className="bg-btn-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Modal>
  );
}

// ── Version history modal ────────────────────────────────────────────────────
function HistoryModal({
  snapshot,
  loadOne,
  onRevert,
  onClose,
}: {
  snapshot: LeadershipSnapshot;
  loadOne: (id: string) => Promise<{ snapshot: LeadershipSnapshot; revisions: LeadershipSnapshotRevision[] } | null>;
  onRevert: (version: number) => Promise<void>;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<LeadershipSnapshotRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [revertingTo, setRevertingTo] = useState<number | null>(null);

  useEffect(() => {
    loadOne(snapshot.id).then((res) => {
      if (res) setRevisions(res.revisions);
      setLoading(false);
    });
  }, [snapshot.id, loadOne]);

  return (
    <Modal isOpen onClose={onClose} title="Version History" size="md">
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : revisions.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No revision history.</p>
      ) : (
        <div className="space-y-2">
          {revisions.map((rev) => {
            const isCurrent = rev.version === snapshot.version;
            const revertedFrom = (rev.data as any)?._reverted_from_version;
            return (
              <div key={rev.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">
                    Version {rev.version}
                    {isCurrent && <span className="ml-2 text-[10px] uppercase tracking-wide bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">Current</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {fmtDate(rev.created_at)}
                    {revertedFrom ? ` · reverted from v${revertedFrom}` : ''}
                  </div>
                </div>
                {!isCurrent && (
                  <button
                    onClick={async () => {
                      setRevertingTo(rev.version);
                      await onRevert(rev.version);
                    }}
                    disabled={revertingTo !== null}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
                  >
                    {revertingTo === rev.version ? 'Reverting…' : 'Revert to this'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
