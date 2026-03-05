'use client';

/**
 * AttendanceAggregateDashboard — Aggregate view of circles attendance.
 *
 * Shows:
 *  • Summary cards: total circles, total attendance, avg per meeting
 *  • Breakdown selector: by Day, by Week, by Month, by Type, by Campus
 *  • Respects the current campus filter passed in from the dashboard
 */

import { useState, useEffect, useCallback } from 'react';
import {
  useAttendanceAggregate,
  type AggregateTimeRange,
  type AttendanceAggregateSummary,
  type AttendanceAggregateFilters,
} from '../../hooks/useAttendanceAggregate';

// ── Helpers ───────────────────────────────────────────────────

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Icons ────────────────────────────────────────────────────

const UsersIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const CirclesIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const ChartIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

// ── Sub-component: Breakdown table ───────────────────────────

interface BreakdownRow {
  label: string;
  totalMeetings: number;
  totalAttendance: number;
  avgAttendance: number;
  circleCount: number;
}

function BreakdownTable({ rows, maxAttendance }: { rows: BreakdownRow[]; maxAttendance: number }) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
        No attendance data for this period.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-2 pr-4 font-medium text-gray-600 dark:text-gray-400 w-1/3">Period</th>
            <th className="text-right py-2 px-2 font-medium text-gray-600 dark:text-gray-400">Circles</th>
            <th className="text-right py-2 px-2 font-medium text-gray-600 dark:text-gray-400">Meetings</th>
            <th className="text-right py-2 px-2 font-medium text-gray-600 dark:text-gray-400">Total</th>
            <th className="text-right py-2 pl-2 font-medium text-gray-600 dark:text-gray-400">Avg</th>
            <th className="py-2 pl-4 w-24 sm:w-32 font-medium text-gray-600 dark:text-gray-400"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {rows.map((row, i) => {
            const barPct = maxAttendance > 0 ? (row.totalAttendance / maxAttendance) * 100 : 0;
            return (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="py-2.5 pr-4 font-medium text-gray-900 dark:text-white truncate max-w-[160px]">
                  {row.label}
                </td>
                <td className="py-2.5 px-2 text-right text-gray-700 dark:text-gray-300">
                  {row.circleCount}
                </td>
                <td className="py-2.5 px-2 text-right text-gray-700 dark:text-gray-300">
                  {row.totalMeetings}
                </td>
                <td className="py-2.5 px-2 text-right font-semibold text-gray-900 dark:text-white">
                  {row.totalAttendance.toLocaleString()}
                </td>
                <td className="py-2.5 pl-2 text-right text-gray-700 dark:text-gray-300">
                  {row.avgAttendance}
                </td>
                <td className="py-2.5 pl-4">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-500 dark:bg-blue-400 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────

export interface AttendanceAggregateDashboardProps {
  campusFilter?: string[];
  circleTypeFilter?: string[];
}

// ── Main component ────────────────────────────────────────────

type BreakdownView = 'month' | 'week' | 'day' | 'type' | 'campus';

const TIME_RANGE_OPTIONS: { value: AggregateTimeRange; label: string }[] = [
  { value: 'week',    label: 'Last 7 Days' },
  { value: 'month',   label: 'Last 30 Days' },
  { value: 'quarter', label: 'Last 90 Days' },
  { value: 'year',    label: 'Last 12 Months' },
];

const BREAKDOWN_OPTIONS: { value: BreakdownView; label: string }[] = [
  { value: 'month',  label: 'By Month' },
  { value: 'week',   label: 'By Week' },
  { value: 'day',    label: 'By Day' },
  { value: 'type',   label: 'By Type' },
  { value: 'campus', label: 'By Campus' },
];

export default function AttendanceAggregateDashboard({
  campusFilter = [],
  circleTypeFilter = [],
}: AttendanceAggregateDashboardProps) {
  const { loadAggregate, isLoading, error } = useAttendanceAggregate();

  const [timeRange, setTimeRange] = useState<AggregateTimeRange>('month');
  const [breakdown, setBreakdown] = useState<BreakdownView>('month');
  const [summary, setSummary] = useState<AttendanceAggregateSummary | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  const load = useCallback(async () => {
    const filters: AttendanceAggregateFilters = {
      timeRange,
      campuses: campusFilter.length > 0 ? campusFilter : undefined,
      circleTypes: circleTypeFilter.length > 0 ? circleTypeFilter : undefined,
    };
    const result = await loadAggregate(filters);
    setSummary(result);
  }, [timeRange, campusFilter, circleTypeFilter, loadAggregate]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Derive breakdown rows ──────────────────────────────────

  const { rows, maxAttendance } = (() => {
    if (!summary) return { rows: [], maxAttendance: 0 };

    let items: { label: string; totalMeetings: number; totalAttendance: number; avgAttendance: number; circleCount: number }[] = [];

    if (breakdown === 'month') {
      items = summary.byMonth.map((m) => ({
        label: m.monthLabel,
        totalMeetings: m.totalMeetings,
        totalAttendance: m.totalAttendance,
        avgAttendance: m.avgAttendance,
        circleCount: m.circleCount,
      }));
    } else if (breakdown === 'week') {
      items = summary.byWeek.map((w) => ({
        label: w.weekLabel,
        totalMeetings: w.totalMeetings,
        totalAttendance: w.totalAttendance,
        avgAttendance: w.avgAttendance,
        circleCount: w.circleCount,
      }));
    } else if (breakdown === 'day') {
      items = summary.byDayOfWeek.map((d) => ({
        label: d.day,
        totalMeetings: d.totalMeetings,
        totalAttendance: d.totalAttendance,
        avgAttendance: d.avgAttendance,
        circleCount: d.circleCount,
      }));
    } else if (breakdown === 'type') {
      items = summary.byType.map((t) => ({
        label: t.circleType,
        totalMeetings: t.totalMeetings,
        totalAttendance: t.totalAttendance,
        avgAttendance: t.avgAttendance,
        circleCount: t.circleCount,
      }));
    } else {
      items = summary.byCampus.map((c) => ({
        label: c.campus,
        totalMeetings: c.totalMeetings,
        totalAttendance: c.totalAttendance,
        avgAttendance: c.avgAttendance,
        circleCount: c.circleCount,
      }));
    }

    const max = items.reduce((m, r) => Math.max(m, r.totalAttendance), 0);
    return { rows: items, maxAttendance: max };
  })();

  // ── Formatted date range label ─────────────────────────────
  const dateRangeLabel = summary
    ? `${formatDateLabel(summary.dateRangeStart)} – ${formatDateLabel(summary.dateRangeEnd)}`
    : '';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      {/* ── Header ── */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
            <ChartIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
              Attendance Overview
            </h2>
            {dateRangeLabel && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{dateRangeLabel}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => setIsVisible((v) => !v)}
          className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
        >
          {isVisible ? 'Hide' : 'Show'}
        </button>
      </div>

      {isVisible && (
        <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-5">
          {/* ── Controls ── */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Period:</label>
              <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-gray-600">
                {TIME_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeRange(opt.value)}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                      timeRange === opt.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Loading / Error states ── */}
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Loading attendance data…</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="text-sm text-red-500 dark:text-red-400 p-3 border border-red-200 dark:border-red-800 rounded-lg">
              Failed to load attendance data: {error}
            </div>
          )}

          {!isLoading && !error && summary && (
            <>
              {/* ── Summary stat cards ── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <StatCard
                  icon={<CirclesIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                  bg="bg-blue-50 dark:bg-blue-900/20"
                  label="Active Circles"
                  value={summary.totalCircles.toLocaleString()}
                />
                <StatCard
                  icon={<UsersIcon className="w-5 h-5 text-green-600 dark:text-green-400" />}
                  bg="bg-green-50 dark:bg-green-900/20"
                  label="Total Attendance"
                  value={summary.totalAttendance.toLocaleString()}
                />
                <StatCard
                  icon={<ChartIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
                  bg="bg-purple-50 dark:bg-purple-900/20"
                  label="Avg / Meeting"
                  value={summary.avgAttendancePerMeeting.toLocaleString()}
                />
                <StatCard
                  icon={
                    <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                  bg="bg-orange-50 dark:bg-orange-900/20"
                  label="Did Not Meet"
                  value={summary.didNotMeetCount.toLocaleString()}
                />
                <StatCard
                  icon={
                    <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                  bg="bg-gray-100 dark:bg-gray-700/40"
                  label="No Record"
                  value={summary.noRecordCount.toLocaleString()}
                />
              </div>

              {/* ── Breakdown selector + table ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">View:</span>
                  <div className="flex flex-wrap gap-1">
                    {BREAKDOWN_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setBreakdown(opt.value)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          breakdown === opt.value
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <BreakdownTable rows={rows} maxAttendance={maxAttendance} />
              </div>
            </>
          )}

          {!isLoading && !error && !summary && (
            <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
              No attendance data available.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── StatCard sub-component ─────────────────────────────────

function StatCard({
  icon,
  bg,
  label,
  value,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: string;
}) {
  return (
    <div className={`${bg} rounded-lg p-3 flex flex-col gap-1`}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs text-gray-600 dark:text-gray-400 font-medium leading-tight">{label}</span>
      </div>
      <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}
