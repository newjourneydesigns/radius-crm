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

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
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
import EventExplorerModal from '../modals/EventExplorerModal';

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
  meetingDay?: string | null;
  refreshKey?: number;
  rosterCount?: number | null;
}

type ViewMode = 'weekly' | 'monthly';

// ── Status colours ─────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  met:           { bg: 'rgba(34, 197, 94, 0.7)',   border: '#22c55e' },
  did_not_meet:  { bg: 'rgba(59, 130, 246, 0.7)',   border: '#3b82f6' },
  no_record:     { bg: 'rgba(156, 163, 175, 0.4)',  border: '#9ca3af' },
};

// ── Component ──────────────────────────────────────────────────

export default function AttendanceTrends({ leaderId, leaderName, meetingDay, refreshKey = 0, rosterCount }: AttendanceTrendsProps) {
  const { loadAttendance, invalidateCache, isLoading, error } = useCircleAttendance();
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerDate, setExplorerDate] = useState('');
  const weeklyChartRef = useRef<any>(null);
  const monthlyChartRef = useRef<any>(null);

  useEffect(() => {
    if (refreshKey > 0) invalidateCache(leaderId);
    loadAttendance(leaderId).then((data) => {
      if (data) setSummary(data);
    });
  }, [leaderId, loadAttendance, refreshKey, invalidateCache]);

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

    const values = data.map((d) => d.headcount ?? 0);

    // Linear regression for trend line
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const intercept = denom !== 0 ? (sumY - slope * sumX) / n : (sumY / n || 0);
    const trendValues = values.map((_, i) => Math.round((slope * i + intercept) * 10) / 10);

    return {
      labels,
      datasets: [
        {
          label: 'Attendance',
          data: values,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Trend',
          data: trendValues,
          borderColor: 'rgba(250, 204, 21, 0.7)',
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0,
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

  // ── Handle chart click → open Event Explorer ────────────────

  const handleChartClick = useCallback(
    (_event: any, elements: any[]) => {
      if (!summary || elements.length === 0) return;
      const idx = elements[0].index;

      if (viewMode === 'weekly') {
        const occ = summary.weeklyData[idx];
        if (occ) {
          setExplorerDate(occ.meeting_date);
          setExplorerOpen(true);
        }
      }
      // Monthly view: no single date to open
    },
    [summary, viewMode]
  );

  // ── Chart options ────────────────────────────────────────────

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' as const },
      onClick: handleChartClick,
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
                if (occ.headcount != null)
                  lines.push(`Total: ${occ.headcount}`);
                if (occ.headcount != null && rosterCount != null && rosterCount > 0)
                  lines.push(`Roster: ${Math.round((occ.headcount / rosterCount) * 100)}%`);
                lines.push('Click to view event summary');
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
    [viewMode, summary, rosterCount, handleChartClick]
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
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
        <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden self-start sm:self-auto">
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 mb-5">
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2 sm:p-3 text-center">
          <div className="text-xl sm:text-2xl font-bold text-green-700 dark:text-green-300">
            {overallStats.avgAttendance}
          </div>
          <div className="text-[10px] sm:text-xs text-green-600 dark:text-green-400">
            Avg Attendance
          </div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 sm:p-3 text-center">
          <div className="text-xl sm:text-2xl font-bold text-blue-700 dark:text-blue-300">
            {overallStats.peakAttendance}
          </div>
          <div className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400">Peak</div>
        </div>
        {rosterCount != null && rosterCount > 0 ? (
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-2 sm:p-3 text-center">
            <div className="text-xl sm:text-2xl font-bold text-purple-700 dark:text-purple-300">
              {Math.round((overallStats.avgAttendance / rosterCount) * 100)}%
            </div>
            <div className="text-[10px] sm:text-xs text-purple-600 dark:text-purple-400">
              Avg Roster Att.
            </div>
          </div>
        ) : (
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-2 sm:p-3 text-center">
            <div className="text-xl sm:text-2xl font-bold text-purple-400 dark:text-purple-500">
              —
            </div>
            <div className="text-[10px] sm:text-xs text-purple-500 dark:text-purple-400">
              Avg Roster Att.
            </div>
          </div>
        )}
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2 sm:p-3 text-center">
          <div className="text-xl sm:text-2xl font-bold text-orange-700 dark:text-orange-300">
            {overallStats.didNotMeetCount}
          </div>
          <div className="text-[10px] sm:text-xs text-orange-600 dark:text-orange-400">
            Did Not Meet
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 sm:p-3 text-center">
          <div className="text-xl sm:text-2xl font-bold text-gray-700 dark:text-gray-300">
            {overallStats.noRecordCount}
          </div>
          <div className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400">
            No Record
          </div>
        </div>
      </div>

      {/* Chart — click a weekly data point to pull event summary */}
      <div className="h-56 sm:h-72 cursor-pointer -mx-2 sm:mx-0">
        {viewMode === 'weekly' && weeklyChartData ? (
          <Line ref={weeklyChartRef} data={weeklyChartData} options={chartOptions} />
        ) : monthlyChartData ? (
          <Bar ref={monthlyChartRef} data={monthlyChartData} options={chartOptions} />
        ) : null}
      </div>

      {/* Legend for weekly view */}
      {viewMode === 'weekly' && (
        <>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              Met
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              Did Not Meet
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
              No Record
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between mt-1 gap-0.5">
            <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500">
              Click a data point to view the event summary
            </p>
            {lastSyncedLabel && (
              <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500">
                {lastSyncedLabel}
              </p>
            )}
          </div>

          {/* Event Summary Table */}
          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-center px-3 py-2 font-medium">Attendance</th>
                  {rosterCount != null && rosterCount > 0 && (
                    <>
                      <th className="text-center px-3 py-2 font-medium">Roster</th>
                      <th className="text-center px-3 py-2 font-medium">% of Roster</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {[...summary.weeklyData].reverse().map((occ) => {
                  const dt = new Date(occ.meeting_date + 'T12:00:00');
                  const label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
                  const statusDot: Record<string, string> = {
                    met: 'bg-green-500',
                    did_not_meet: 'bg-blue-500',
                    no_record: 'bg-gray-400',
                  };
                  const rosterPct = rosterCount && rosterCount > 0 && occ.headcount != null
                    ? Math.round((occ.headcount / rosterCount) * 100)
                    : null;
                  return (
                    <tr
                      key={occ.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                      onClick={() => {
                        setExplorerDate(occ.meeting_date);
                        setExplorerOpen(true);
                      }}
                    >
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{label}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDot[occ.status] ?? 'bg-gray-400'}`} />
                          {occ.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-gray-700 dark:text-gray-300">
                        {occ.headcount != null ? occ.headcount : '—'}
                      </td>
                      {rosterCount != null && rosterCount > 0 && (
                        <>
                          <td className="px-3 py-2 text-center text-gray-500 dark:text-gray-400">{rosterCount}</td>
                          <td className="px-3 py-2 text-center">
                            {rosterPct != null ? (
                              <span className={`font-medium ${rosterPct >= 70 ? 'text-green-600 dark:text-green-400' : rosterPct >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500 dark:text-red-400'}`}>
                                {rosterPct}%
                              </span>
                            ) : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Event Explorer Modal — opened when clicking a chart data point */}
      <EventExplorerModal
        isOpen={explorerOpen}
        onClose={() => {
          setExplorerOpen(false);
          // Re-fetch attendance data in case new event summaries were pulled
          invalidateCache(leaderId);
          loadAttendance(leaderId).then((data) => {
            if (data) setSummary(data);
          });
        }}
        initialDate={explorerDate}
        initialGroupName={leaderName}
        meetingDay={meetingDay}
        rosterCount={rosterCount}
      />
    </div>
  );
}
