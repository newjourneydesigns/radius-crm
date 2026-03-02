'use client';

import { useState } from 'react';
import { AnswerValue, EvaluationQuestion } from '../../lib/evaluationQuestions';
import { getNextStepsForCategory, NextStepItem } from '../../lib/nextStepsSuggestions';
import { ScorecardDimension } from '../../lib/supabase';

interface SuggestedNextStepsProps {
  answers: Record<string, AnswerValue>;
  questions: EvaluationQuestion[];
  color: string;
  textClass: string;
  leaderId: number;
  category: ScorecardDimension;
  onAddToCoaching?: (leaderId: number, category: ScorecardDimension, content: string) => Promise<any>;
}

export default function SuggestedNextSteps({
  answers,
  questions,
  color,
  textClass,
  leaderId,
  category,
  onAddToCoaching,
}: SuggestedNextStepsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());

  const steps = getNextStepsForCategory(answers, questions);

  // Don't render anything if there are no answered questions
  if (steps.length === 0) return null;

  const noSteps = steps.filter(s => s.answerType === 'no');
  const unsureSteps = steps.filter(s => s.answerType === 'unsure');
  const yesSteps = steps.filter(s => s.answerType === 'yes');

  const handleAddToCoaching = async (step: NextStepItem) => {
    if (!onAddToCoaching || addedKeys.has(step.questionKey)) return;
    setAddingKey(step.questionKey);
    try {
      const prefix = step.answerType === 'no' ? '📋 Growth Area' : step.answerType === 'unsure' ? '🤔 Needs Clarity' : '🚀 Next Level';
      const content = `${prefix}: ${step.nextStep}`;
      await onAddToCoaching(leaderId, category, content);
      setAddedKeys(prev => new Set(prev).add(step.questionKey));
    } catch (err) {
      console.error('Error adding to coaching:', err);
    } finally {
      setAddingKey(null);
    }
  };

  const renderStep = (step: NextStepItem) => {
    const isAdding = addingKey === step.questionKey;
    const isAdded = addedKeys.has(step.questionKey);
    const isGrowth = step.answerType === 'no';
    const isUnsure = step.answerType === 'unsure';

    return (
      <div
        key={step.questionKey}
        className="flex gap-2.5 p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/30"
      >
        <div
          className="mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isGrowth ? 'rgba(239,68,68,0.15)' : isUnsure ? 'rgba(245,158,11,0.15)' : `${color}20` }}
        >
          {isGrowth ? (
            <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          ) : isUnsure ? (
            <svg className="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01" />
            </svg>
          ) : (
            <svg className="w-3 h-3" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 leading-tight mb-0.5">
            {step.questionLabel}
          </p>
          <p className="text-sm text-gray-200 leading-snug">
            {step.nextStep}
          </p>
          {onAddToCoaching && (
            <button
              onClick={() => handleAddToCoaching(step)}
              disabled={isAdding || isAdded}
              className="score-btn mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md transition-all disabled:opacity-60"
              style={{
                '--score-bg': isAdded ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                '--score-color': isAdded ? '#22c55e' : 'rgba(255,255,255,0.5)',
                '--score-border': isAdded ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)',
                '--score-shadow': 'none',
              } as React.CSSProperties}
            >
              {isAdded ? (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Added to Coaching
                </>
              ) : isAdding ? (
                'Adding...'
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Add to Coaching
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-3 border-b border-gray-700/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="score-btn flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wide w-full mb-1"
        style={{
          '--score-bg': 'transparent',
          '--score-color': 'inherit',
          '--score-border': 'transparent',
          '--score-shadow': 'none',
        } as React.CSSProperties}
      >
        <svg
          className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 5l7 7-7 7"
          />
        </svg>
        <span>Suggested Next Steps</span>
        <span
          className="ml-auto text-[10px] font-normal normal-case tracking-normal rounded-full px-1.5 py-0.5"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {steps.length}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-4">
          {/* Growth areas (from "no" answers) */}
          {noSteps.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-red-400/70 font-medium mb-1.5 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                Growth Areas ({noSteps.length})
              </p>
              <div className="space-y-2">
                {noSteps.map(renderStep)}
              </div>
            </div>
          )}

          {/* Needs clarity (from "unsure" answers) */}
          {unsureSteps.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-amber-400/70 font-medium mb-1.5 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01" />
                </svg>
                Needs Clarity ({unsureSteps.length})
              </p>
              <div className="space-y-2">
                {unsureSteps.map(renderStep)}
              </div>
            </div>
          )}

          {/* Keep pushing (from "yes" answers) */}
          {yesSteps.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide font-medium mb-1.5 flex items-center gap-1" style={{ color: `${color}99` }}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                Keep Growing ({yesSteps.length})
              </p>
              <div className="space-y-2">
                {yesSteps.map(renderStep)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
