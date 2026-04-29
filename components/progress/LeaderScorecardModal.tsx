'use client';

import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import CategoryEvaluation from '../circle/CategoryEvaluation';
import { useEvaluation } from '../../hooks/useEvaluation';
import { ScorecardDimension } from '../../lib/supabase';

const DIMENSIONS = [
  {
    key: 'reach' as ScorecardDimension,
    label: 'Reach',
    color: '#3b82f6',
    textClass: 'text-blue-400',
    activeClass: 'border-blue-500 text-blue-400',
  },
  {
    key: 'connect' as ScorecardDimension,
    label: 'Connect',
    color: '#22c55e',
    textClass: 'text-green-400',
    activeClass: 'border-green-500 text-green-400',
  },
  {
    key: 'disciple' as ScorecardDimension,
    label: 'Disciple',
    color: '#a855f7',
    textClass: 'text-purple-400',
    activeClass: 'border-purple-500 text-purple-400',
  },
  {
    key: 'develop' as ScorecardDimension,
    label: 'Develop',
    color: '#f97316',
    textClass: 'text-orange-400',
    activeClass: 'border-orange-500 text-orange-400',
  },
];

interface Props {
  leaderId: number;
  leaderName: string;
  initialDimension: ScorecardDimension;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function LeaderScorecardModal({
  leaderId,
  leaderName,
  initialDimension,
  isOpen,
  onClose,
  onSaved,
}: Props) {
  const [activeDim, setActiveDim] = useState<ScorecardDimension>(initialDimension);

  const {
    loadEvaluations,
    getEvaluation,
    getQuestions,
    updateAnswer,
    setOverride,
    setContextNotes,
    saveEvaluation,
    isSaving,
    isLoading,
  } = useEvaluation();

  useEffect(() => {
    if (isOpen) {
      setActiveDim(initialDimension);
      loadEvaluations(leaderId);
    }
  }, [isOpen, leaderId, initialDimension, loadEvaluations]);

  const dim = DIMENSIONS.find(d => d.key === activeDim)!;
  const evalData = getEvaluation(activeDim);

  const handleSave = async () => {
    const ok = await saveEvaluation(leaderId, activeDim);
    if (ok) onSaved();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={leaderName} size="xl">
      {/* Dimension tabs */}
      <div className="flex gap-0.5 border-b border-slate-700 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-4">
        {DIMENSIONS.map(d => (
          <button
            key={d.key}
            onClick={() => setActiveDim(d.key)}
            className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors duration-150 ${
              activeDim === d.key
                ? d.activeClass
                : 'border-transparent text-slate-400 hover:text-white hover:border-slate-600'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : (
        <CategoryEvaluation
          leaderId={leaderId}
          category={activeDim}
          label={dim.label}
          color={dim.color}
          textClass={dim.textClass}
          answers={evalData.answers}
          manualOverride={evalData.manual_override_score}
          contextNotes={evalData.context_notes}
          existingScore={null}
          questions={getQuestions(activeDim)}
          onAnswerChange={(qKey, answer) => updateAnswer(activeDim, leaderId, qKey, answer)}
          onOverrideChange={(score) => setOverride(activeDim, leaderId, score)}
          onContextChange={(notes) => setContextNotes(activeDim, leaderId, notes)}
          onSave={handleSave}
          onClose={onClose}
          isSaving={isSaving}
        />
      )}
    </Modal>
  );
}
