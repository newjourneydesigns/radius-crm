import { useState, useCallback } from 'react';
import { supabase, ScorecardRating } from '../lib/supabase';

export interface LatestScores {
  reach: number | null;
  connect: number | null;
  disciple: number | null;
  develop: number | null;
  average: number | null;
  scoredDate: string | null;
}

export interface ScoreTrend {
  reach: number;
  connect: number;
  disciple: number;
  develop: number;
  average: number;
}

export const useScorecard = () => {
  const [ratings, setRatings] = useState<ScorecardRating[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRatings = useCallback(async (leaderId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('circle_leader_scores')
        .select('*')
        .eq('circle_leader_id', leaderId)
        .order('scored_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error loading scores:', fetchError);
        setError(fetchError.message);
        return [];
      }

      setRatings(data || []);
      return data || [];
    } catch (err: any) {
      console.error('Error loading scores:', err);
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const submitScores = useCallback(async (
    leaderId: number,
    scores: { reach_score: number; connect_score: number; disciple_score: number; develop_score: number },
    notes?: string,
    scoredDate?: string
  ) => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const insertData = {
        circle_leader_id: leaderId,
        ...scores,
        notes: notes || null,
        scored_date: scoredDate || new Date().toISOString().split('T')[0],
        scored_by: user?.id || null,
      };

      const { data, error: insertError } = await supabase
        .from('circle_leader_scores')
        .insert([insertData])
        .select()
        .single();

      if (insertError) {
        console.error('Error submitting scores:', insertError);
        setError(insertError.message);
        return null;
      }

      // Refresh ratings
      await loadRatings(leaderId);
      return data;
    } catch (err: any) {
      console.error('Error submitting scores:', err);
      setError(err.message);
      return null;
    }
  }, [loadRatings]);

  const updateScore = useCallback(async (
    scoreId: number,
    leaderId: number,
    updates: { reach_score?: number; connect_score?: number; disciple_score?: number; develop_score?: number; notes?: string }
  ) => {
    setError(null);
    try {
      const updateData: any = {};
      if (updates.reach_score !== undefined) updateData.reach_score = updates.reach_score;
      if (updates.connect_score !== undefined) updateData.connect_score = updates.connect_score;
      if (updates.disciple_score !== undefined) updateData.disciple_score = updates.disciple_score;
      if (updates.develop_score !== undefined) updateData.develop_score = updates.develop_score;
      if (updates.notes !== undefined) updateData.notes = updates.notes || null;

      const { error: updateError } = await supabase
        .from('circle_leader_scores')
        .update(updateData)
        .eq('id', scoreId);

      if (updateError) {
        console.error('Error updating score:', updateError);
        setError(updateError.message);
        return false;
      }

      await loadRatings(leaderId);
      return true;
    } catch (err: any) {
      console.error('Error updating score:', err);
      setError(err.message);
      return false;
    }
  }, [loadRatings]);

  const deleteScore = useCallback(async (scoreId: number, leaderId: number) => {
    try {
      const { error: deleteError } = await supabase
        .from('circle_leader_scores')
        .delete()
        .eq('id', scoreId);

      if (deleteError) {
        console.error('Error deleting score:', deleteError);
        setError(deleteError.message);
        return false;
      }

      await loadRatings(leaderId);
      return true;
    } catch (err: any) {
      console.error('Error deleting score:', err);
      setError(err.message);
      return false;
    }
  }, [loadRatings]);

  // Compute latest scores from the ratings array
  const getLatestScores = useCallback((): LatestScores => {
    if (ratings.length === 0) {
      return { reach: null, connect: null, disciple: null, develop: null, average: null, scoredDate: null };
    }
    const latest = ratings[0]; // Already sorted by date desc
    const avg = (latest.reach_score + latest.connect_score + latest.disciple_score + latest.develop_score) / 4;
    return {
      reach: latest.reach_score,
      connect: latest.connect_score,
      disciple: latest.disciple_score,
      develop: latest.develop_score,
      average: Math.round(avg * 10) / 10,
      scoredDate: latest.scored_date,
    };
  }, [ratings]);

  // Compute trend vs previous rating
  const getTrend = useCallback((): ScoreTrend => {
    if (ratings.length < 2) {
      return { reach: 0, connect: 0, disciple: 0, develop: 0, average: 0 };
    }
    const latest = ratings[0];
    const previous = ratings[1];
    const latestAvg = (latest.reach_score + latest.connect_score + latest.disciple_score + latest.develop_score) / 4;
    const prevAvg = (previous.reach_score + previous.connect_score + previous.disciple_score + previous.develop_score) / 4;
    return {
      reach: latest.reach_score - previous.reach_score,
      connect: latest.connect_score - previous.connect_score,
      disciple: latest.disciple_score - previous.disciple_score,
      develop: latest.develop_score - previous.develop_score,
      average: Math.round((latestAvg - prevAvg) * 10) / 10,
    };
  }, [ratings]);

  return {
    ratings,
    isLoading,
    error,
    loadRatings,
    submitScores,
    updateScore,
    deleteScore,
    getLatestScores,
    getTrend,
  };
};
