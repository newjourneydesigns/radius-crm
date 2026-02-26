import { useState, useCallback } from 'react';
import { supabase, ScorecardDimension } from '../lib/supabase';

export interface ScoreHistoryEntry {
  id: number;
  circle_leader_id: number;
  dimension: ScorecardDimension;
  score: number;
  source: 'evaluation' | 'direct' | 'override';
  recorded_at: string;
  recorded_by: string | null;
}

export const useScoreHistory = () => {
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadHistory = useCallback(async (leaderId: number) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('scorecard_score_history')
        .select('*')
        .eq('circle_leader_id', leaderId)
        .order('recorded_at', { ascending: true });

      if (error) {
        // Table may not exist yet — silently ignore
        console.warn('Score history load error (table may not exist yet):', error.message);
        setHistory([]);
        return [];
      }

      setHistory(data || []);
      return data || [];
    } catch (err) {
      console.warn('Score history load error:', err);
      setHistory([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const recordScore = useCallback(async (
    leaderId: number,
    dimension: ScorecardDimension,
    score: number,
    source: 'evaluation' | 'direct' | 'override' = 'evaluation'
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('scorecard_score_history')
        .insert({
          circle_leader_id: leaderId,
          dimension,
          score,
          source,
          recorded_by: user?.id || null,
        });

      if (error) {
        console.warn('Score history insert error:', error.message);
        return false;
      }

      // Refresh history
      await loadHistory(leaderId);
      return true;
    } catch (err) {
      console.warn('Score history insert error:', err);
      return false;
    }
  }, [loadHistory]);

  const recordAllScores = useCallback(async (
    leaderId: number,
    scores: { reach: number; connect: number; disciple: number; develop: number },
    source: 'evaluation' | 'direct' | 'override' = 'direct'
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const dims: ScorecardDimension[] = ['reach', 'connect', 'disciple', 'develop'];

      const rows = dims.map(dim => ({
        circle_leader_id: leaderId,
        dimension: dim,
        score: scores[dim],
        source,
        recorded_by: user?.id || null,
      }));

      const { error } = await supabase
        .from('scorecard_score_history')
        .insert(rows);

      if (error) {
        console.warn('Score history bulk insert error:', error.message);
        return false;
      }

      await loadHistory(leaderId);
      return true;
    } catch (err) {
      console.warn('Score history bulk insert error:', err);
      return false;
    }
  }, [loadHistory]);

  return {
    history,
    isLoading,
    loadHistory,
    recordScore,
    recordAllScores,
  };
};
