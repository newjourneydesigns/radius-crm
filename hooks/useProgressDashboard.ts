import { useState, useCallback, useMemo } from 'react';
import { supabase, ScorecardRating, CircleLeader } from '../lib/supabase';

export interface LeaderProgressSummary {
  leader: CircleLeader;
  latestScore: ScorecardRating | null;
  previousScore: ScorecardRating | null;
  averageScore: number | null;
  trend: number; // delta in average score
  lastScoredDate: string | null;
  totalRatings: number;
}

export interface DimensionAverage {
  reach: number;
  connect: number;
  disciple: number;
  develop: number;
  overall: number;
}

export const useProgressDashboard = () => {
  const [leaders, setLeaders] = useState<CircleLeader[]>([]);
  const [allScores, setAllScores] = useState<ScorecardRating[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (filters?: {
    campus?: string;
    acpd?: string;
    status?: string;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      // Load leaders
      let leadersQuery = supabase
        .from('circle_leaders')
        .select('*')
        .order('name');

      if (filters?.campus) leadersQuery = leadersQuery.eq('campus', filters.campus);
      if (filters?.acpd) leadersQuery = leadersQuery.eq('acpd', filters.acpd);
      if (filters?.status) leadersQuery = leadersQuery.eq('status', filters.status);

      const { data: leadersData, error: leadersError } = await leadersQuery;
      if (leadersError) throw leadersError;
      setLeaders(leadersData || []);

      // Load all scores
      const leaderIds = (leadersData || []).map((l: CircleLeader) => l.id);
      
      if (leaderIds.length === 0) {
        setAllScores([]);
        return;
      }

      const { data: scoresData, error: scoresError } = await supabase
        .from('circle_leader_scores')
        .select('*')
        .in('circle_leader_id', leaderIds)
        .order('scored_date', { ascending: false });

      if (scoresError) throw scoresError;
      setAllScores(scoresData || []);
    } catch (err: any) {
      console.error('Error loading progress data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Build per-leader summaries
  const leaderSummaries = useMemo((): LeaderProgressSummary[] => {
    return leaders.map(leader => {
      const leaderScores = allScores
        .filter(s => s.circle_leader_id === leader.id)
        .sort((a, b) => b.scored_date.localeCompare(a.scored_date));

      const latest = leaderScores[0] || null;
      const previous = leaderScores[1] || null;

      let averageScore: number | null = null;
      let trend = 0;

      if (latest) {
        averageScore = (latest.reach_score + latest.connect_score + latest.disciple_score + latest.develop_score) / 4;
        averageScore = Math.round(averageScore * 10) / 10;
      }

      if (latest && previous) {
        const latestAvg = (latest.reach_score + latest.connect_score + latest.disciple_score + latest.develop_score) / 4;
        const prevAvg = (previous.reach_score + previous.connect_score + previous.disciple_score + previous.develop_score) / 4;
        trend = Math.round((latestAvg - prevAvg) * 10) / 10;
      }

      return {
        leader,
        latestScore: latest,
        previousScore: previous,
        averageScore,
        trend,
        lastScoredDate: latest?.scored_date || null,
        totalRatings: leaderScores.length,
      };
    });
  }, [leaders, allScores]);

  // Dimension averages across all leaders
  const dimensionAverages = useMemo((): DimensionAverage => {
    const scored = leaderSummaries.filter(s => s.latestScore !== null);
    if (scored.length === 0) {
      return { reach: 0, connect: 0, disciple: 0, develop: 0, overall: 0 };
    }

    const totals = scored.reduce(
      (acc, s) => {
        acc.reach += s.latestScore!.reach_score;
        acc.connect += s.latestScore!.connect_score;
        acc.disciple += s.latestScore!.disciple_score;
        acc.develop += s.latestScore!.develop_score;
        return acc;
      },
      { reach: 0, connect: 0, disciple: 0, develop: 0 }
    );

    const count = scored.length;
    const reach = Math.round((totals.reach / count) * 10) / 10;
    const connect = Math.round((totals.connect / count) * 10) / 10;
    const disciple = Math.round((totals.disciple / count) * 10) / 10;
    const develop = Math.round((totals.develop / count) * 10) / 10;
    const overall = Math.round(((reach + connect + disciple + develop) / 4) * 10) / 10;

    return { reach, connect, disciple, develop, overall };
  }, [leaderSummaries]);

  // Top performers: highest average score with at least 1 rating
  const topPerformers = useMemo(() => {
    return leaderSummaries
      .filter(s => s.averageScore !== null)
      .sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0))
      .slice(0, 10);
  }, [leaderSummaries]);

  // Needs attention: lowest average score with at least 1 rating
  const needsAttention = useMemo(() => {
    return leaderSummaries
      .filter(s => s.averageScore !== null)
      .sort((a, b) => (a.averageScore || 0) - (b.averageScore || 0))
      .slice(0, 10);
  }, [leaderSummaries]);

  // Movers: leaders with biggest positive trend (≥0.5)
  const movers = useMemo(() => {
    return leaderSummaries
      .filter(s => s.trend >= 0.5)
      .sort((a, b) => b.trend - a.trend);
  }, [leaderSummaries]);

  // Stagnant: no score change or no new ratings in 60+ days
  const stagnant = useMemo(() => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const cutoff = sixtyDaysAgo.toISOString().split('T')[0];

    return leaderSummaries.filter(s => {
      if (s.totalRatings === 0) return false; // Unscored — not stagnant, just unrated
      if (s.trend === 0 && s.totalRatings >= 2) return true;
      if (s.lastScoredDate && s.lastScoredDate < cutoff) return true;
      return false;
    });
  }, [leaderSummaries]);

  // Not yet scored
  const unscored = useMemo(() => {
    return leaderSummaries.filter(s => s.totalRatings === 0);
  }, [leaderSummaries]);

  // Aggregate timeline data (for the dashboard chart)
  const timelineData = useMemo(() => {
    if (allScores.length === 0) return [];

    // Group scores by date and average
    const dateMap = new Map<string, { reach: number[]; connect: number[]; disciple: number[]; develop: number[] }>();

    allScores.forEach(score => {
      const date = score.scored_date;
      if (!dateMap.has(date)) {
        dateMap.set(date, { reach: [], connect: [], disciple: [], develop: [] });
      }
      const entry = dateMap.get(date)!;
      entry.reach.push(score.reach_score);
      entry.connect.push(score.connect_score);
      entry.disciple.push(score.disciple_score);
      entry.develop.push(score.develop_score);
    });

    const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

    return Array.from(dateMap.entries())
      .map(([date, values]) => ({
        date,
        reach: avg(values.reach),
        connect: avg(values.connect),
        disciple: avg(values.disciple),
        develop: avg(values.develop),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allScores]);

  return {
    leaders,
    allScores,
    leaderSummaries,
    dimensionAverages,
    topPerformers,
    needsAttention,
    movers,
    stagnant,
    unscored,
    timelineData,
    isLoading,
    error,
    loadData,
  };
};
