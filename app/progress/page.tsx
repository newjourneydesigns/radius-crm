'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useProgressDashboard, LeaderProgressSummary } from '../../hooks/useProgressDashboard';
import { supabase } from '../../lib/supabase';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

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
  const latest = summary.latestScore;
  if (!latest) return null;

  return (
    <Link
      href={`/circle/${summary.leader.id}`}
      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-700/30 transition-colors group"
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
            {summary.lastScoredDate && new Date(summary.lastScoredDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2 text-xs">
          <span className="text-blue-400">{latest.reach_score}</span>
          <span className="text-green-400">{latest.connect_score}</span>
          <span className="text-purple-400">{latest.disciple_score}</span>
          <span className="text-orange-400">{latest.develop_score}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-lg font-bold ${ScoreColor(summary.averageScore || 0)}`}>
            {summary.averageScore}
          </span>
          <TrendArrow delta={summary.trend} />
        </div>
      </div>
    </Link>
  );
}

export default function ProgressDashboardPage() {
  const {
    leaderSummaries, dimensionAverages, topPerformers, needsAttention,
    movers, stagnant, unscored, timelineData, isLoading, loadData,
  } = useProgressDashboard();

  const [campuses, setCampuses] = useState<string[]>([]);
  const [acpds, setAcpds] = useState<string[]>([]);
  const [filterCampus, setFilterCampus] = useState('');
  const [filterAcpd, setFilterAcpd] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [activeTab, setActiveTab] = useState<'top' | 'attention' | 'movers' | 'stagnant' | 'unscored'>('top');

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

  // Aggregate timeline chart
  const aggregateChartData = useMemo(() => {
    if (timelineData.length === 0) return null;

    return {
      labels: timelineData.map(t => {
        const d = new Date(t.date + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets: (['reach', 'connect', 'disciple', 'develop'] as const).map(dim => ({
        label: DIMENSION_COLORS[dim].label,
        data: timelineData.map(t => t[dim]),
        borderColor: DIMENSION_COLORS[dim].line,
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: DIMENSION_COLORS[dim].line,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        borderWidth: 2,
      })),
    };
  }, [timelineData]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: { color: '#8da9c4', usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } },
      },
      tooltip: {
        backgroundColor: 'rgba(11, 37, 69, 0.95)',
        titleColor: '#eef4ed',
        bodyColor: '#8da9c4',
        borderColor: 'rgba(76, 103, 133, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      y: {
        min: 0.5, max: 5.5,
        ticks: { stepSize: 1, callback: (v: any) => (v >= 1 && v <= 5 && Number.isInteger(v) ? v : ''), color: '#8da9c4', font: { size: 11 } },
        grid: { color: 'rgba(76, 103, 133, 0.2)' },
        border: { color: 'rgba(76, 103, 133, 0.3)' },
      },
      x: {
        ticks: { color: '#8da9c4', font: { size: 11 }, maxRotation: 45 },
        grid: { display: false },
        border: { color: 'rgba(76, 103, 133, 0.3)' },
      },
    },
    interaction: { intersect: false, mode: 'index' as const },
  };

  const scoredCount = leaderSummaries.filter(s => s.totalRatings > 0).length;

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

              {/* Aggregate timeline chart */}
              {aggregateChartData && timelineData.length >= 2 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-medium text-white">Progress Timeline — All Circles</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Average scores over time across {scoredCount} scored leaders</p>
                  </div>
                  <div className="p-4 sm:p-6">
                    <div style={{ height: '300px' }}>
                      <Line data={aggregateChartData} options={chartOptions} />
                    </div>
                  </div>
                </div>
              )}

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
                  <div className="hidden sm:flex items-center justify-end gap-4 mb-3 text-xs text-gray-500">
                    <span className="text-blue-400">R</span>
                    <span className="text-green-400">C</span>
                    <span className="text-purple-400">D</span>
                    <span className="text-orange-400">D</span>
                    <span className="w-12 text-right">Avg</span>
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
                        .filter(s => s.latestScore)
                        .map(s => ({
                          name: s.leader.name,
                          id: s.leader.id,
                          score: s.latestScore![`${dim}_score` as keyof typeof s.latestScore] as number,
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
