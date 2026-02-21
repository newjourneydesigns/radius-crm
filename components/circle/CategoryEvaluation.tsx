'use client';

import { useState } from 'react';
import { ScorecardDimension } from '../../lib/supabase';
import {
  EvaluationQuestion,
  EVALUATION_QUESTIONS,
  AnswerValue,
  calculateSuggestedScore,
  getFinalScore,
} from '../../lib/evaluationQuestions';
import SuggestedNextSteps from './SuggestedNextSteps';

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
    </div>
  );
}
