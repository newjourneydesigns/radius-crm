import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ScorecardDimension } from '../lib/supabase';
import {
  CategoryEvaluation,
  AnswerValue,
  EvaluationQuestion,
  calculateSuggestedScore,
  EVALUATION_QUESTIONS,
  loadEvaluationQuestions,
  getFinalScore,
} from '../lib/evaluationQuestions';

export interface EvaluationState {
  [category: string]: CategoryEvaluation;
}

export const useEvaluation = () => {
  const [evaluations, setEvaluations] = useState<EvaluationState>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbQuestions, setDbQuestions] = useState<Record<ScorecardDimension, EvaluationQuestion[]>>(EVALUATION_QUESTIONS);
  const questionsLoadedRef = useRef(false);

  // Load questions from DB (with fallback to hardcoded)
  const loadQuestions = useCallback(async () => {
    if (questionsLoadedRef.current) return dbQuestions;
    try {
      const questions = await loadEvaluationQuestions();
      setDbQuestions(questions);
      questionsLoadedRef.current = true;
      return questions;
    } catch {
      return EVALUATION_QUESTIONS;
    }
  }, [dbQuestions]);

  const getQuestions = useCallback((category: ScorecardDimension): EvaluationQuestion[] => {
    return dbQuestions[category] || EVALUATION_QUESTIONS[category] || [];
  }, [dbQuestions]);

  const loadEvaluations = useCallback(async (leaderId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      // Load DB questions in parallel with evaluations
      const questionsPromise = loadQuestions();

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

      // Ensure questions are loaded
      await questionsPromise;

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
      if (!evaluation) {
        console.warn('No evaluation data for category:', category);
        return false;
      }

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

      // Use DB questions (fallback to hardcoded)
      const questions = dbQuestions[category] || EVALUATION_QUESTIONS[category];

      // Build a label map for question_text persistence
      const labelMap: Record<string, string> = {};
      for (const q of questions) {
        labelMap[q.key] = q.label;
      }

      // Upsert/delete answers — include question_text
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
                question_text: labelMap[q.key] || q.key,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'evaluation_id,question_key' }
            );
        }
      }

      // Also handle answers for question keys not in current questions (legacy)
      const questionKeys = new Set(questions.map(q => q.key));
      for (const [key, answer] of Object.entries(evaluation.answers)) {
        if (!questionKeys.has(key)) {
          if (answer === undefined || answer === null) {
            await supabase
              .from('leader_category_answers')
              .delete()
              .eq('evaluation_id', evalData.id)
              .eq('question_key', key);
          } else {
            await supabase
              .from('leader_category_answers')
              .upsert(
                {
                  evaluation_id: evalData.id,
                  question_key: key,
                  answer,
                  question_text: key,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'evaluation_id,question_key' }
              );
          }
        }
      }

      // Update the local state with the DB id
      setEvaluations(prev => ({
        ...prev,
        [category]: { ...prev[category], id: evalData.id, updated_at: new Date().toISOString() },
      }));

      // ── Always save scorecard as a note on the leader's profile ──
      const suggestedScore = calculateSuggestedScore(evaluation.answers);
      const finalScore = getFinalScore(evaluation.manual_override_score, suggestedScore, null);
      const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

      // Build the note content
      const answeredQuestions = questions.filter(q => evaluation.answers[q.key] === 'yes' || evaluation.answers[q.key] === 'no');
      const yesCount = answeredQuestions.filter(q => evaluation.answers[q.key] === 'yes').length;

      const noteLines: string[] = [];
      noteLines.push(`📋 Scorecard: ${categoryLabel} — Score: ${finalScore ?? 'N/A'}/5`);

      if (evaluation.manual_override_score !== null) {
        noteLines.push(`   ⚡ Manual override: ${evaluation.manual_override_score}/5`);
      }
      if (suggestedScore !== null) {
        noteLines.push(`   📊 Suggested: ${suggestedScore}/5 (${yesCount}/${answeredQuestions.length} yes)`);
      }

      noteLines.push('');

      if (answeredQuestions.length > 0) {
        for (const q of answeredQuestions) {
          const answerIcon = evaluation.answers[q.key] === 'yes' ? '✅' : '❌';
          noteLines.push(`   ${answerIcon} ${labelMap[q.key] || q.key}`);
        }
      }

      if (evaluation.context_notes) {
        noteLines.push('');
        noteLines.push(`   Notes: ${evaluation.context_notes}`);
      }

      const noteContent = noteLines.join('\n');

      if (user?.id) {
        const { error: noteError } = await supabase
          .from('notes')
          .insert({
            circle_leader_id: leaderId,
            content: noteContent,
            created_by: user.id,
          });
          
        if (noteError) {
          console.error('Error saving scorecard note:', noteError);
        }
      }

      return true;
    } catch (err: any) {
      console.error('Error saving evaluation:', err);
      setError(err.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [evaluations, dbQuestions]);

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
    dbQuestions,
    loadEvaluations,
    getEvaluation,
    getQuestions,
    updateAnswer,
    setOverride,
    setContextNotes,
    saveEvaluation,
    getSuggestedScore,
  };
};
