'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useProgressDashboard, LeaderProgressSummary } from '../../hooks/useProgressDashboard';
import { supabase } from '../../lib/supabase';
import { ScorecardDimension } from '../../lib/supabase';
import LeaderScorecardModal from '../../components/progress/LeaderScorecardModal';

interface DevelopingLeaderRow {
  id: number;
  name: string;
  notes: string | null;
  updated_at: string;
  circle_leader_id: number;
  circle_leader_name: string;
}

const DIMENSION_CONFIG = {
  reach: {
    label: 'Reach',
    abbr: 'Reach',
    textColor: 'text-blue-400',
    barColor: 'bg-blue-500',
    bgBorder: 'bg-blue-500/10 border-blue-500/30',
  },
  connect: {
    label: 'Connect',
    abbr: 'Con',
    textColor: 'text-green-400',
    barColor: 'bg-green-500',
    bgBorder: 'bg-green-500/10 border-green-500/30',
  },
  disciple: {
    label: 'Disciple',
    abbr: 'Dis',
    textColor: 'text-purple-400',
    barColor: 'bg-purple-500',
    bgBorder: 'bg-purple-500/10 border-purple-500/30',
  },
  develop: {
    label: 'Develop',
    abbr: 'Dev',
    textColor: 'text-orange-400',
    barColor: 'bg-orange-500',
    bgBorder: 'bg-orange-500/10 border-orange-500/30',
  },
} as const;

