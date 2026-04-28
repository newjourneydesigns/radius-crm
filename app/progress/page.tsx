'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useProgressDashboard, LeaderProgressSummary, EffectiveScores } from '../../hooks/useProgressDashboard';
import { supabase } from '../../lib/supabase';

interface DevelopingLeaderRow {
  id: number;
  name: string;
  notes: string | null;
  updated_at: string;
  circle_leader_id: number;
  circle_leader_name: string;
}

const DIMENSION_COLORS = {
  reach: { line: '#3b82f6', label: 'Reach' },
  connect: { line: '#22c55e', label: 'Connect' },
  disciple: { line: '#a855f7', label: 'Disciple' },
  develop: { line: '#f97316', label: 'Develop' },
};

function ScoreColor(score: number) {
  if (score >= 4) return 'text-green-400';
  if (score >= 3) return 'text-yellow-400';
  return 'text-red-400';
}

function ScoreBgColor(score: number) {
  if (score >= 4) return 'bg-green-500/10 border-green-500/30';
  if (score >= 3) return 'bg-yellow-500/10 border-yellow-500/30';
  return 'bg-red-500/10 border-red-500/30';
}

function TrendArrow({ delta }: { delta: number }) {
  if (delta > 0) return <span className="text-green-400 text-xs">↑ +{delta}</span>;
  if (delta < 0) return <span className="text-red-400 text-xs">↓ {delta}</span>;
  return <span className="text-gray-500 text-xs">→</span>;
}

