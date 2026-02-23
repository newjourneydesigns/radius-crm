'use client';

import { useState, useEffect } from 'react';
import { useScorecard } from '../../hooks/useScorecard';
import { useEvaluation } from '../../hooks/useEvaluation';
import { useDevelopmentProspects } from '../../hooks/useDevelopmentProspects';
import { ScorecardDimension } from '../../lib/supabase';
import { calculateSuggestedScore, getFinalScore } from '../../lib/evaluationQuestions';
import CategoryEvaluation from './CategoryEvaluation';

const DIMENSIONS = [
  { key: 'reach' as const, label: 'Reach', color: '#3b82f6', bgClass: 'bg-blue-500/10 border-blue-500/30', textClass: 'text-blue-400' },
  { key: 'connect' as const, label: 'Connect', color: '#22c55e', bgClass: 'bg-green-500/10 border-green-500/30', textClass: 'text-green-400' },
  { key: 'disciple' as const, label: 'Disciple', color: '#a855f7', bgClass: 'bg-purple-500/10 border-purple-500/30', textClass: 'text-purple-400' },
  { key: 'develop' as const, label: 'Develop', color: '#f97316', bgClass: 'bg-orange-500/10 border-orange-500/30', textClass: 'text-orange-400' },
];

interface ScorecardSectionProps {
  leaderId: number;
  isAdmin: boolean;
  onNoteSaved?: () => void;
  onAddToCoaching?: (leaderId: number, category: ScorecardDimension, content: string) => Promise<any>;
}

