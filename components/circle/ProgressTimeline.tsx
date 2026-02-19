'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase, type CircleLeaderScore } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ── Category configuration ──────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'reach_score',   label: 'Reach',    color: '#3B82F6', bg: 'bg-blue-500',   ring: 'ring-blue-500',   text: 'text-blue-600 dark:text-blue-400'   },
  { key: 'connect_score', label: 'Connect',  color: '#10B981', bg: 'bg-emerald-500', ring: 'ring-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'disciple_score',label: 'Disciple', color: '#8B5CF6', bg: 'bg-violet-500',  ring: 'ring-violet-500',  text: 'text-violet-600 dark:text-violet-400'  },
  { key: 'develop_score', label: 'Develop',  color: '#F59E0B', bg: 'bg-amber-500',   ring: 'ring-amber-500',   text: 'text-amber-600 dark:text-amber-400'   },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatScoreDate = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

// ── Score dot button ─────────────────────────────────────────────────────────
const ScoreDot: React.FC<{
  value: number;
  selected: boolean;
  color: string;
  onClick: () => void;
}> = ({ value, selected, color, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={`Score ${value}`}
    className={`w-9 h-9 rounded-full text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 dark:focus:ring-offset-gray-800 ${
      selected
        ? 'text-white shadow-lg scale-110'
        : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
    }`}
    style={selected ? { backgroundColor: color, borderColor: color } : undefined}
  >
    {value}
  </button>
);

// ── SVG line chart ────────────────────────────────────────────────────────────
const CHART_W = 560;
const CHART_H = 180;
const PAD = { top: 12, right: 20, bottom: 40, left: 30 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

const scoreToY = (score: number) =>
  PAD.top + PLOT_H - ((score - 1) / 4) * PLOT_H;

const ScoreChart: React.FC<{ scores: CircleLeaderScore[] }> = ({ scores }) => {
  if (scores.length === 0) return null;

  // Sort chronologically
  const sorted = [...scores].sort(
    (a, b) => new Date(a.scored_date).getTime() - new Date(b.scored_date).getTime()
  );

  const xStep = sorted.length === 1 ? 0 : PLOT_W / (sorted.length - 1);
  const xOf = (i: number) => PAD.left + (sorted.length === 1 ? PLOT_W / 2 : i * xStep);

  // Format date label
  const fmtDate = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full h-auto"
      aria-label="Circle Leader Progress Timeline chart"
      role="img"
    >
      {/* Y-axis grid lines & labels */}
      {[1, 2, 3, 4, 5].map(v => {
        const y = scoreToY(v);
        return (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={CHART_W - PAD.right}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={10}
              fill="currentColor"
              opacity={0.5}
            >
              {v}
            </text>
          </g>
        );
      })}

      {/* X-axis date labels */}
      {sorted.map((s, i) => (
        <text
          key={s.id}
          x={xOf(i)}
          y={CHART_H - 6}
          textAnchor="middle"
          fontSize={9}
          fill="currentColor"
          opacity={0.55}
        >
          {fmtDate(s.scored_date)}
        </text>
      ))}

      {/* Lines & dots for each category */}
      {CATEGORIES.map(cat => {
        const pts = sorted
          .map((s, i) => {
            const val = s[cat.key as CategoryKey];
            if (val == null) return null;
            return { x: xOf(i), y: scoreToY(val as number), val };
          })
          .filter(Boolean) as { x: number; y: number; val: number }[];

        if (pts.length === 0) return null;

        const path = pts
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`)
          .join(' ');

        return (
          <g key={cat.key}>
            {pts.length > 1 && (
              <path
                d={path}
                fill="none"
                stroke={cat.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {pts.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={4}
                fill={cat.color}
                stroke="white"
                strokeWidth={1.5}
              >
                <title>{`${cat.label}: ${p.val}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
interface ProgressTimelineProps {
  leaderId: number;
}

export const ProgressTimeline: React.FC<ProgressTimelineProps> = ({ leaderId }) => {
  const { user } = useAuth();

  const [scores, setScores] = useState<CircleLeaderScore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form state
  const emptyForm = () => ({
    reach_score: null as number | null,
    connect_score: null as number | null,
    disciple_score: null as number | null,
    develop_score: null as number | null,
    notes: '',
    scored_date: new Date().toISOString().split('T')[0],
  });
  const [form, setForm] = useState(emptyForm());

  // ── Load scores ──────────────────────────────────────────────────────────
  const loadScores = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('circle_leader_scores')
        .select('*')
        .eq('circle_leader_id', leaderId)
        .order('scored_date', { ascending: false });

      if (data && !error) setScores(data);
    } catch (e) {
      console.error('Error loading scores:', e);
    } finally {
      setIsLoading(false);
    }
  }, [leaderId]);

  useEffect(() => { loadScores(); }, [loadScores]);

  // ── Save score ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    const { reach_score, connect_score, disciple_score, develop_score, notes, scored_date } = form;

    if (!reach_score && !connect_score && !disciple_score && !develop_score) {
      setError('Please enter at least one score before saving.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const { data, error: dbError } = await supabase
        .from('circle_leader_scores')
        .insert({
          circle_leader_id: leaderId,
          scored_by: user?.id ?? null,
          reach_score: reach_score ?? null,
          connect_score: connect_score ?? null,
          disciple_score: disciple_score ?? null,
          develop_score: develop_score ?? null,
          notes: notes.trim() || null,
          scored_date,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setScores(prev => [data, ...prev]);
      setForm(emptyForm());
      setShowForm(false);
      setSuccessMsg('Score saved!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      console.error('Error saving score:', e);
      setError((e as Error)?.message || 'Failed to save score. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete score ─────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!confirm('Delete this score entry?')) return;
    const { error: dbError } = await supabase
      .from('circle_leader_scores')
      .delete()
      .eq('id', id);
    if (!dbError) setScores(prev => prev.filter(s => s.id !== id));
  };

  // ── Latest scores ────────────────────────────────────────────────────────
  const latest = scores[0] ?? null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow mt-8">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Circle Leader Progress Timeline
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Reach · Connect · Disciple · Develop (scored 1–5)
          </p>
        </div>
        <button
          onClick={() => { setShowForm(f => !f); setError(''); }}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          {showForm ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Score
            </>
          )}
        </button>
      </div>

      <div className="p-4 sm:p-6 space-y-6">

        {/* ── Add Score Form ─────────────────────────────────────────── */}
        {showForm && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">New Score Entry</h3>

            {/* Date */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Date
              </label>
              <input
                type="date"
                value={form.scored_date}
                onChange={e => setForm(f => ({ ...f, scored_date: e.target.value }))}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Score rows */}
            <div className="space-y-3">
              {CATEGORIES.map(cat => (
                <div key={cat.key} className="flex items-center gap-3">
                  <span className={`w-20 text-sm font-medium ${cat.text}`}>{cat.label}</span>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map(v => (
                      <ScoreDot
                        key={v}
                        value={v}
                        selected={form[cat.key as CategoryKey] === v}
                        color={cat.color}
                        onClick={() =>
                          setForm(f => ({
                            ...f,
                            [cat.key]: f[cat.key as CategoryKey] === v ? null : v,
                          }))
                        }
                      />
                    ))}
                  </div>
                  {form[cat.key as CategoryKey] != null && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {form[cat.key as CategoryKey]}/5
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Notes <span className="font-normal">(optional)</span>
              </label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Any observations or context..."
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Saving…' : 'Save Score'}
            </button>
          </div>
        )}

        {successMsg && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{successMsg}</p>
        )}

        {/* ── Loading ────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">Loading…</div>
        ) : scores.length === 0 ? (
          <div className="text-center py-10">
            <svg className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No scores recorded yet.</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Click <strong>Add Score</strong> to get started.</p>
          </div>
        ) : (
          <>
            {/* ── Latest score summary cards ──────────────────────── */}
            {latest && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                  Latest ({formatScoreDate(latest.scored_date)})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {CATEGORIES.map(cat => {
                    const val = latest[cat.key as CategoryKey] as number | null | undefined;
                    return (
                      <div
                        key={cat.key}
                        className="flex flex-col items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 py-3 px-2"
                      >
                        <span className={`text-xs font-semibold uppercase tracking-wide ${cat.text} mb-1`}>
                          {cat.label}
                        </span>
                        {val != null ? (
                          <>
                            <span className="text-2xl font-bold text-gray-900 dark:text-white">{val}</span>
                            <div className="flex gap-0.5 mt-1">
                              {[1, 2, 3, 4, 5].map(d => (
                                <div
                                  key={d}
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: d <= val ? cat.color : '#374151' }}
                                />
                              ))}
                            </div>
                          </>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Chart (only visible when there are 2+ entries) ──── */}
            {scores.length >= 2 && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                  Score History
                </p>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mb-3">
                  {CATEGORIES.map(cat => (
                    <div key={cat.key} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="text-xs text-gray-500 dark:text-gray-400">{cat.label}</span>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <ScoreChart scores={scores} />
                </div>
              </div>
            )}

            {/* ── History list ─────────────────────────────────────── */}
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                All Entries ({scores.length})
              </p>
              <div className="space-y-2">
                {scores.map(s => (
                  <div
                    key={s.id}
                    className="flex items-start justify-between gap-4 border border-gray-100 dark:border-gray-700 rounded-lg px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span className="text-xs text-gray-500 dark:text-gray-400 mr-1 font-medium">
                          {formatScoreDate(s.scored_date)}
                        </span>
                        {CATEGORIES.map(cat => {
                          const val = s[cat.key as CategoryKey] as number | null | undefined;
                          if (val == null) return null;
                          return (
                            <span key={cat.key} className="flex items-center gap-1">
                              <span className={`text-xs font-semibold ${cat.text}`}>{cat.label}</span>
                              <span className="text-xs font-bold text-gray-900 dark:text-white">{val}</span>
                            </span>
                          );
                        })}
                      </div>
                      {s.notes && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">{s.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="Delete this score entry"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H8a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProgressTimeline;
