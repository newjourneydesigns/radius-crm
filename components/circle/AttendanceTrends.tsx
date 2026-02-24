'use client';

/**
 * AttendanceTrends — plots a rolling 6-month attendance chart on the
 * Circle Leader Profile page.
 *
 * • Weekly view  → Line chart with color-coded dots (met / did not meet / no record)
 * • Monthly view → Grouped bar chart (avg attendance, did-not-meet, no-record)
 * • Summary cards show avg attendance, peak, did-not-meet count, no-record count
 * • Trend indicator compares last 3 months vs prior 3 months
 */

import { useEffect, useState, useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import {
  useCircleAttendance,
  type AttendanceSummary,
} from '../../hooks/useCircleAttendance';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// ── Props ──────────────────────────────────────────────────────

interface AttendanceTrendsProps {
  leaderId: number;
  leaderName: string;
}

type ViewMode = 'weekly' | 'monthly';

// ── Status colours ─────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  met:           { bg: 'rgba(34, 197, 94, 0.7)',   border: '#22c55e' },
  did_not_meet:  { bg: 'rgba(59, 130, 246, 0.7)',   border: '#3b82f6' },
  no_record:     { bg: 'rgba(156, 163, 175, 0.4)',  border: '#9ca3af' },
};

// ── Component ──────────────────────────────────────────────────

export default function AttendanceTrends({ leaderId, leaderName }: AttendanceTrendsProps) {
  const { loadAttendance, isLoading, error } = useCircleAttendance();
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');

  useEffect(() => {
    loadAttendance(leaderId).then((data) => {
      if (data) setSummary(data);
    });
  }, [leaderId, loadAttendance]);

  // ── Weekly chart data ────────────────────────────────────────

  const weeklyChartData = useMemo(() => {
    if (!summary) return null;

    const data = summary.weeklyData;
    const labels = data.map((d) => {
      const dt = new Date(d.meeting_date + 'T12:00:00');
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const pointColors = data.map(
      (d) => STATUS_COLORS[d.status]?.border || '#9ca3af'
    );
    const bgColors = data.map(
      (d) => STATUS_COLORS[d.status]?.bg || 'rgba(156,163,175,0.4)'
    );

    return {
      labels,
      datasets: [
        {
          label: 'Attendance',
          data: data.map((d) => d.headcount ?? 0),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }, [summary]);

  // ── Monthly chart data ───────────────────────────────────────

  const monthlyChartData = useMemo(() => {
    if (!summary) return null;

    return {
      labels: summary.monthlyAverages.map((m) => m.label),
      datasets: [
        {
          label: 'Avg Attendance',
          data: summary.monthlyAverages.map((m) => m.avgAttendance),
          backgroundColor: 'rgba(34, 197, 94, 0.6)',
          borderColor: '#22c55e',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Did Not Meet',
          data: summary.monthlyAverages.map((m) => m.didNotMeetCount),
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'No Record',
          data: summary.monthlyAverages.map((m) => m.noRecordCount),
          backgroundColor: 'rgba(156, 163, 175, 0.4)',
          borderColor: '#9ca3af',
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    };
  }, [summary]);

  // ── Chart options ────────────────────────────────────────────

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' as const },
      plugins: {
        legend: {
          display: viewMode === 'monthly',
          labels: { usePointStyle: true, boxWidth: 8, color: '#9ca3af' },
        },
        tooltip: {
          callbacks: {
            afterBody: (ctx: any) => {
              if (viewMode === 'weekly' && summary) {
                const idx = ctx[0]?.dataIndex;
                const occ = summary.weeklyData[idx];
                if (!occ) return '';
                const lines = [
                  `Status: ${occ.status.replace(/_/g, ' ')}`,
                ];
                if (occ.regular_count != null)
                  lines.push(`Regulars: ${occ.regular_count}`);
                if (occ.visitor_count != null)
                  lines.push(`Visitors: ${occ.visitor_count}`);
                return lines;
              }
              return '';
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#9ca3af', stepSize: 1 },
          grid: { color: 'rgba(156, 163, 175, 0.15)' },
        },
        x: {
          ticks: {
            color: '#9ca3af',
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 12,
          },
          grid: { display: false },
        },
      },
    }),
    [viewMode, summary]
  );

  // ── Loading skeleton ─────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4" />
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────

  if (error) {
    return (
      <div className="text-sm text-red-500 dark:text-red-400 p-4 border border-red-200 dark:border-red-800 rounded-lg">
        Failed to load attendance data: {error}
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────

  if (!summary || summary.overallStats.totalMeetings === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
        <svg
          className="h-8 w-8 mx-auto mb-2 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <p className="font-medium">No attendance data available yet</p>
        <p className="text-sm mt-1">Data syncs automatically from CCB</p>
      </div>
    );
  }

  // ── Derived display values ───────────────────────────────────

  const { overallStats } = summary;
  const trendIcon =
    overallStats.attendanceTrend === 'up'
      ? '↑'
      : overallStats.attendanceTrend === 'down'
        ? '↓'
        : '→';
  const trendColor =
    overallStats.attendanceTrend === 'up'
      ? 'text-green-600 dark:text-green-400'
      : overallStats.attendanceTrend === 'down'
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-600 dark:text-gray-400';
  const trendLabel =
    overallStats.attendanceTrend === 'up'
      ? 'Trending up'
      : overallStats.attendanceTrend === 'down'
        ? 'Trending down'
        : 'Stable';

  const lastSyncedLabel = overallStats.lastSyncedAt
    ? `Last synced ${new Date(overallStats.lastSyncedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : null;

  // ── Render ───────────────────────────────────────────────────

  return (
    <div>
      {/* Header with view toggle */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            Attendance Trends
            <span className={`text-sm font-normal ${trendColor}`}>
              {trendIcon} {trendLabel}
            </span>
          </h3>
          {lastSyncedLabel && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {lastSyncedLabel}
            </p>
          )}
        </div>
        <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
          <button
            onClick={() => setViewMode('weekly')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'weekly'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => setViewMode('monthly')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'monthly'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-700 dark:text-green-300">
            {overallStats.avgAttendance}
          </div>
          <div className="text-xs text-green-600 dark:text-green-400">
            Avg Attendance
          </div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
            {overallStats.peakAttendance}
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400">Peak</div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
            {overallStats.didNotMeetCount}
          </div>
          <div className="text-xs text-orange-600 dark:text-orange-400">
            Did Not Meet
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
            {overallStats.noRecordCount}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            No Record
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 sm:h-72">
        {viewMode === 'weekly' && weeklyChartData ? (
          <Line data={weeklyChartData} options={chartOptions} />
        ) : monthlyChartData ? (
          <Bar data={monthlyChartData} options={chartOptions} />
        ) : null}
      </div>

      {/* Legend for weekly view */}
      {viewMode === 'weekly' && (
        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />{' '}
            Met
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />{' '}
            Did Not Meet
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />{' '}
            No Record
          </span>
        </div>
      )}
    </div>
  );
}