export default function ScorecardSection({ leaderId, isAdmin, onNoteSaved, onAddToCoaching }: ScorecardSectionProps) {
  const { ratings, isLoading, loadRatings, submitScores, updateScore, deleteScore, getLatestScores, getTrend } = useScorecard();
  const { prospects, loadAll: loadProspects } = useDevelopmentProspects();
  const {
    isLoading: evalLoading,
    isSaving: evalSaving,
    loadEvaluations,
    getEvaluation,
    getQuestions,
    updateAnswer,
    setOverride,
    setContextNotes,
    saveEvaluation,
    getSuggestedScore,
  } = useEvaluation();

  const [isRating, setIsRating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [scores, setScores] = useState({ reach_score: 3, connect_score: 3, disciple_score: 3, develop_score: 3 });
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeDimension, setActiveDimension] = useState<ScorecardDimension | null>(null);

  useEffect(() => {
    loadRatings(leaderId);
    loadEvaluations(leaderId);
    loadProspects(leaderId);
  }, [leaderId, loadRatings, loadEvaluations, loadProspects]);

  const latestScores = getLatestScores();
  const trend = getTrend();

  // Compute effective scores: use direct scores if available, otherwise fall back to evaluation scores
  const effectiveScores = (() => {
    const dims: Array<'reach' | 'connect' | 'disciple' | 'develop'> = ['reach', 'connect', 'disciple', 'develop'];
    const hasDirectScores = latestScores.reach !== null;

    const result: Record<string, number | null> = {};
    let total = 0;
    let count = 0;
    let latestUpdated: string | null = null;

    for (const dim of dims) {
      const evalData = getEvaluation(dim);
      const suggested = getSuggestedScore(dim);
      const directScore = latestScores[dim];
      const finalScore = getFinalScore(
        evalData.manual_override_score,
        suggested,
        directScore
      );
      result[dim] = finalScore;
      if (finalScore !== null) {
        total += finalScore;
        count++;
      }
      // Track most recent evaluation update
      if (evalData.updated_at) {
        if (!latestUpdated || evalData.updated_at > latestUpdated) {
          latestUpdated = evalData.updated_at;
        }
      }
    }

    return {
      reach: result.reach,
      connect: result.connect,
      disciple: result.disciple,
      develop: result.develop,
      average: count > 0 ? Math.round((total / count) * 10) / 10 : null,
      hasDirectScores,
      hasAnyScore: count > 0,
      lastEvalUpdated: latestUpdated,
    };
  })();

  // Determine the best "last updated" date
  const lastUpdatedDate = latestScores.scoredDate || effectiveScores.lastEvalUpdated;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    if (editingId) {
      await updateScore(editingId, leaderId, { ...scores, notes: note || undefined });
    } else {
      await submitScores(leaderId, scores, note || undefined);
    }
    setIsSubmitting(false);
    setIsRating(false);
    setEditingId(null);
    setNote('');
    setScores({ reach_score: 3, connect_score: 3, disciple_score: 3, develop_score: 3 });
  };

  const handleEdit = (rating: typeof ratings[0]) => {
    setScores({
      reach_score: rating.reach_score,
      connect_score: rating.connect_score,
      disciple_score: rating.disciple_score,
      develop_score: rating.develop_score,
    });
    setNote(rating.notes || '');
    setEditingId(rating.id);
    setIsRating(true);
    setActiveDimension(null);
  };

  const handleCancelEdit = () => {
    setIsRating(false);
    setEditingId(null);
    setNote('');
    setScores({ reach_score: 3, connect_score: 3, disciple_score: 3, develop_score: 3 });
  };

  const handleDelete = async (ratingId: number) => {
    setDeletingId(ratingId);
    await deleteScore(ratingId, leaderId);
    if (editingId === ratingId) {
      handleCancelEdit();
    }
    setDeletingId(null);
  };

  const renderTrendArrow = (delta: number) => {
    if (delta > 0) return <span className="text-green-400 text-xs ml-1">↑ +{delta}</span>;
    if (delta < 0) return <span className="text-red-400 text-xs ml-1">↓ {delta}</span>;
    return <span className="text-gray-500 text-xs ml-1">→</span>;
  };

  const renderScoreDots = (score: number | null, color: string) => {
    return (
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className="w-3 h-3 rounded-full transition-all"
            style={{
              backgroundColor: score !== null && i <= score ? color : 'rgba(255,255,255,0.1)',
              boxShadow: score !== null && i <= score ? `0 0 6px ${color}40` : 'none',
            }}
          />
        ))}
      </div>
    );
  };

  const renderScoreSelector = (key: string, value: number, color: string, onChange: (v: number) => void) => {
    return (
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(i => {
          const isSelected = i <= value;
          const isExact = i === value;
          return (
            <button
              key={i}
              onClick={() => onChange(i)}
              className="score-btn w-9 h-9 rounded-full text-sm font-bold transition-all hover:scale-110"
              style={{
                '--score-bg': isSelected ? color : 'rgba(255,255,255,0.05)',
                '--score-color': isSelected ? '#fff' : 'rgba(255,255,255,0.3)',
                '--score-border': isExact ? '#fff' : isSelected ? color : 'rgba(255,255,255,0.1)',
                '--score-shadow': isSelected ? `0 0 12px ${color}60` : 'none',
                transform: isExact ? 'scale(1.15)' : undefined,
              } as React.CSSProperties}
            >
              {i}
            </button>
          );
        })}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4">
            <div className="h-4 bg-gray-700 rounded w-1/3"></div>
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-gray-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Progress Scorecard</h2>
          {lastUpdatedDate && (
            <p className="text-xs text-gray-500 mt-0.5">
              Last updated: {new Date(lastUpdatedDate.length <= 10 ? lastUpdatedDate + 'T00:00:00' : lastUpdatedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {effectiveScores.average !== null && (
            <div className="flex items-center">
              <span className="text-2xl font-bold text-white">{effectiveScores.average}</span>
              <span className="text-xs text-gray-400 ml-1">/5</span>
              {effectiveScores.hasDirectScores && renderTrendArrow(trend.average)}
            </div>
          )}

        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* Active Evaluation Drill-down */}
        {activeDimension !== null ? (() => {
          const dim = DIMENSIONS.find(d => d.key === activeDimension)!;
          const evalData = getEvaluation(activeDimension);
          const existingScore = latestScores[activeDimension] ?? null;
          return (
            <CategoryEvaluation
              leaderId={leaderId}
              category={activeDimension}
              label={dim.label}
              color={dim.color}
              textClass={dim.textClass}
              answers={evalData.answers}
              manualOverride={evalData.manual_override_score}
              contextNotes={evalData.context_notes}
              existingScore={existingScore}
              questions={getQuestions(activeDimension)}
              onAnswerChange={(qKey, answer) => updateAnswer(activeDimension, leaderId, qKey, answer)}
              onOverrideChange={(score) => setOverride(activeDimension, leaderId, score)}
              onContextChange={(notes) => setContextNotes(activeDimension, leaderId, notes)}
              onSave={async () => { await saveEvaluation(leaderId, activeDimension); onNoteSaved?.(); }}
              onClose={() => setActiveDimension(null)}
              isSaving={evalSaving}
              onAddToCoaching={onAddToCoaching}
            />
          );
        })() : (
          <>
            {/* Current Scores Grid */}
            {effectiveScores.hasAnyScore ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {DIMENSIONS.map(dim => {
                  const score = effectiveScores[dim.key] as number | null;
                  const delta = effectiveScores.hasDirectScores ? trend[dim.key] : 0;
                  const evalData = getEvaluation(dim.key);
                  const suggested = getSuggestedScore(dim.key);
                  const answeredCount = Object.values(evalData.answers).filter(a => a === 'yes' || a === 'no').length;
                  const totalQuestions = getQuestions(dim.key).length;
                  const isFromEval = !effectiveScores.hasDirectScores && score !== null;

                  return (
                    <div
                      key={dim.key}
                      className={`p-3 sm:p-4 rounded-xl border ${dim.bgClass} ${
                        isAdmin ? 'cursor-pointer hover:border-white/20 hover:bg-white/5 transition-all group' : ''
                      }`}
                      onClick={() => isAdmin && setActiveDimension(dim.key)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-semibold ${dim.textClass}`}>{dim.label}</span>
                        <div className="flex items-center">
                          {effectiveScores.hasDirectScores && renderTrendArrow(delta)}
                          {isAdmin && (
                            <svg className="w-4 h-4 text-gray-600 group-hover:text-gray-400 ml-1 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-white">{score ?? '—'}</span>
                        {renderScoreDots(score, dim.color)}
                      </div>
                      {/* Score source and evaluation details */}
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        {answeredCount > 0 && (
                          <span className="text-[10px] text-gray-500">
                            {answeredCount}/{totalQuestions} answered
                          </span>
                        )}
                        {evalData.manual_override_score !== null && (
                          <span className="text-[10px] text-amber-400/60" title="Manual override">⚡ Override</span>
                        )}
                        {isFromEval && !evalData.manual_override_score && (
                          <span className="text-[10px] text-gray-600">via evaluation</span>
                        )}
                        {evalData.updated_at && (
                          <span className="text-[10px] text-gray-600">
                            {new Date(evalData.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                      {isAdmin && score === null && (
                        <p className="text-[10px] text-gray-600 mt-1 group-hover:text-gray-400 transition-colors">
                          Tap to evaluate
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-gray-400 text-sm">No scores yet</p>
                {isAdmin && (
                  <div>
                    <p className="text-gray-500 text-xs mt-1">Tap a category to evaluate</p>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-4">
                      {DIMENSIONS.map(dim => (
                        <div
                          key={dim.key}
                          className={`p-3 sm:p-4 rounded-xl border ${dim.bgClass} cursor-pointer hover:border-white/20 hover:bg-white/5 transition-all group`}
                          onClick={() => setActiveDimension(dim.key)}
                        >
                          <span className={`text-sm font-semibold ${dim.textClass}`}>{dim.label}</span>
                          <p className="text-[10px] text-gray-600 mt-1 group-hover:text-gray-400 transition-colors">
                            Tap to evaluate
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Development Prospects Summary */}
            {prospects.filter(p => p.is_active).length > 0 && (
              <div className="mt-4 p-3 sm:p-4 rounded-xl border border-orange-500/20 bg-orange-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm font-semibold text-orange-400">Being Developed</span>
                  <span className="text-xs text-gray-500">({prospects.filter(p => p.is_active).length})</span>
                </div>
                <div className="space-y-1.5">
                  {prospects.filter(p => p.is_active).map(prospect => (
                    <div key={prospect.id} className="flex items-start gap-2">
                      <span className="text-sm text-white font-medium">{prospect.name}</span>
                      {prospect.notes && (
                        <span className="text-xs text-gray-400 italic mt-0.5">— {prospect.notes}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

        {/* Rating Form */}
        {isRating && (
          <div className="mt-6 p-4 bg-gray-900/50 rounded-xl border border-gray-700">
            <h3 className="text-sm font-semibold text-white mb-4">{editingId ? 'Edit Rating' : 'New Rating'}</h3>
            <div className="space-y-4">
              {DIMENSIONS.map(dim => (
                <div key={dim.key} className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${dim.textClass}`}>{dim.label}</span>
                  {renderScoreSelector(
                    dim.key,
                    scores[`${dim.key}_score` as keyof typeof scores],
                    dim.color,
                    (v) => setScores(prev => ({ ...prev, [`${dim.key}_score`]: v }))
                  )}
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add context for this rating..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none"
                  rows={2}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-sm rounded-lg transition-colors"
                >
                  {isSubmitting ? 'Saving...' : editingId ? 'Update Rating' : 'Save Rating'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Score History */}
        {ratings.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center text-sm text-gray-400 hover:text-white transition-colors"
            >
              <svg
                className={`w-4 h-4 mr-1 transition-transform ${showHistory ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
              Score History ({ratings.length} {ratings.length === 1 ? 'entry' : 'entries'})
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {ratings.map(rating => {
                  const avg = ((rating.reach_score + rating.connect_score + rating.disciple_score + rating.develop_score) / 4);
                  return (
                    <div key={rating.id} className={`p-3 bg-gray-900/40 rounded-lg border ${editingId === rating.id ? 'border-blue-500/50' : 'border-gray-700/50'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">
                          {new Date(rating.scored_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-white">{avg.toFixed(1)} avg</span>
                          {isAdmin && (
                            <div className="flex items-center gap-1 ml-1">
                              <button
                                onClick={() => handleEdit(rating)}
                                className="score-btn p-1 rounded hover:bg-blue-500/20 transition-colors group"
                                title="Edit this rating"
                                style={{ '--score-bg': 'transparent', '--score-color': 'inherit', '--score-border': 'transparent', '--score-shadow': 'none' } as React.CSSProperties}
                              >
                                <svg className="w-3.5 h-3.5 text-gray-500 group-hover:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm('Delete this rating? This cannot be undone.')) {
                                    handleDelete(rating.id);
                                  }
                                }}
                                disabled={deletingId === rating.id}
                                className="score-btn p-1 rounded hover:bg-red-500/20 transition-colors group disabled:opacity-50"
                                title="Delete this rating"
                                style={{ '--score-bg': 'transparent', '--score-color': 'inherit', '--score-border': 'transparent', '--score-shadow': 'none' } as React.CSSProperties}
                              >
                                <svg className="w-3.5 h-3.5 text-gray-500 group-hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-3 text-xs">
                        {DIMENSIONS.map(dim => (
                          <span key={dim.key} className={dim.textClass}>
                            {dim.label}: {rating[`${dim.key}_score` as keyof typeof rating]}
                          </span>
                        ))}
                      </div>
                      {rating.notes && (
                        <p className="text-xs text-gray-500 mt-1 italic">{rating.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
          </>
        )}      </div>
    </div>
  );
}