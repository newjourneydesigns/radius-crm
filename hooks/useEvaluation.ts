import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ScorecardDimension } from '../lib/supabase';
import {
  CategoryEvaluation,
  AnswerValue,
  calculateSuggestedScore,
  EVALUATION_QUESTIONS,
} from '../lib/evaluationQuestions';

export interface EvaluationState {
  [category: string]: CategoryEvaluation;
}

export const useEvaluation = () => {
  const [evaluations, setEvaluations] = useState<EvaluationState>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvaluations = useCallback(async (leaderId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('leader_category_evaluations')
        .select('*')
        .eq('leader_id', leaderId);

      if (fetchError) {
        console.error('Error loading evaluations:', fetchError);
        setError(fetchError.message);
        return;
      }

      // Fetch all answers for these evaluations
      const evalIds = (data || []).map((e: any) => e.id);
      let answers: any[] = [];

      if (evalIds.length > 0) {
        const { data: answerData } = await supabase
          .from('leader_category_answers')
          .select('*')
          .in('evaluation_id', evalIds);
        answers = answerData || [];
      }

      // Group answers by evaluation
      const answersByEval: Record<number, Record<string, AnswerValue>> = {};
      for (const a of answers) {
        if (!answersByEval[a.evaluation_id]) answersByEval[a.evaluation_id] = {};
        answersByEval[a.evaluation_id][a.question_key] = a.answer as AnswerValue;
      }

      // Build state
      const state: EvaluationState = {};
      for (const e of (data || [])) {
        state[e.category] = {
          id: e.id,
          leader_id: e.leader_id,
          category: e.category as ScorecardDimension,
          manual_override_score: e.manual_override_score,
          context_notes: e.context_notes || '',
          answers: answersByEval[e.id] || {},
          updated_at: e.updated_at || e.created_at || undefined,
        };
      }

      setEvaluations(state);
    } catch (err: any) {
      console.error('Error loading evaluations:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getEvaluation = useCallback((category: ScorecardDimension): CategoryEvaluation => {
    return evaluations[category] || {
      leader_id: 0,
      category,
      manual_override_score: null,
      context_notes: '',
      answers: {},
    };
  }, [evaluations]);

  const updateAnswer = useCallback((
    category: ScorecardDimension,
    leaderId: number,
    questionKey: string,
    answer: AnswerValue
  ) => {
    setEvaluations(prev => {
      const existing = prev[category] || {
        leader_id: leaderId,
        category,
        manual_override_score: null,
        context_notes: '',
        answers: {},
      };

      const newAnswers = { ...existing.answers };
      if (answer === null) {
        delete newAnswers[questionKey];
      } else {
        newAnswers[questionKey] = answer;
      }

      return {
        ...prev,
        [category]: { ...existing, leader_id: leaderId, answers: newAnswers },
      };
    });
  }, []);

  const setOverride = useCallback((category: ScorecardDimension, leaderId: number, score: number | null) => {
    setEvaluations(prev => {
      const existing = prev[category] || {
        leader_id: leaderId,
        category,
        manual_override_score: null,
        context_notes: '',
        answers: {},
      };
      return {
        ...prev,
        [category]: { ...existing, leader_id: leaderId, manual_override_score: score },
      };
    });
  }, []);

  const setContextNotes = useCallback((category: ScorecardDimension, leaderId: number, notes: string) => {
    setEvaluations(prev => {
      const existing = prev[category] || {
        leader_id: leaderId,
        category,
        manual_override_score: null,
        context_notes: '',
        answers: {},
      };
      return {
        ...prev,
        [category]: { ...existing, leader_id: leaderId, context_notes: notes },
      };
    });
  }, []);

  const saveEvaluation = useCallback(async (leaderId: number, category: ScorecardDimension) => {
    setIsSaving(true);
    setError(null);
    try {
      const evaluation = evaluations[category];
      if (!evaluation) return false;

      const { data: { user } } = await supabase.auth.getUser();

      // Upsert evaluation
      const { data: evalData, error: evalError } = await supabase
        .from('leader_category_evaluations')
        .upsert(
          {
            leader_id: leaderId,
            category,
            manual_override_score: evaluation.manual_override_score,
            context_notes: evaluation.context_notes || null,
            evaluated_by: user?.id || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'leader_id,category' }
        )
        .select()
        .single();

      if (evalError) {
        console.error('Error saving evaluation:', evalError);
        setError(evalError.message);
        return false;
      }

      // Upsert/delete answers
      const questions = EVALUATION_QUESTIONS[category];
      for (const q of questions) {
        const answer = evaluation.answers[q.key];
        if (answer === undefined || answer === null) {
          // Delete if exists
          await supabase
            .from('leader_category_answers')
            .delete()
            .eq('evaluation_id', evalData.id)
            .eq('question_key', q.key);
        } else {
          await supabase
            .from('leader_category_answers')
            .upsert(
              {
                evaluation_id: evalData.id,
                question_key: q.key,
                answer,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'evaluation_id,question_key' }
            );
        }
      }

      // Update the local state with the DB id
      setEvaluations(prev => ({
        ...prev,
        [category]: { ...prev[category], id: evalData.id },
      }));

      return true;
    } catch (err: any) {
      console.error('Error saving evaluation:', err);
      setError(err.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [evaluations]);

  const getSuggestedScore = useCallback((category: ScorecardDimension): number | null => {
    const evaluation = evaluations[category];
    if (!evaluation) return null;
    return calculateSuggestedScore(evaluation.answers);
  }, [evaluations]);

  return {
    evaluations,
    isLoading,
    isSaving,
    error,
    loadEvaluations,
    getEvaluation,
    updateAnswer,
    setOverride,
    setContextNotes,
    saveEvaluation,
    getSuggestedScore,
  };
};