function scoreColor(score: number) {
  if (score >= 4) return 'text-green-400';
  if (score >= 3) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreBgBorder(score: number) {
  if (score >= 4) return 'bg-green-500/10 border-green-500/30';
  if (score >= 3) return 'bg-yellow-500/10 border-yellow-500/30';
  return 'bg-red-500/10 border-red-500/30';
}

function TrendArrow({ delta }: { delta: number }) {
  if (delta > 0) return <span className="text-green-400 text-xs">↑ +{delta}</span>;
  if (delta < 0) return <span className="text-red-400 text-xs">↓ {delta}</span>;
  return <span className="text-slate-500 text-xs">—</span>;
}

function MiniBar({ score, barColor }: { score: number; barColor: string }) {
  return (
    <div className="h-1 bg-slate-700 rounded-full overflow-hidden mt-2">
      <div
        className={`h-full rounded-full ${barColor} transition-all duration-300`}
        style={{ width: `${(score / 5) * 100}%` }}
      />
    </div>
  );
}

function ScoreCell({
  score,
  colorClass,
  onClick,
}: {
  score: number | null;
  colorClass: string;
  onClick?: () => void;
}) {
  const bg = score !== null
    ? score >= 4 ? 'bg-green-500/10' : score >= 3 ? 'bg-yellow-500/10' : 'bg-red-500/10'
    : '';
  return (
    <button
      onClick={onClick}
      title={onClick ? 'Click to score' : undefined}
      className={`w-16 h-8 flex items-center justify-center rounded-md transition-all duration-150 ${bg} hover:ring-1 hover:ring-white/20 hover:brightness-125 group/cell`}
    >
      {score === null
        ? <span className="text-slate-700 text-xs group-hover/cell:text-slate-500">—</span>
        : <span className={`text-sm font-semibold ${colorClass}`}>{score}</span>
      }
    </button>
  );
}

function LeaderRow({
  summary,
  rank,
  onDimensionClick,
}: {
  summary: LeaderProgressSummary;
  rank?: number;
  onDimensionClick?: (leaderId: number, leaderName: string, dimension: ScorecardDimension) => void;
}) {
  const eff = summary.effectiveScores;
  if (!eff.average) return null;

  const avg = summary.averageScore || 0;
  const avgBadge = avg >= 4
    ? 'bg-green-500/15 border border-green-500/30 text-green-400'
    : avg >= 3
    ? 'bg-yellow-500/15 border border-yellow-500/30 text-yellow-400'
    : 'bg-red-500/15 border border-red-500/30 text-red-400';

  const click = (dim: ScorecardDimension) =>
    onDimensionClick?.(summary.leader.id, summary.leader.name, dim);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-700/30 transition-colors duration-150 group">
      {rank !== undefined && (
        <span className="w-5 text-right text-xs text-slate-600 flex-shrink-0 tabular-nums">{rank}</span>
      )}

      <div className="flex-1 min-w-0">
        <Link
          href={`/circle/${summary.leader.id}`}
          className="text-sm font-medium text-white truncate block hover:text-indigo-400 transition-colors"
        >
          {summary.leader.name}
        </Link>
        <div className="flex items-center gap-2 mt-0.5">
          {summary.leader.campus && (
            <span className="text-xs text-slate-500">{summary.leader.campus}</span>
          )}
          {summary.lastScoredDate && (
            <span className="text-xs text-slate-600">
              {new Date(
                summary.lastScoredDate.length <= 10
                  ? summary.lastScoredDate + 'T00:00:00'
                  : summary.lastScoredDate
              ).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-1">
        <ScoreCell score={eff.reach} colorClass="text-blue-400" onClick={() => click('reach')} />
        <ScoreCell score={eff.connect} colorClass="text-green-400" onClick={() => click('connect')} />
        <ScoreCell score={eff.disciple} colorClass="text-purple-400" onClick={() => click('disciple')} />
        <ScoreCell score={eff.develop} colorClass="text-orange-400" onClick={() => click('develop')} />
      </div>

      <div className="flex items-center gap-2 ml-3">
        <div className="w-16 flex justify-center">
          <span className={`px-2.5 py-1 rounded-lg text-sm font-bold tabular-nums ${avgBadge}`}>
            {summary.averageScore}
          </span>
        </div>
        <div className="w-8 flex justify-start">
          {summary.trend !== 0 && <TrendArrow delta={summary.trend} />}
        </div>
      </div>
    </div>
  );
}

export default function ProgressDashboardPage() {
  const {
    leaderSummaries, dimensionAverages, topPerformers, needsAttention,
    movers, stagnant, unscored, isLoading, loadData,
  } = useProgressDashboard();

  const [campuses, setCampuses] = useState<string[]>([]);
  const [acpds, setAcpds] = useState<string[]>([]);
  const [developingLeaders, setDevelopingLeaders] = useState<DevelopingLeaderRow[]>([]);
  const [developingLoading, setDevelopingLoading] = useState(false);

  const storageKey = 'radius_progress_filters';
  const saved = typeof window !== 'undefined'
    ? (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } })()
    : {};

  const [filterCampus, setFilterCampus] = useState(saved.campus || '');
  const [filterAcpd, setFilterAcpd] = useState(saved.acpd || '');
  const [filterStatus, setFilterStatus] = useState(saved.status || '');
  const [activeTab, setActiveTab] = useState<'top' | 'attention' | 'movers' | 'stagnant' | 'unscored'>(saved.tab || 'top');

  const [modalTarget, setModalTarget] = useState<{
    leaderId: number;
    leaderName: string;
    dimension: ScorecardDimension;
  } | null>(null);

  const openModal = (leaderId: number, leaderName: string, dimension: ScorecardDimension) => {
    setModalTarget({ leaderId, leaderName, dimension });
  };
  const closeModal = () => setModalTarget(null);

  const hasActiveFilters = filterCampus || filterAcpd || filterStatus;

  const clearFilters = () => {
    setFilterCampus('');
    setFilterAcpd('');
    setFilterStatus('');
  };

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        campus: filterCampus,
        acpd: filterAcpd,
        status: filterStatus,
        tab: activeTab,
      }));
    } catch {}
  }, [filterCampus, filterAcpd, filterStatus, activeTab]);

  useEffect(() => {
    const loadRefs = async () => {
      const [campusRes, acpdRes] = await Promise.all([
        supabase.from('campuses').select('value').order('value'),
        supabase.from('acpd_list').select('name').order('name'),
      ]);
      setCampuses(Array.from(new Set((campusRes.data || []).map((c: any) => c.value))));
      setAcpds(Array.from(new Set((acpdRes.data || []).map((a: any) => a.name))));
    };
    loadRefs();
  }, []);

  useEffect(() => {
    loadData({
      campus: filterCampus || undefined,
      acpd: filterAcpd || undefined,
      status: filterStatus || undefined,
    });
  }, [filterCampus, filterAcpd, filterStatus, loadData]);

  useEffect(() => {
    const loadDevelopingLeaders = async () => {
      setDevelopingLoading(true);
      try {
        let leaderQuery = supabase.from('circle_leaders').select('id, name');
        if (filterCampus) leaderQuery = leaderQuery.eq('campus', filterCampus);
        if (filterAcpd) leaderQuery = leaderQuery.eq('acpd', filterAcpd);
        if (filterStatus) leaderQuery = leaderQuery.eq('status', filterStatus);
        const { data: leaders } = await leaderQuery;
        if (!leaders || leaders.length === 0) { setDevelopingLeaders([]); return; }

        const leaderMap = new Map(leaders.map((l: any) => [l.id, l.name]));
        const leaderIds = leaders.map((l: any) => l.id);

        const { data: prospects } = await supabase
          .from('development_prospects')
          .select('id, name, notes, updated_at, circle_leader_id')
          .in('circle_leader_id', leaderIds)
          .eq('is_active', true)
          .order('updated_at', { ascending: false });

        setDevelopingLeaders(
          (prospects || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            notes: p.notes,
            updated_at: p.updated_at,
            circle_leader_id: p.circle_leader_id,
            circle_leader_name: leaderMap.get(p.circle_leader_id) || 'Unknown',
          }))
        );
      } catch (err) {
        console.error('Error loading developing leaders:', err);
        setDevelopingLeaders([]);
      } finally {
        setDevelopingLoading(false);
      }
    };
    loadDevelopingLeaders();
  }, [filterCampus, filterAcpd, filterStatus]);

  const scoredCount = leaderSummaries.filter(s => s.hasAnyScore).length;

  const getActiveList = (): LeaderProgressSummary[] => {
    switch (activeTab) {
      case 'top': return topPerformers;
      case 'attention': return needsAttention;
      case 'movers': return movers;
      case 'stagnant': return stagnant;
      case 'unscored': return unscored;
      default: return topPerformers;
    }
  };

  const selectClass = 'bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors';

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-white tracking-tight">Circle Progress Dashboard</h1>
            <p className="text-sm text-slate-400 mt-1">
              Tracking Reach, Connect, Disciple, Develop across your circles
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <select value={filterCampus} onChange={e => setFilterCampus(e.target.value)} className={selectClass}>
              <option value="">All Campuses</option>
              {campuses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterAcpd} onChange={e => setFilterAcpd(e.target.value)} className={selectClass}>
              <option value="">All ACPDs</option>
              {acpds.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectClass}>
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="pipeline">Pipeline</option>
              <option value="paused">Paused</option>
              <option value="invited">Invited</option>
              <option value="on-boarding">On-boarding</option>
              <option value="off-boarding">Off-boarding</option>
            </select>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-slate-400 hover:text-white hover:bg-slate-700 px-3 py-2 rounded-lg text-sm transition-colors duration-150"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear filters
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-7 h-7 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                {(['reach', 'connect', 'disciple', 'develop'] as const).map(dim => {
                  const cfg = DIMENSION_CONFIG[dim];
                  const score = dimensionAverages[dim];
                  return (
                    <div key={dim} className={`p-4 rounded-xl border ${score ? scoreBgBorder(score) : 'bg-slate-800/50 border-slate-700'}`}>
                      <span className="text-xs text-slate-400 uppercase tracking-wide">{cfg.label}</span>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className={`text-2xl font-bold ${score ? scoreColor(score) : 'text-slate-500'}`}>
                          {score || '—'}
                        </span>
                        {score > 0 && <span className="text-xs text-slate-500">/5</span>}
                      </div>
                      {score > 0 && <MiniBar score={score} barColor={cfg.barColor} />}
                    </div>
                  );
                })}

                {/* Overall — visually distinct */}
                <div className={`p-4 rounded-xl border col-span-2 sm:col-span-1 ${dimensionAverages.overall ? scoreBgBorder(dimensionAverages.overall) : 'bg-slate-800/50 border-slate-700'}`}>
                  <span className="text-xs text-slate-400 uppercase tracking-wide">Overall</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-3xl font-bold ${dimensionAverages.overall ? scoreColor(dimensionAverages.overall) : 'text-slate-500'}`}>
                      {dimensionAverages.overall || '—'}
                    </span>
                    {dimensionAverages.overall > 0 && <span className="text-xs text-slate-500">/5</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    {scoredCount} / {leaderSummaries.length} scored
                  </p>
                </div>
              </div>

              {/* Unscored reminder */}
              {unscored.length > 0 && (
                <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <p className="text-sm text-amber-300 font-medium">
                      {unscored.length} leader{unscored.length !== 1 ? "s haven't" : " hasn't"} been scored yet
                    </p>
                    <p className="text-xs text-amber-400/70 mt-0.5">
                      Visit their profile to rate their Reach, Connect, Disciple, and Develop progress
                    </p>
                  </div>
                </div>
              )}

              {/* Leader tabs */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass">
                <div className="border-b border-slate-700 px-4 overflow-x-auto">
                  <div className="flex gap-0.5">
                    {([
                      { key: 'top', label: 'Top Performers', count: topPerformers.length },
                      { key: 'attention', label: 'Needs Attention', count: needsAttention.length },
                      { key: 'movers', label: 'Movers', count: movers.length },
                      { key: 'stagnant', label: 'Stagnant', count: stagnant.length },
                      { key: 'unscored', label: 'Unscored', count: unscored.length },
                    ] as const).map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors duration-150 ${
                          activeTab === tab.key
                            ? 'border-indigo-500 text-indigo-400'
                            : 'border-transparent text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                      >
                        {tab.label}
                        <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                          activeTab === tab.key
                            ? 'bg-indigo-500/20 text-indigo-400'
                            : 'bg-slate-700 text-slate-400'
                        }`}>
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4">
                  {/* Column legend — mirrors LeaderRow layout exactly */}
                  {activeTab !== 'unscored' && (
                    <div className="hidden sm:flex items-center gap-3 px-3 pb-2 mb-1 border-b border-slate-700/50">
                      <span className="w-5 flex-shrink-0" />
                      <div className="flex-1" />
                      <div className="flex items-center gap-1">
                        <span className="w-16 text-center text-xs text-blue-400/60 font-medium">Reach</span>
                        <span className="w-16 text-center text-xs text-green-400/60 font-medium">Connect</span>
                        <span className="w-16 text-center text-xs text-purple-400/60 font-medium">Disciple</span>
                        <span className="w-16 text-center text-xs text-orange-400/60 font-medium">Develop</span>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <div className="w-16 flex justify-center">
                          <span className="text-xs text-slate-500 font-medium">Avg</span>
                        </div>
                        <div className="w-8" />
                      </div>
                    </div>
                  )}

                  {getActiveList().length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-slate-400 text-sm">
                        {activeTab === 'unscored' ? 'All leaders have been scored!' : 'No leaders in this category'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-700/40">
                      {getActiveList().map((summary, i) =>
                        activeTab === 'unscored' ? (
                          <Link
                            key={summary.leader.id}
                            href={`/circle/${summary.leader.id}`}
                            className="flex items-center justify-between px-3 py-3 hover:bg-slate-700/50 transition-colors duration-150 group first:rounded-t-lg last:rounded-b-lg"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-slate-600 tabular-nums w-5 text-right">{i + 1}</span>
                              <div>
                                <h4 className="text-sm font-medium text-white group-hover:text-indigo-400 transition-colors">
                                  {summary.leader.name}
                                </h4>
                                <span className="text-xs text-slate-500">{summary.leader.campus}</span>
                              </div>
                            </div>
                            <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">Not scored</span>
                          </Link>
                        ) : (
                          <LeaderRow key={summary.leader.id} summary={summary} rank={i + 1} onDimensionClick={openModal} />
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Developing Leaders */}
              <div className="mt-6 bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass">
                <div className="px-6 py-4 border-b border-slate-700">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <h2 className="text-base font-semibold text-white">Developing Leaders</h2>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/20 text-orange-400">
                      {developingLeaders.length}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">People being developed for leadership across all circles</p>
                </div>

                <div className="p-4">
                  {developingLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-5 h-5 border-2 border-slate-600 border-t-orange-400 rounded-full animate-spin" />
                    </div>
                  ) : developingLeaders.length === 0 ? (
                    <div className="py-10 text-center">
                      <svg className="w-8 h-8 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                      </svg>
                      <p className="text-slate-400 text-sm">No developing leaders identified yet</p>
                      <p className="text-slate-500 text-xs mt-1">
                        Add development prospects from the Develop section on a circle leader&apos;s profile
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="hidden sm:grid sm:grid-cols-12 gap-3 px-3 pb-2 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-700/50 mb-1">
                        <div className="col-span-3">Name</div>
                        <div className="col-span-4">Notes</div>
                        <div className="col-span-2">Updated</div>
                        <div className="col-span-3">Circle Leader</div>
                      </div>
                      <div className="space-y-0.5">
                        {developingLeaders.map(dl => (
                          <Link
                            key={dl.id}
                            href={`/circle/${dl.circle_leader_id}`}
                            className="block sm:grid sm:grid-cols-12 gap-3 p-3 rounded-lg hover:bg-slate-700/50 transition-colors duration-150 group"
                          >
                            <div className="col-span-3">
                              <span className="text-sm font-medium text-white group-hover:text-orange-400 transition-colors">
                                {dl.name}
                              </span>
                            </div>
                            <div className="col-span-4 mt-1 sm:mt-0">
                              <span className="text-xs text-slate-400 line-clamp-2">{dl.notes || '—'}</span>
                            </div>
                            <div className="col-span-2 mt-1 sm:mt-0">
                              <span className="text-xs text-slate-500">
                                {new Date(dl.updated_at).toLocaleDateString('en-US', {
                                  month: 'short', day: 'numeric', year: 'numeric',
                                })}
                              </span>
                            </div>
                            <div className="col-span-3 mt-1 sm:mt-0">
                              <span className="text-xs text-indigo-400">{dl.circle_leader_name}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Dimension Breakdown */}
              <div className="mt-6 bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass">
                <div className="px-6 py-4 border-b border-slate-700">
                  <h2 className="text-base font-semibold text-white">Dimension Breakdown</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Score distribution across all scored leaders</p>
                </div>
                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {(['reach', 'connect', 'disciple', 'develop'] as const).map(dim => {
                      const cfg = DIMENSION_CONFIG[dim];
                      const scored = leaderSummaries
                        .filter(s => s.effectiveScores[dim] !== null)
                        .map(s => ({
                          name: s.leader.name,
                          id: s.leader.id,
                          score: s.effectiveScores[dim] as number,
                        }))
                        .sort((a, b) => b.score - a.score);

                      return (
                        <div key={dim}>
                          <h3 className={`text-sm font-semibold mb-3 ${cfg.textColor}`}>
                            {cfg.label}
                          </h3>
                          <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                            {scored.length === 0 ? (
                              <p className="text-xs text-slate-500 py-2">No scores yet</p>
                            ) : scored.map(s => (
                              <Link
                                key={s.id}
                                href={`/circle/${s.id}`}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700/50 transition-colors duration-150 group"
                              >
                                <span className="flex-1 text-xs text-slate-300 truncate group-hover:text-white transition-colors">
                                  {s.name}
                                </span>
                                <div className="w-14 h-1.5 bg-slate-700 rounded-full overflow-hidden flex-shrink-0">
                                  <div
                                    className={`h-full rounded-full ${cfg.barColor}`}
                                    style={{ width: `${(s.score / 5) * 100}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-bold w-4 text-right flex-shrink-0 ${scoreColor(s.score)}`}>
                                  {s.score}
                                </span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {modalTarget && (
        <LeaderScorecardModal
          leaderId={modalTarget.leaderId}
          leaderName={modalTarget.leaderName}
          initialDimension={modalTarget.dimension}
          isOpen={true}
          onClose={closeModal}
          onSaved={() => {
            loadData({
              campus: filterCampus || undefined,
              acpd: filterAcpd || undefined,
              status: filterStatus || undefined,
            });
          }}
        />
      )}
    </ProtectedRoute>
  );
}