function LeaderRow({ summary }: { summary: LeaderProgressSummary }) {
  const eff = summary.effectiveScores;
  if (!eff.average) return null;

  return (
    <Link
      href={`/circle/${summary.leader.id}`}
      className="flex items-center p-3 rounded-lg hover:bg-gray-700/30 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
          {summary.leader.name}
        </h4>
        <div className="flex items-center gap-3 mt-0.5">
          {summary.leader.campus && (
            <span className="text-xs text-gray-500">{summary.leader.campus}</span>
          )}
          <span className="text-xs text-gray-600">
            {summary.lastScoredDate && new Date(summary.lastScoredDate.length <= 10 ? summary.lastScoredDate + 'T00:00:00' : summary.lastScoredDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="hidden sm:flex items-center">
        <span className="w-8 text-center text-xs text-blue-400">{eff.reach ?? '\u2014'}</span>
        <span className="w-8 text-center text-xs text-green-400">{eff.connect ?? '\u2014'}</span>
        <span className="w-8 text-center text-xs text-purple-400">{eff.disciple ?? '\u2014'}</span>
        <span className="w-8 text-center text-xs text-orange-400">{eff.develop ?? '\u2014'}</span>
      </div>
      <div className="w-16 flex items-center justify-center gap-1 ml-2">
        <span className={`text-lg font-bold ${ScoreColor(summary.averageScore || 0)}`}>
          {summary.averageScore}
        </span>
        <TrendArrow delta={summary.trend} />
      </div>
    </Link>
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

  // Persist filters in localStorage
  const storageKey = 'radius_progress_filters';
  const saved = typeof window !== 'undefined' ? (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } })() : {};

  const [filterCampus, setFilterCampus] = useState(saved.campus || '');
  const [filterAcpd, setFilterAcpd] = useState(saved.acpd || '');
  const [filterStatus, setFilterStatus] = useState(saved.status || '');
  const [activeTab, setActiveTab] = useState<'top' | 'attention' | 'movers' | 'stagnant' | 'unscored'>(saved.tab || 'top');

  // Save filters to localStorage whenever they change
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

  // Load reference data
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

  // Load dashboard data when filters change
  useEffect(() => {
    loadData({
      campus: filterCampus || undefined,
      acpd: filterAcpd || undefined,
      status: filterStatus || undefined,
    });
  }, [filterCampus, filterAcpd, filterStatus, loadData]);

  // Load development prospects across all leaders (filtered)
  useEffect(() => {
    const loadDevelopingLeaders = async () => {
      setDevelopingLoading(true);
      try {
        // First get circle leader IDs matching current filters
        let leaderQuery = supabase.from('circle_leaders').select('id, name');
        if (filterCampus) leaderQuery = leaderQuery.eq('campus', filterCampus);
        if (filterAcpd) leaderQuery = leaderQuery.eq('acpd', filterAcpd);
        if (filterStatus) leaderQuery = leaderQuery.eq('status', filterStatus);
        const { data: leaders } = await leaderQuery;
        if (!leaders || leaders.length === 0) {
          setDevelopingLeaders([]);
          return;
        }
        const leaderMap = new Map(leaders.map((l: any) => [l.id, l.name]));
        const leaderIds = leaders.map((l: any) => l.id);

        const { data: prospects } = await supabase
          .from('development_prospects')
          .select('id, name, notes, updated_at, circle_leader_id')
          .in('circle_leader_id', leaderIds)
          .eq('is_active', true)
          .order('updated_at', { ascending: false });

        if (prospects) {
          setDevelopingLeaders(
            prospects.map((p: any) => ({
              id: p.id,
              name: p.name,
              notes: p.notes,
              updated_at: p.updated_at,
              circle_leader_id: p.circle_leader_id,
              circle_leader_name: leaderMap.get(p.circle_leader_id) || 'Unknown',
            }))
          );
        } else {
          setDevelopingLeaders([]);
        }
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

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Circle Progress Dashboard</h1>
            <p className="text-sm text-gray-400 mt-1">
              Tracking Reach, Connect, Disciple, Develop across your circles
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6">
            <select
              value={filterCampus}
              onChange={e => setFilterCampus(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">All Campuses</option>
              {campuses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={filterAcpd}
              onChange={e => setFilterAcpd(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">All ACPDs</option>
              {acpds.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="pipeline">Pipeline</option>
              <option value="paused">Paused</option>
              <option value="invited">Invited</option>
              <option value="on-boarding">On-boarding</option>
              <option value="off-boarding">Off-boarding</option>
            </select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                {(['reach', 'connect', 'disciple', 'develop'] as const).map(dim => (
                  <div key={dim} className={`p-4 rounded-xl border ${ScoreBgColor(dimensionAverages[dim])}`}>
                    <span className="text-xs text-gray-400 uppercase tracking-wide">{DIMENSION_COLORS[dim].label}</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className={`text-2xl font-bold ${ScoreColor(dimensionAverages[dim])}`}>
                        {dimensionAverages[dim] || '—'}
                      </span>
                      <span className="text-xs text-gray-500">/5</span>
                    </div>
                  </div>
                ))}
                <div className={`p-4 rounded-xl border ${ScoreBgColor(dimensionAverages.overall)}`}>
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Overall</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-2xl font-bold ${ScoreColor(dimensionAverages.overall)}`}>
                      {dimensionAverages.overall || '—'}
                    </span>
                    <span className="text-xs text-gray-500">/5</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {scoredCount}/{leaderSummaries.length} scored
                  </p>
                </div>
              </div>

              {/* Scorecard Reminder Banner */}
              {unscored.length > 0 && (
                <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <p className="text-sm text-amber-300 font-medium">{unscored.length} leader{unscored.length !== 1 ? 's haven\'t' : ' hasn\'t'} been scored yet</p>
                    <p className="text-xs text-amber-400/70 mt-0.5">Visit their profile to rate their Reach, Connect, Disciple, and Develop progress</p>
                  </div>
                </div>
              )}

              {/* Tabs for leader lists */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="border-b border-gray-700 px-4 overflow-x-auto">
                  <div className="flex gap-1">
                    {[
                      { key: 'top', label: 'Top Performers', count: topPerformers.length },
                      { key: 'attention', label: 'Needs Attention', count: needsAttention.length },
                      { key: 'movers', label: 'Movers', count: movers.length },
                      { key: 'stagnant', label: 'Stagnant', count: stagnant.length },
                      { key: 'unscored', label: 'Unscored', count: unscored.length },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key as typeof activeTab)}
                        className={`px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                          activeTab === tab.key
                            ? 'border-blue-500 text-blue-400'
                            : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'
                        }`}
                      >
                        {tab.label}
                        <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                          activeTab === tab.key ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'
                        }`}>
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4">
                  {/* Tab header legend */}
                  <div className="hidden sm:flex items-center justify-end mb-3 text-xs text-gray-500 pr-3">
                    <div className="flex items-center">
                      <span className="w-8 text-center text-blue-400">R</span>
                      <span className="w-8 text-center text-green-400">C</span>
                      <span className="w-8 text-center text-purple-400">D</span>
                      <span className="w-8 text-center text-orange-400">D</span>
                    </div>
                    <span className="w-16 text-center text-gray-500 ml-2">Avg</span>
                  </div>

                  {getActiveList().length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-gray-500 text-sm">
                        {activeTab === 'unscored' ? 'All leaders have been scored!' : 'No leaders in this category'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {getActiveList().map(summary => (
                        activeTab === 'unscored' ? (
                          <Link
                            key={summary.leader.id}
                            href={`/circle/${summary.leader.id}`}
                            className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-700/30 transition-colors"
                          >
                            <div>
                              <h4 className="text-sm font-medium text-white">{summary.leader.name}</h4>
                              <span className="text-xs text-gray-500">{summary.leader.campus}</span>
                            </div>
                            <span className="text-xs text-gray-500">Not scored</span>
                          </Link>
                        ) : (
                          <LeaderRow key={summary.leader.id} summary={summary} />
                        )
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Developing Leaders */}
              <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <h2 className="text-lg font-medium text-white">Developing Leaders</h2>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/20 text-orange-400">
                      {developingLeaders.length}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">People being developed for leadership across all circles</p>
                </div>
                <div className="p-4">
                  {developingLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-400"></div>
                    </div>
                  ) : developingLeaders.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-gray-500 text-sm">No developing leaders identified yet</p>
                      <p className="text-gray-600 text-xs mt-1">Add development prospects from the Develop section on a circle leader&apos;s profile</p>
                    </div>
                  ) : (
                    <>
                      {/* Table header */}
                      <div className="hidden sm:grid sm:grid-cols-12 gap-3 px-3 pb-2 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-700/50 mb-1">
                        <div className="col-span-3">Name</div>
                        <div className="col-span-4">Notes</div>
                        <div className="col-span-2">Last Updated</div>
                        <div className="col-span-3">Circle Leader</div>
                      </div>
                      <div className="space-y-1">
                        {developingLeaders.map(dl => (
                          <Link
                            key={dl.id}
                            href={`/circle/${dl.circle_leader_id}`}
                            className="block sm:grid sm:grid-cols-12 gap-3 p-3 rounded-lg hover:bg-gray-700/30 transition-colors group"
                          >
                            <div className="col-span-3">
                              <span className="text-sm font-medium text-white group-hover:text-orange-400 transition-colors">{dl.name}</span>
                            </div>
                            <div className="col-span-4 mt-1 sm:mt-0">
                              <span className="text-xs text-gray-400 line-clamp-2">{dl.notes || '—'}</span>
                            </div>
                            <div className="col-span-2 mt-1 sm:mt-0">
                              <span className="text-xs text-gray-500">
                                {new Date(dl.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                            <div className="col-span-3 mt-1 sm:mt-0">
                              <span className="text-xs text-blue-400">{dl.circle_leader_name}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Dimension Deep Dive */}
              <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-medium text-white">Dimension Breakdown</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Score distribution across all scored leaders</p>
                </div>
                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {(['reach', 'connect', 'disciple', 'develop'] as const).map(dim => {
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
                          <h3 className={`text-sm font-semibold mb-2`} style={{ color: DIMENSION_COLORS[dim].line }}>
                            {DIMENSION_COLORS[dim].label}
                          </h3>
                          <div className="space-y-1 max-h-52 overflow-y-auto">
                            {scored.map(s => (
                              <Link
                                key={s.id}
                                href={`/circle/${s.id}`}
                                className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-700/30 text-xs transition-colors"
                              >
                                <span className="text-gray-300 truncate">{s.name}</span>
                                <span className={`font-bold ${ScoreColor(s.score)}`}>{s.score}</span>
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
    </ProtectedRoute>
  );
}
