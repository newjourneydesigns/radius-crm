import { useState, useCallback, useMemo } from 'react';
import { supabase, ScorecardRating, CircleLeader, ScorecardDimension } from '../lib/supabase';
import { calculateSuggestedScore, getFinalScore, AnswerValue } from '../lib/evaluationQuestions';

export interface EffectiveScores {
  reach: number | null;
  connect: number | null;
  disciple: number | null;
  develop: number | null;
  average: number | null;
}

export interface LeaderProgressSummary {
  leader: CircleLeader;
  latestScore: ScorecardRating | null;
  previousScore: ScorecardRating | null;
  effectiveScores: EffectiveScores;
  averageScore: number | null;
  trend: number; // delta in average score
  lastScoredDate: string | null;
  totalRatings: number;
  hasAnyScore: boolean;
}

export interface DimensionAverage {
  reach: number;
  connect: number;
  disciple: number;
  develop: number;
  overall: number;
}

interface EvalRow {
  id: number;
  leader_id: number;
  category: string;
  manual_override_score: number | null;
  updated_at: string | null;
  created_at: string | null;
}

interface AnswerRow {
  evaluation_id: number;
  question_key: string;
  answer: string | null;
}

export const useProgressDashboard = () => {
  const [leaders, setLeaders] = useState<CircleLeader[]>([]);
  const [allScores, setAllScores] = useState<ScorecardRating[]>([]);
  const [evalsByLeader, setEvalsByLeader] = useState<Map<number, Map<string, { override: number | null; suggested: number | null; updatedAt: string | null }>>>(new Map());
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
        setEvalsByLeader(new Map());
        return;
      }

      // Fetch direct scores and evaluations in parallel
      const [scoresRes, evalsRes] = await Promise.all([
        supabase
          .from('circle_leader_scores')
          .select('*')
          .in('circle_leader_id', leaderIds)
          .order('scored_date', { ascending: false }),
        supabase
          .from('leader_category_evaluations')
          .select('*')
          .in('leader_id', leaderIds),
      ]);

      if (scoresRes.error) throw scoresRes.error;
      setAllScores(scoresRes.data || []);

      // Load evaluation answers
      const evals: EvalRow[] = evalsRes.data || [];
      const evalIds = evals.map(e => e.id);
      let answers: AnswerRow[] = [];

      if (evalIds.length > 0) {
        const { data: answerData } = await supabase
          .from('leader_category_answers')
          .select('*')
          .in('evaluation_id', evalIds);
        answers = answerData || [];
      }

      // Group answers by evaluation id
      const answersByEval = new Map<number, Record<string, AnswerValue>>();
      for (const a of answers) {
        if (!answersByEval.has(a.evaluation_id)) answersByEval.set(a.evaluation_id, {});
        answersByEval.get(a.evaluation_id)![a.question_key] = a.answer as AnswerValue;
      }

      // Build per-leader evaluation map
      const evalMap = new Map<number, Map<string, { override: number | null; suggested: number | null; updatedAt: string | null }>>();
      for (const e of evals) {
        if (!evalMap.has(e.leader_id)) evalMap.set(e.leader_id, new Map());
        const leaderEvals = evalMap.get(e.leader_id)!;
        const evalAnswers = answersByEval.get(e.id) || {};
        const suggested = calculateSuggestedScore(evalAnswers);
        leaderEvals.set(e.category, {
          override: e.manual_override_score,
          suggested,
          updatedAt: e.updated_at || e.created_at || null,
        });
      }

      setEvalsByLeader(evalMap);
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
      const leaderEvals = evalsByLeader.get(leader.id);

      // Compute effective scores using getFinalScore priority: override > evaluation > direct
      const dims: ScorecardDimension[] = ['reach', 'connect', 'disciple', 'develop'];
      const effective: Record<string, number | null> = {};
      let effectiveTotal = 0;
      let effectiveCount = 0;
      let latestEvalDate: string | null = null;

      for (const dim of dims) {
        const evalInfo = leaderEvals?.get(dim);
        const directScore = latest ? (latest[`${dim}_score` as keyof ScorecardRating] as number) : null;
        const finalScore = getFinalScore(
          evalInfo?.override ?? null,
          evalInfo?.suggested ?? null,
          directScore
        );
        effective[dim] = finalScore;
        if (finalScore !== null) {
          effectiveTotal += finalScore;
          effectiveCount++;
        }
        if (evalInfo?.updatedAt) {
          if (!latestEvalDate || evalInfo.updatedAt > latestEvalDate) {
            latestEvalDate = evalInfo.updatedAt;
          }
        }
      }

      const effectiveAvg = effectiveCount > 0 ? Math.round((effectiveTotal / effectiveCount) * 10) / 10 : null;
      const hasAnyScore = effectiveCount > 0;

      // Trend: compare current effective scores vs previous direct rating (if any)
      let trend = 0;
      if (latest && previous) {
        const latestAvg = (latest.reach_score + latest.connect_score + latest.disciple_score + latest.develop_score) / 4;
        const prevAvg = (previous.reach_score + previous.connect_score + previous.disciple_score + previous.develop_score) / 4;
        trend = Math.round((latestAvg - prevAvg) * 10) / 10;
      }

      // Determine last scored date from either source
      const lastDate = latest?.scored_date || (latestEvalDate ? latestEvalDate.split('T')[0] : null);

      return {
        leader,
        latestScore: latest,
        previousScore: previous,
        effectiveScores: {
          reach: effective.reach,
          connect: effective.connect,
          disciple: effective.disciple,
          develop: effective.develop,
          average: effectiveAvg,
        },
        averageScore: effectiveAvg,
        trend,
        lastScoredDate: lastDate,
        totalRatings: leaderScores.length,
        hasAnyScore,
      };
    });
  }, [leaders, allScores, evalsByLeader]);

  // Dimension averages across all leaders
  const dimensionAverages = useMemo((): DimensionAverage => {
    const scored = leaderSummaries.filter(s => s.hasAnyScore);
    if (scored.length === 0) {
      return { reach: 0, connect: 0, disciple: 0, develop: 0, overall: 0 };
    }

    const totals = { reach: 0, connect: 0, disciple: 0, develop: 0 };
    const counts = { reach: 0, connect: 0, disciple: 0, develop: 0 };

    scored.forEach(s => {
      if (s.effectiveScores.reach !== null) { totals.reach += s.effectiveScores.reach; counts.reach++; }
      if (s.effectiveScores.connect !== null) { totals.connect += s.effectiveScores.connect; counts.connect++; }
      if (s.effectiveScores.disciple !== null) { totals.disciple += s.effectiveScores.disciple; counts.disciple++; }
      if (s.effectiveScores.develop !== null) { totals.develop += s.effectiveScores.develop; counts.develop++; }
    });

    const reach = counts.reach > 0 ? Math.round((totals.reach / counts.reach) * 10) / 10 : 0;
    const connect = counts.connect > 0 ? Math.round((totals.connect / counts.connect) * 10) / 10 : 0;
    const disciple = counts.disciple > 0 ? Math.round((totals.disciple / counts.disciple) * 10) / 10 : 0;
    const develop = counts.develop > 0 ? Math.round((totals.develop / counts.develop) * 10) / 10 : 0;
    const nonZero = [reach, connect, disciple, develop].filter(v => v > 0);
    const overall = nonZero.length > 0 ? Math.round((nonZero.reduce((a, b) => a + b, 0) / nonZero.length) * 10) / 10 : 0;

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
      if (!s.hasAnyScore) return false; // Unscored — not stagnant, just unrated
      if (s.trend === 0 && s.totalRatings >= 2) return true;
      if (s.lastScoredDate && s.lastScoredDate < cutoff) return true;
      return false;
    });
  }, [leaderSummaries]);

  // Not yet scored (no direct scores AND no evaluation scores)
  const unscored = useMemo(() => {
    return leaderSummaries.filter(s => !s.hasAnyScore);
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
