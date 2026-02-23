'use client';

import { useState, useEffect } from 'react';
import { ScorecardDimension } from '../../lib/supabase';
import {
  EvaluationQuestion,
  EVALUATION_QUESTIONS,
  AnswerValue,
  calculateSuggestedScore,
  getFinalScore,
} from '../../lib/evaluationQuestions';
import SuggestedNextSteps from './SuggestedNextSteps';
import { useDevelopmentProspects } from '../../hooks/useDevelopmentProspects';

interface CategoryEvaluationProps {
  leaderId: number;
  category: ScorecardDimension;
  label: string;
  color: string;
  textClass: string;
  answers: Record<string, AnswerValue>;
  manualOverride: number | null;
  contextNotes: string;
  existingScore: number | null;
  questions?: EvaluationQuestion[];
  onAnswerChange: (questionKey: string, answer: AnswerValue) => void;
  onOverrideChange: (score: number | null) => void;
  onContextChange: (notes: string) => void;
  onSave: () => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
  onAddToCoaching?: (leaderId: number, category: ScorecardDimension, content: string) => Promise<any>;
}

export default function CategoryEvaluation({
  leaderId,
  category,
  label,
  color,
  textClass,
  answers,
  manualOverride,
  contextNotes,
  existingScore,
  questions: questionsProp,
  onAnswerChange,
  onOverrideChange,
  onContextChange,
  onSave,
  onClose,
  isSaving,
  onAddToCoaching,
}: CategoryEvaluationProps) {
  const questions = questionsProp || EVALUATION_QUESTIONS[category];
  const suggestedScore = calculateSuggestedScore(answers);
  const finalScore = getFinalScore(manualOverride, suggestedScore, existingScore);
  const isOverridden = manualOverride !== null;

  const answeredCount = Object.values(answers).filter(a => a === 'yes' || a === 'no').length;
  const yesCount = Object.values(answers).filter(a => a === 'yes').length;

  const [showAllQuestions, setShowAllQuestions] = useState(true);

  // Development prospects — only used when category is 'develop'
  const {
    prospects, loadAll: loadProspects,
    addProspect, updateProspect, toggleActive, deleteProspect,
  } = useDevelopmentProspects();

  const [newProspectName, setNewProspectName] = useState('');
  const [newProspectNotes, setNewProspectNotes] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editingProspectId, setEditingProspectId] = useState<number | null>(null);
  const [editProspectName, setEditProspectName] = useState('');
  const [editProspectNotes, setEditProspectNotes] = useState('');
  const [confirmDeleteProspect, setConfirmDeleteProspect] = useState<number | null>(null);

  useEffect(() => {
    if (category === 'develop') {
      loadProspects(leaderId);
    }
  }, [category, leaderId, loadProspects]);

  const activeProspects = prospects.filter(p => p.is_active);
  const inactiveProspects = prospects.filter(p => !p.is_active);

  const handleAddProspect = async () => {
    if (!newProspectName.trim()) return;
    await addProspect(leaderId, newProspectName, newProspectNotes || undefined);
    setNewProspectName('');
    setNewProspectNotes('');
  };

  const handleStartEditProspect = (prospect: { id: number; name: string; notes?: string }) => {
    setEditingProspectId(prospect.id);
    setEditProspectName(prospect.name);
    setEditProspectNotes(prospect.notes || '');
  };

  const handleSaveEditProspect = async () => {
    if (!editingProspectId || !editProspectName.trim()) return;
    await updateProspect(editingProspectId, { name: editProspectName, notes: editProspectNotes || undefined }, leaderId);
    setEditingProspectId(null);
  };

  const handleDeleteProspect = (id: number) => {
    if (confirmDeleteProspect === id) {
      deleteProspect(id);
      setConfirmDeleteProspect(null);
    } else {
      setConfirmDeleteProspect(id);
      setTimeout(() => setConfirmDeleteProspect(null), 3000);
    }
  };

  const formatProspectDate = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleAnswerTap = (questionKey: string, currentAnswer: AnswerValue, newAnswer: 'yes' | 'no') => {
    // If tapping the same answer, clear it (toggle to unanswered)
    if (currentAnswer === newAnswer) {
      onAnswerChange(questionKey, null);
    } else {
      onAnswerChange(questionKey, newAnswer);
    }
  };

  return (
    <div className="bg-gray-900/60 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="score-btn p-1 rounded hover:bg-gray-700/50 transition-colors"
            style={{ '--score-bg': 'transparent', '--score-color': 'inherit', '--score-border': 'transparent', '--score-shadow': 'none' } as React.CSSProperties}
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className={`text-base font-semibold ${textClass}`}>{label}</h3>
        </div>
        <button
          onClick={onSave}
          disabled={isSaving}
          className="score-btn px-3 py-1.5 text-sm rounded-lg transition-colors font-medium"
          style={{
            '--score-bg': color,
            '--score-color': '#fff',
            '--score-border': color,
            '--score-shadow': `0 0 8px ${color}40`,
          } as React.CSSProperties}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Score Display */}
      <div className="px-4 py-4 flex items-center gap-4 border-b border-gray-700/30">
        {/* Final Score */}
        <div className="text-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: color, boxShadow: `0 0 20px ${color}40` }}
          >
            {finalScore ?? '—'}
          </div>
          <span className="text-[10px] text-gray-500 mt-1 block">SCORE</span>
        </div>

        {/* Score details */}
        <div className="flex-1 space-y-1">
          {suggestedScore !== null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Suggested:</span>
              <span className="text-sm font-semibold text-white">{suggestedScore}/5</span>
              <span className="text-[10px] text-gray-600">
                ({yesCount}/{answeredCount} yes)
              </span>
            </div>
          )}
          {isOverridden && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400/80">⚡ Score manually set</span>
              <button
                onClick={() => onOverrideChange(null)}
                className="score-btn text-[10px] text-gray-500 hover:text-red-400 underline transition-colors"
                style={{ '--score-bg': 'transparent', '--score-color': 'inherit', '--score-border': 'transparent', '--score-shadow': 'none' } as React.CSSProperties}
              >
                clear
              </button>
            </div>
          )}
          {!isOverridden && suggestedScore === null && existingScore !== null && (
            <span className="text-xs text-gray-500">Using previous score</span>
          )}
          {!isOverridden && suggestedScore === null && existingScore === null && (
            <span className="text-xs text-gray-500">Answer questions or set score below</span>
          )}
        </div>
      </div>

      {/* Manual Override */}
      <div className="px-4 py-3 border-b border-gray-700/30">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Override Score</span>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map(i => {
              const isActive = manualOverride === i;
              return (
                <button
                  key={i}
                  onClick={() => onOverrideChange(isActive ? null : i)}
                  className="score-btn w-8 h-8 rounded-full text-xs font-bold transition-all"
                  style={{
                    '--score-bg': isActive ? color : 'rgba(255,255,255,0.05)',
                    '--score-color': isActive ? '#fff' : 'rgba(255,255,255,0.3)',
                    '--score-border': isActive ? '#fff' : 'rgba(255,255,255,0.1)',
                    '--score-shadow': isActive ? `0 0 10px ${color}50` : 'none',
                    transform: isActive ? 'scale(1.1)' : undefined,
                  } as React.CSSProperties}
                >
                  {i}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="px-4 py-3 border-b border-gray-700/30">
        <button
          onClick={() => setShowAllQuestions(!showAllQuestions)}
          className="score-btn flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wide w-full mb-2"
          style={{ '--score-bg': 'transparent', '--score-color': 'inherit', '--score-border': 'transparent', '--score-shadow': 'none' } as React.CSSProperties}
        >
          <svg
            className={`w-3 h-3 transition-transform ${showAllQuestions ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
          Observations ({answeredCount}/{questions.length} answered)
        </button>

        {showAllQuestions && (
          <div className="space-y-1.5">
            {questions.map(q => {
              const currentAnswer = answers[q.key] || null;
              return (
                <div
                  key={q.key}
                  className="flex items-center gap-2 py-1.5 group"
                >
                  {/* Yes/No buttons */}
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleAnswerTap(q.key, currentAnswer, 'yes')}
                      className={`score-btn w-10 h-7 rounded text-[11px] font-semibold transition-all ${
                        currentAnswer === 'yes' ? '' : 'opacity-40 hover:opacity-70'
                      }`}
                      style={{
                        '--score-bg': currentAnswer === 'yes' ? '#22c55e' : 'rgba(255,255,255,0.05)',
                        '--score-color': currentAnswer === 'yes' ? '#fff' : 'rgba(255,255,255,0.5)',
                        '--score-border': currentAnswer === 'yes' ? '#22c55e' : 'rgba(255,255,255,0.1)',
                        '--score-shadow': 'none',
                      } as React.CSSProperties}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => handleAnswerTap(q.key, currentAnswer, 'no')}
                      className={`score-btn w-10 h-7 rounded text-[11px] font-semibold transition-all ${
                        currentAnswer === 'no' ? '' : 'opacity-40 hover:opacity-70'
                      }`}
                      style={{
                        '--score-bg': currentAnswer === 'no' ? '#ef4444' : 'rgba(255,255,255,0.05)',
                        '--score-color': currentAnswer === 'no' ? '#fff' : 'rgba(255,255,255,0.5)',
                        '--score-border': currentAnswer === 'no' ? '#ef4444' : 'rgba(255,255,255,0.1)',
                        '--score-shadow': 'none',
                      } as React.CSSProperties}
                    >
                      No
                    </button>
                  </div>
                  {/* Label */}
                  <span className={`text-xs leading-tight ${
                    currentAnswer !== null ? 'text-gray-300' : 'text-gray-500'
                  }`}>
                    {q.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Suggested Next Steps — based on answered questions */}
      <SuggestedNextSteps
        answers={answers}
        questions={questions}
        color={color}
        textClass={textClass}
        leaderId={leaderId}
        category={category}
        onAddToCoaching={onAddToCoaching}
      />

      {/* Context Notes */}
      <div className="px-4 py-3">
        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Context Notes</label>
        <textarea
          value={contextNotes}
          onChange={(e) => onContextChange(e.target.value)}
          placeholder="Why this score? Observations, context, pastoral notes..."
          className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-sm text-white placeholder-gray-600 focus:border-blue-500/50 focus:outline-none resize-none"
          rows={3}
        />
      </div>

      {/* Developing Leaders — only for Develop category */}
      {category === 'develop' && (
        <div className="px-4 py-3 border-t border-gray-700/30">
          <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">
            Who Is Being Developed
            {activeProspects.length > 0 && (
              <span className="ml-1.5 text-orange-400">({activeProspects.length})</span>
            )}
          </label>

          {/* Add form */}
          <div className="space-y-2 mb-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newProspectName}
                onChange={e => setNewProspectName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddProspect()}
                placeholder="Person's name..."
                className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-sm text-white placeholder-gray-600 focus:border-orange-500/50 focus:outline-none transition-all"
              />
              <button
                onClick={handleAddProspect}
                disabled={!newProspectName.trim()}
                className="score-btn px-3 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  '--score-bg': color,
                  '--score-color': '#fff',
                  '--score-border': color,
                  '--score-shadow': `0 0 8px ${color}40`,
                } as React.CSSProperties}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            {newProspectName.trim() && (
              <textarea
                value={newProspectNotes}
                onChange={e => setNewProspectNotes(e.target.value)}
                placeholder="Notes (optional)..."
                rows={2}
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-sm text-white placeholder-gray-600 focus:border-orange-500/50 focus:outline-none resize-none"
              />
            )}
          </div>

          {/* Active prospects */}
          {activeProspects.length === 0 && inactiveProspects.length === 0 && (
            <p className="text-xs text-gray-600 text-center py-3">No one being developed yet</p>
          )}

          <div className="space-y-2">
            {activeProspects.map(prospect => (
              <div key={prospect.id} className="bg-gray-800/40 rounded-lg border border-gray-700/40 p-2.5">
                {editingProspectId === prospect.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editProspectName}
                      onChange={e => setEditProspectName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:border-orange-500/50 focus:outline-none"
                    />
                    <textarea
                      value={editProspectNotes}
                      onChange={e => setEditProspectNotes(e.target.value)}
                      placeholder="Notes..."
                      rows={2}
                      className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-600 focus:border-orange-500/50 focus:outline-none resize-none"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingProspectId(null)}
                        className="px-2.5 py-1 text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEditProspect}
                        disabled={!editProspectName.trim()}
                        className="score-btn px-2.5 py-1 text-xs font-medium rounded-lg disabled:opacity-30"
                        style={{
                          '--score-bg': color,
                          '--score-color': '#fff',
                          '--score-border': color,
                          '--score-shadow': 'none',
                        } as React.CSSProperties}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}30` }}>
                          <span className="text-[9px] font-bold" style={{ color }}>
                            {prospect.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-white truncate">{prospect.name}</span>
                      </div>
                      {prospect.notes && (
                        <p className="text-xs text-gray-400 mt-1 ml-7 whitespace-pre-wrap">{prospect.notes}</p>
                      )}
                      <p className="text-[10px] text-gray-600 mt-0.5 ml-7">Added {formatProspectDate(prospect.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => handleStartEditProspect(prospect)} className="p-1 text-gray-500 hover:text-orange-400 transition-colors" title="Edit">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => toggleActive(prospect.id)} className="p-1 text-gray-500 hover:text-yellow-400 transition-colors" title="Mark inactive">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteProspect(prospect.id)}
                        className={`p-1 transition-colors ${confirmDeleteProspect === prospect.id ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}
                        title={confirmDeleteProspect === prospect.id ? 'Click again to delete' : 'Delete'}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Inactive toggle */}
          {inactiveProspects.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowInactive(!showInactive)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                <svg className={`w-3 h-3 transition-transform ${showInactive ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
                {inactiveProspects.length} inactive
              </button>
              {showInactive && (
                <div className="space-y-1.5 mt-2">
                  {inactiveProspects.map(prospect => (
                    <div key={prospect.id} className="bg-gray-900/20 rounded-lg border border-gray-700/30 p-2.5 opacity-50">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-gray-700/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-bold text-gray-500">{prospect.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <span className="text-sm text-gray-400 line-through truncate">{prospect.name}</span>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button onClick={() => toggleActive(prospect.id)} className="p-1 text-gray-500 hover:text-orange-400 transition-colors" title="Reactivate">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteProspect(prospect.id)}
                            className={`p-1 transition-colors ${confirmDeleteProspect === prospect.id ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
