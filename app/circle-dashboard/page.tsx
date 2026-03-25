'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AlertTriangle, TrendingDown, UserRound } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import ProtectedRoute from '../../components/ProtectedRoute';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// ── Types ──────────────────────────────────────────────────────

interface WeeklyTrend {
  week: string;
  label: string;
  avgAttendance: number;
  totalHeadcount: number;
  meetingsHeld: number;
  didNotMeet: number;
  noRecord: number;
}

interface BreakdownItem {
  campus?: string;
  type?: string;
  day?: string;
  time?: string;
  avgAttendance: number;
  circleCount: number;
}

interface LeaderRank {
  id: number;
  name: string;
  campus?: string;
  avg: number;
}

interface AlertItem {
  id: number;
  name: string;
  campus?: string;
  reason: 'declining' | 'no_report' | 'low_attendance';
  detail: string;
}

interface DashboardData {
  summary: {
    totalActiveCircles: number;
    avgAttendance: number;
    avgCircleSize: number;
    totalMeetings: number;
    totalHeadcount: number;
    attendanceTrend: 'up' | 'down' | 'flat';
    growthPct: number;
    peakAttendance: number;
    lastSyncedAt: string | null;
    latestMeetingDate: string | null;
  };
  weeklyTrend: WeeklyTrend[];
  campusBreakdown: BreakdownItem[];
  typeBreakdown: BreakdownItem[];
  dayBreakdown: BreakdownItem[];
  timeBreakdown: BreakdownItem[];
  topFive: LeaderRank[];
  bottomFive: LeaderRank[];
  alerts: AlertItem[];
}

interface FilterState {
  campus: string[];
  circleType: string[];
  day: string[];
  acpd: string[];
  time: string;
  months: number;
}

interface ReferenceData {
  campuses: { id: number; value: string }[];
  circleTypes: { id: number; value: string }[];
  acpds?: string[];
}

// ── Chart Colors ───────────────────────────────────────────────

const CHART_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
];

const CHART_COLORS_ALPHA = CHART_COLORS.map((c) => c + '99');

const DAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_OPTIONS = [
  { value: 'all', label: 'All Times' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

const STORAGE_KEY = 'radiusCircleDashboardFilters';

const defaultFilterState: FilterState = { campus: [], circleType: [], day: [], acpd: [], time: 'all', months: 6 };

// ── Page Component ─────────────────────────────────────────────

function parseFiltersFromParams(params: URLSearchParams): FilterState {
  const campus = params.getAll('campus').filter(Boolean);
  const circleType = params.getAll('circleType').filter(Boolean);
  const day = params.getAll('day').filter(Boolean);
  const acpd = params.getAll('acpd').filter(Boolean);
  const time = params.get('time') || 'all';
  const monthsRaw = parseInt(params.get('months') || '', 10);
  const months = [3, 6, 12].includes(monthsRaw) ? monthsRaw : 6;
  return { campus, circleType, day, acpd, time, months };
}

function hasUrlFilterParams(params: URLSearchParams): boolean {
  return (
    params.getAll('campus').filter(Boolean).length > 0 ||
    params.getAll('circleType').filter(Boolean).length > 0 ||
    params.getAll('day').filter(Boolean).length > 0 ||
    params.getAll('acpd').filter(Boolean).length > 0 ||
    (params.get('time') !== null && params.get('time') !== 'all') ||
    params.get('months') !== null
  );
}

function loadFiltersFromStorage(): FilterState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return {
      campus: Array.isArray(parsed.campus) ? parsed.campus : [],
      circleType: Array.isArray(parsed.circleType) ? parsed.circleType : [],
      day: Array.isArray(parsed.day) ? parsed.day : [],
      acpd: Array.isArray(parsed.acpd) ? parsed.acpd : [],
      time: typeof parsed.time === 'string' ? parsed.time : 'all',
      months: [3, 6, 12].includes(parsed.months) ? parsed.months : 6,
    };
  } catch {
    return null;
  }
}

function saveFiltersToStorage(filters: FilterState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {}
}

function filtersToParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  filters.campus.forEach((c) => params.append('campus', c));
  filters.circleType.forEach((t) => params.append('circleType', t));
  filters.day.forEach((d) => params.append('day', d));
  filters.acpd.forEach((a) => params.append('acpd', a));
  if (filters.time !== 'all') params.set('time', filters.time);
  if (filters.months !== 6) params.set('months', filters.months.toString());
  return params;
}

function CircleDashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [data, setData] = useState<DashboardData | null>(null);
  const [refData, setRefData] = useState<ReferenceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(() => {
    // URL params take priority; otherwise fall back to localStorage
    if (hasUrlFilterParams(searchParams)) {
      return parseFiltersFromParams(searchParams);
    }
    return loadFiltersFromStorage() || defaultFilterState;
  });
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const isInitialMount = useRef(true);

  // Sync filter state to URL & localStorage on every change
  useEffect(() => {
    // Save to localStorage
    saveFiltersToStorage(filters);

    // Sync to URL (skip on initial mount to avoid replacing the URL before the page finishes loading)
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // Still update URL on initial mount to reflect loaded-from-storage filters
    }
    const params = filtersToParams(filters);
    const qs = params.toString();
    const newUrl = qs ? `${pathname}?${qs}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [filters, pathname, router]);

  // Load reference data once
  useEffect(() => {
    fetch('/api/reference-data')
      .then((r) => r.json())
      .then((d) => setRefData(d))
      .catch(() => {});
  }, []);

  // Load dashboard data when filters change
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      filters.campus.forEach((c) => params.append('campus', c));
      filters.circleType.forEach((t) => params.append('circleType', t));
      filters.day.forEach((d) => params.append('day', d));
      filters.acpd.forEach((a) => params.append('acpd', a));
      if (filters.time !== 'all') params.set('time', filters.time);
      params.set('months', filters.months.toString());

      const res = await fetch(`/api/circle-dashboard?${params}`);
      if (!res.ok) throw new Error('Failed to load data');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFilterToggle = useCallback((key: 'campus' | 'circleType' | 'day' | 'acpd', value: string) => {
    setFilters((prev) => {
      const arr = prev[key];
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  }, []);

  const clearFilters = () => {
    setFilters(defaultFilterState);
  };

  const activeFilterCount =
    filters.campus.length + filters.circleType.length + filters.day.length + filters.acpd.length + (filters.time !== 'all' ? 1 : 0);

  // ── Chart Data ──────────────────────────────────────────────

  const trendChartData = useMemo(() => {
    if (!data?.weeklyTrend?.length) return null;
    return {
      labels: data.weeklyTrend.map((w) => w.label),
      datasets: [
        {
          label: 'Avg Attendance',
          data: data.weeklyTrend.map((w) => w.avgAttendance),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#3b82f6',
        },
      ],
    };
  }, [data?.weeklyTrend]);

  const trendChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#e5e7eb',
          bodyColor: '#9ca3af',
          borderColor: 'rgba(75, 85, 99, 0.3)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (ctx: any) => `Avg: ${ctx.parsed.y} people`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#9ca3af', font: { size: 10 }, maxRotation: 45 },
          grid: { color: 'rgba(75, 85, 99, 0.15)' },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#9ca3af', stepSize: 2 },
          grid: { color: 'rgba(75, 85, 99, 0.15)' },
        },
      },
    }),
    []
  );

  const campusBarData = useMemo(() => {
    if (!data?.campusBreakdown?.length) return null;
    return {
      labels: data.campusBreakdown.map((c) => c.campus),
      datasets: [
        {
          label: 'Avg Attendance',
          data: data.campusBreakdown.map((c) => c.avgAttendance),
          backgroundColor: CHART_COLORS_ALPHA.slice(0, data.campusBreakdown.length),
          borderColor: CHART_COLORS.slice(0, data.campusBreakdown.length),
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    };
  }, [data?.campusBreakdown]);

  const typeBarData = useMemo(() => {
    if (!data?.typeBreakdown?.length) return null;
    return {
      labels: data.typeBreakdown.map((t) => t.type),
      datasets: [
        {
          label: 'Avg Attendance',
          data: data.typeBreakdown.map((t) => t.avgAttendance),
          backgroundColor: CHART_COLORS_ALPHA.slice(0, data.typeBreakdown.length),
          borderColor: CHART_COLORS.slice(0, data.typeBreakdown.length),
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    };
  }, [data?.typeBreakdown]);

  const dayBarData = useMemo(() => {
    if (!data?.dayBreakdown?.length) return null;
    return {
      labels: data.dayBreakdown.map((d) => d.day),
      datasets: [
        {
          label: 'Avg Attendance',
          data: data.dayBreakdown.map((d) => d.avgAttendance),
          backgroundColor: CHART_COLORS_ALPHA.slice(0, data.dayBreakdown.length),
          borderColor: CHART_COLORS.slice(0, data.dayBreakdown.length),
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    };
  }, [data?.dayBreakdown]);

  const dayRingData = useMemo(() => {
    if (!data?.dayBreakdown?.length) return null;
    return {
      labels: data.dayBreakdown.map((d) => d.day),
      datasets: [
        {
          data: data.dayBreakdown.map((d) => d.circleCount),
          backgroundColor: CHART_COLORS.slice(0, data.dayBreakdown.length),
          borderColor: 'rgba(17, 24, 39, 1)',
          borderWidth: 2,
        },
      ],
    };
  }, [data?.dayBreakdown]);

  const typeRingData = useMemo(() => {
    if (!data?.typeBreakdown?.length) return null;
    return {
      labels: data.typeBreakdown.map((t) => t.type),
      datasets: [
        {
          data: data.typeBreakdown.map((t) => t.circleCount),
          backgroundColor: CHART_COLORS.slice(0, data.typeBreakdown.length),
          borderColor: 'rgba(17, 24, 39, 1)',
          borderWidth: 2,
        },
      ],
    };
  }, [data?.typeBreakdown]);

  const timeBarData = useMemo(() => {
    if (!data?.timeBreakdown?.length) return null;
    return {
      labels: data.timeBreakdown.map((t) => t.time),
      datasets: [
        {
          label: 'Avg Attendance',
          data: data.timeBreakdown.map((t) => t.avgAttendance),
          backgroundColor: CHART_COLORS_ALPHA.slice(0, data.timeBreakdown.length),
          borderColor: CHART_COLORS.slice(0, data.timeBreakdown.length),
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    };
  }, [data?.timeBreakdown]);

  const barOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#e5e7eb',
          bodyColor: '#9ca3af',
          borderColor: 'rgba(75, 85, 99, 0.3)',
          borderWidth: 1,
          padding: 10,
        },
      },
      scales: {
        x: {
          ticks: { color: '#9ca3af', font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#9ca3af', stepSize: 2 },
          grid: { color: 'rgba(75, 85, 99, 0.15)' },
        },
      },
    }),
    []
  );

  const ringOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: { color: '#9ca3af', padding: 12, font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 },
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#e5e7eb',
          bodyColor: '#9ca3af',
          borderColor: 'rgba(75, 85, 99, 0.3)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (ctx: any) => `${ctx.label}: ${ctx.parsed} circles`,
          },
        },
      },
    }),
    []
  );

  // ── Drill-Down (click chart segment → toggle filter) ────────

  const makeDrillDown = useCallback(
    (handler: (label: string) => void) => ({
      onClick: (_e: any, els: any[], chart: any) => {
        if (!els.length) return;
        const label = String(chart.data.labels?.[els[0].index] || '');
        if (label) {
          handler(label);
          setFiltersVisible(true);
        }
      },
      onHover: (event: any, elements: any[]) => {
        const target = event.native?.target;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
    }),
    []
  );

  const campusBarOpts = useMemo(
    () => ({ ...barOptions, ...makeDrillDown((l) => handleFilterToggle('campus', l)) }),
    [barOptions, makeDrillDown, handleFilterToggle]
  );
  const typeBarOpts = useMemo(
    () => ({ ...barOptions, ...makeDrillDown((l) => handleFilterToggle('circleType', l)) }),
    [barOptions, makeDrillDown, handleFilterToggle]
  );
  const dayBarOpts = useMemo(
    () => ({ ...barOptions, ...makeDrillDown((l) => handleFilterToggle('day', l)) }),
    [barOptions, makeDrillDown, handleFilterToggle]
  );
  const timeBarOpts = useMemo(
    () => ({
      ...barOptions,
      ...makeDrillDown((l) => setFilters((p) => ({ ...p, time: p.time === l.toLowerCase() ? 'all' : l.toLowerCase() }))),
    }),
    [barOptions, makeDrillDown]
  );
  const dayRingOpts = useMemo(
    () => ({ ...ringOptions, ...makeDrillDown((l) => handleFilterToggle('day', l)) }),
    [ringOptions, makeDrillDown, handleFilterToggle]
  );
  const typeRingOpts = useMemo(
    () => ({ ...ringOptions, ...makeDrillDown((l) => handleFilterToggle('circleType', l)) }),
    [ringOptions, makeDrillDown, handleFilterToggle]
  );

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 mobile-nav-padding">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Circle Dashboard</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Attendance insights across all Circles
            </p>
            {data && <FreshnessBadge lastSyncedAt={data.summary.lastSyncedAt} latestMeetingDate={data.summary.latestMeetingDate} />}
          </div>
          <div className="flex items-center gap-2">
            {/* Range selector */}
            <div className="flex rounded-lg overflow-hidden border border-gray-700/50">
              {[3, 6, 12].map((m) => (
                <button
                  key={m}
                  onClick={() => setFilters((p) => ({ ...p, months: m }))}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    filters.months === m
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {m}mo
                </button>
              ))}
            </div>
            <button
              onClick={() => setFiltersVisible((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                activeFilterCount > 0
                  ? 'border-blue-500/50 bg-blue-600/10 text-blue-400'
                  : 'border-gray-700/50 bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-blue-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        {filtersVisible && (
          <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-4 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
              {/* Campus */}
              <div>
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2.5 block">Campus</label>
                <div className="flex flex-wrap gap-1.5">
                  {refData?.campuses?.map((c) => {
                    const active = filters.campus.includes(c.value);
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleFilterToggle('campus', c.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          active
                            ? 'bg-emerald-500 text-white ring-2 ring-emerald-300/70 shadow-lg shadow-emerald-500/40 scale-105'
                            : 'bg-gray-800/60 text-gray-500 hover:bg-gray-700/80 hover:text-gray-200 border border-gray-700/40'
                        }`}
                      >
                        {c.value}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Circle Type */}
              <div>
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2.5 block">Circle Type</label>
                <div className="flex flex-wrap gap-1.5">
                  {refData?.circleTypes?.filter((t) => t.value && !['[object Object]', 'Admin', 'Circle'].includes(t.value)).map((t) => {
                    const active = filters.circleType.includes(t.value);
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleFilterToggle('circleType', t.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          active
                            ? 'bg-emerald-500 text-white ring-2 ring-emerald-300/70 shadow-lg shadow-emerald-500/40 scale-105'
                            : 'bg-gray-800/60 text-gray-500 hover:bg-gray-700/80 hover:text-gray-200 border border-gray-700/40'
                        }`}
                      >
                        {t.value}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Day */}
              <div>
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2.5 block">Meeting Day</label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_OPTIONS.map((d) => {
                    const active = filters.day.includes(d);
                    return (
                      <button
                        key={d}
                        onClick={() => handleFilterToggle('day', d)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          active
                            ? 'bg-emerald-500 text-white ring-2 ring-emerald-300/70 shadow-lg shadow-emerald-500/40 scale-105'
                            : 'bg-gray-800/60 text-gray-500 hover:bg-gray-700/80 hover:text-gray-200 border border-gray-700/40'
                        }`}
                      >
                        {d.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ACPD */}
              <div>
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2.5 block">ACPD</label>
                <div className="flex flex-wrap gap-1.5">
                  {refData?.acpds?.map((a) => {
                    const active = filters.acpd.includes(a);
                    return (
                      <button
                        key={a}
                        onClick={() => handleFilterToggle('acpd', a)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          active
                            ? 'bg-emerald-500 text-white ring-2 ring-emerald-300/70 shadow-lg shadow-emerald-500/40 scale-105'
                            : 'bg-gray-800/60 text-gray-500 hover:bg-gray-700/80 hover:text-gray-200 border border-gray-700/40'
                        }`}
                      >
                        {a.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time of Day */}
              <div>
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2.5 block">Time of Day</label>
                <div className="flex flex-wrap gap-1.5">
                  {TIME_OPTIONS.map((t) => {
                    const active = filters.time === t.value;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setFilters((p) => ({ ...p, time: t.value }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          active
                            ? 'bg-emerald-500 text-white ring-2 ring-emerald-300/70 shadow-lg shadow-emerald-500/40 scale-105'
                            : 'bg-gray-800/60 text-gray-500 hover:bg-gray-700/80 hover:text-gray-200 border border-gray-700/40'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-700/30 flex justify-end">
                <button
                  onClick={clearFilters}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-400 hover:text-white bg-gray-800/60 hover:bg-gray-700/80 border border-gray-700/50 transition-colors"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-4 animate-pulse">
                  <div className="h-3 w-16 bg-gray-700 rounded mb-3" />
                  <div className="h-7 w-20 bg-gray-700 rounded" />
                </div>
              ))}
            </div>
            <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-4 animate-pulse h-64" />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-4 text-center">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={loadData} className="mt-2 text-xs text-red-300 hover:text-white underline">
              Retry
            </button>
          </div>
        )}

        {/* Dashboard Content */}
        {data && !isLoading && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard
                label="Active Circles"
                value={data.summary.totalActiveCircles}
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                }
                color="blue"
              />
              <SummaryCard
                label="Avg Attendance"
                value={data.summary.avgAttendance}
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                }
                color="green"
              />
              <SummaryCard
                label="Avg Circle Size"
                value={data.summary.avgCircleSize}
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z\" />\n                  </svg>
                }
                color="purple"
              />
              <SummaryCard
                label="Trend"
                value={
                  data.summary.attendanceTrend === 'up'
                    ? `+${data.summary.growthPct}%`
                    : data.summary.attendanceTrend === 'down'
                    ? `${data.summary.growthPct}%`
                    : 'Steady'
                }
                icon={
                  data.summary.attendanceTrend === 'up' ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                    </svg>
                  ) : data.summary.attendanceTrend === 'down' ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                    </svg>
                  )
                }
                color={
                  data.summary.attendanceTrend === 'up'
                    ? 'green'
                    : data.summary.attendanceTrend === 'down'
                    ? 'red'
                    : 'gray'
                }
              />
            </div>

            {/* Total Attendance Week-over-Week */}
            {data.weeklyTrend?.length > 0 && (
              <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Total Attendance</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Week over week &middot; <span className="text-white font-medium">{(data.summary.totalHeadcount ?? 0).toLocaleString()}</span> total
                    </p>
                  </div>
                </div>
                <div className="h-40">
                  <Bar
                    data={{
                      labels: data.weeklyTrend.map((w) => w.label),
                      datasets: [
                        {
                          label: 'Total Attendance',
                          data: data.weeklyTrend.map((w) => w.totalHeadcount),
                          backgroundColor: 'rgba(139, 92, 246, 0.5)',
                          borderColor: 'rgb(139, 92, 246)',
                          borderWidth: 1,
                          borderRadius: 4,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => `${(ctx.parsed.y ?? 0).toLocaleString()} total`,
                          },
                        },
                      },
                      scales: {
                        x: {
                          ticks: { color: '#9ca3af', font: { size: 10 } },
                          grid: { display: false },
                        },
                        y: {
                          beginAtZero: true,
                          ticks: { color: '#9ca3af', font: { size: 10 } },
                          grid: { color: 'rgba(75, 85, 99, 0.3)' },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            )}

            {/* Needs Attention */}
            {data.alerts?.length > 0 && (
              <NeedsAttentionSection
                alerts={data.alerts}
                syncing={syncing}
                syncResult={syncResult}
                onSync={async () => {
                  setSyncing(true);
                  setSyncResult(null);
                  try {
                    const leaderIds = Array.from(new Set(data.alerts.map((a) => a.id)));
                    const res = await fetch('/api/ccb/sync-attention', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ leaderIds }),
                    });
                    const result = await res.json();
                    if (!res.ok) throw new Error(result.error || 'Sync failed');
                    const processed = result.leadersProcessed || 0;
                    const withData = result.leadersWithData || 0;
                    const synced = result.synced || 0;
                    const msg = processed === 0 && synced === 0
                      ? `No new data found in CCB for ${result.leadersRequested || 0} circles`
                      : `Updated ${withData} of ${processed} circles (${synced} records synced)`;
                    setSyncResult({ success: true, message: msg });
                    // Refresh dashboard data after a short delay so user sees the result
                    setTimeout(() => loadData(), 1500);
                  } catch (err: any) {
                    setSyncResult({ success: false, message: err.message || 'Sync failed' });
                  } finally {
                    setSyncing(false);
                  }
                }}
              />
            )}

            {/* Attendance Trend Line Chart */}
            {trendChartData && (
              <ChartCard title="Attendance Trend" subtitle="Average attendance per meeting, by week">
                <div className="h-56 sm:h-72">
                  <Line data={trendChartData} options={trendChartOptions} />
                </div>
              </ChartCard>
            )}

            {/* Two-column charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* By Campus */}
              {campusBarData && (
                <ChartCard title="By Campus" subtitle="Average attendance per campus" clickHint>
                  <div className="h-56 sm:h-64">
                    <Bar data={campusBarData} options={campusBarOpts} />
                  </div>
                </ChartCard>
              )}

              {/* By Circle Type */}
              {typeBarData && (
                <ChartCard title="By Circle Type" subtitle="Average attendance per type" clickHint>
                  <div className="h-56 sm:h-64">
                    <Bar data={typeBarData} options={typeBarOpts} />
                  </div>
                </ChartCard>
              )}

              {/* By Day */}
              {dayBarData && (
                <ChartCard title="By Meeting Day" subtitle="Average attendance per day" clickHint>
                  <div className="h-56 sm:h-64">
                    <Bar data={dayBarData} options={dayBarOpts} />
                  </div>
                </ChartCard>
              )}

              {/* By Time */}
              {timeBarData && (
                <ChartCard title="By Time of Day" subtitle="Average attendance by meeting time" clickHint>
                  <div className="h-56 sm:h-64">
                    <Bar data={timeBarData} options={timeBarOpts} />
                  </div>
                </ChartCard>
              )}
            </div>

            {/* Ring Charts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {dayRingData && (
                <ChartCard title="Circles by Day" subtitle="Distribution of Circles across meeting days" clickHint>
                  <div className="h-56 sm:h-64">
                    <Doughnut data={dayRingData} options={dayRingOpts} />
                  </div>
                </ChartCard>
              )}

              {typeRingData && (
                <ChartCard title="Circles by Type" subtitle="Distribution of Circles across types" clickHint>
                  <div className="h-56 sm:h-64">
                    <Doughnut data={typeRingData} options={typeRingOpts} />
                  </div>
                </ChartCard>
              )}
            </div>

            {/* Top & Bottom Circles */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {data.topFive?.length > 0 && (
                <RankingCard title="Top 5 Circles by Size" items={data.topFive} color="green" />
              )}
              {data.bottomFive?.length > 0 && (
                <RankingCard title="Bottom 5 Circles by Size" items={data.bottomFive} color="amber" />
              )}
            </div>

            {/* Campus Breakdown Table */}
            {data.campusBreakdown?.length > 0 && (
              <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-700/30">
                  <h3 className="text-sm font-semibold text-white">Campus Summary</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700/30">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Campus</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Active Circles</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Avg Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.campusBreakdown.map((c, i) => (
                        <tr key={i} className="border-b border-gray-800/30 hover:bg-gray-800/20 transition-colors">
                          <td className="px-4 py-2.5 text-gray-200">{c.campus}</td>
                          <td className="px-4 py-2.5 text-right text-gray-300">{c.circleCount}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-blue-400 font-medium">{c.avgAttendance}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!data.weeklyTrend?.length && !data.campusBreakdown?.length && (
              <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-12 text-center">
                <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                <p className="text-gray-400 text-sm">No attendance data for the selected filters.</p>
                <p className="text-gray-500 text-xs mt-1">Try adjusting your filters or time range.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reusable Components ────────────────────────────────────────

function FreshnessBadge({
  lastSyncedAt,
  latestMeetingDate,
}: {
  lastSyncedAt: string | null;
  latestMeetingDate: string | null;
}) {
  const { label, color, dotColor } = useMemo(() => {
    const refDate = lastSyncedAt || latestMeetingDate;
    if (!refDate) return { label: 'No data', color: 'text-gray-500', dotColor: 'bg-gray-500' };

    const ts = new Date(refDate);
    const now = new Date();
    const diffMs = now.getTime() - ts.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const formatted = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    if (diffDays < 1) return { label: `Updated today`, color: 'text-emerald-400', dotColor: 'bg-emerald-400' };
    if (diffDays <= 3) return { label: `Updated ${formatted}`, color: 'text-emerald-400', dotColor: 'bg-emerald-400' };
    if (diffDays <= 7) return { label: `Updated ${formatted}`, color: 'text-amber-400', dotColor: 'bg-amber-400' };
    return { label: `Updated ${formatted}`, color: 'text-red-400', dotColor: 'bg-red-400' };
  }, [lastSyncedAt, latestMeetingDate]);

  return (
    <div className={`flex items-center gap-1.5 mt-1 ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
      <span className="text-xs">{label}</span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'red' | 'gray' | 'amber';
}) {
  const colorMap = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    gray: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };

  const iconBg = {
    blue: 'bg-blue-500/15 text-blue-400',
    green: 'bg-emerald-500/15 text-emerald-400',
    purple: 'bg-purple-500/15 text-purple-400',
    red: 'bg-red-500/15 text-red-400',
    gray: 'bg-gray-500/15 text-gray-400',
    amber: 'bg-amber-500/15 text-amber-400',
  };

  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] sm:text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</span>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg[color]}`}>
          {icon}
        </span>
      </div>
      <p className="text-xl sm:text-2xl font-bold">{value}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  clickHint,
  children,
}: {
  title: string;
  subtitle?: string;
  clickHint?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {clickHint && (
          <span className="text-[10px] text-gray-500 bg-gray-800/60 px-2 py-0.5 rounded-full">Click to filter</span>
        )}
      </div>
      {children}
    </div>
  );
}

function RankingCard({
  title,
  items,
  color,
}: {
  title: string;
  items: LeaderRank[];
  color: 'green' | 'amber';
}) {
  const badgeColor = color === 'green' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400';

  return (
    <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700/30">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="divide-y divide-gray-800/30">
        {items.map((item, i) => (
          <Link
            key={item.id}
            href={`/circle/${item.id}`}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/20 transition-colors"
          >
            <span className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-400 font-medium shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 truncate">{item.name}</p>
              {item.campus && <p className="text-xs text-gray-500">{item.campus}</p>}
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>
              {item.avg} avg
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function NeedsAttentionSection({
  alerts,
  syncing,
  syncResult,
  onSync,
}: {
  alerts: AlertItem[];
  syncing: boolean;
  syncResult: { success: boolean; message: string } | null;
  onSync: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!alerts.length) return null;

  const reasonConfig = {
    no_report: { label: 'Not Reporting', color: 'bg-red-500/15 text-red-400 border-red-500/25', icon: AlertTriangle },
    declining: { label: 'Declining', color: 'bg-amber-500/15 text-amber-400 border-amber-500/25', icon: TrendingDown },
    low_attendance: { label: 'Low Attendance', color: 'bg-orange-500/15 text-orange-400 border-orange-500/25', icon: UserRound },
  };

  const shown = expanded ? alerts : alerts.slice(0, 5);
  const counts = { no_report: 0, declining: 0, low_attendance: 0 };
  alerts.forEach((a) => counts[a.reason]++);

  return (
    <div className="bg-gray-900/60 border border-red-500/20 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <h3 className="text-sm font-semibold text-white">Needs Attention</h3>
          <span className="text-xs text-gray-500">({alerts.length} circle{alerts.length !== 1 ? 's' : ''})</span>
        </div>
        <div className="flex items-center gap-2">
          {counts.no_report > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">{counts.no_report} not reporting</span>
          )}
          {counts.declining > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">{counts.declining} declining</span>
          )}
          {counts.low_attendance > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400">{counts.low_attendance} low</span>
          )}
        </div>
      </div>
      {/* Sync bar */}
      <div className="px-4 py-2.5 border-b border-gray-800/30 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">Pull latest attendance from CCB for all listed circles (last 4 weeks)</p>
        <button
          onClick={onSync}
          disabled={syncing}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {syncing ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Syncing…
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Update from CCB
            </>
          )}
        </button>
      </div>
      {syncResult && (
        <div className={`px-4 py-2 text-xs border-b border-gray-800/30 ${
          syncResult.success ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
        }`}>
          {syncResult.success ? '✓' : '✗'} {syncResult.message}
        </div>
      )}
      <div className="divide-y divide-gray-800/30">
        {shown.map((alert) => {
          const cfg = reasonConfig[alert.reason];
          const Icon = cfg.icon;
          return (
            <Link
              key={`${alert.id}-${alert.reason}`}
              href={`/circle/${alert.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/20 transition-colors"
            >
              <span className="shrink-0"><Icon className="h-4 w-4" /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 truncate">{alert.name}</p>
                {alert.campus && <p className="text-xs text-gray-500">{alert.campus}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${cfg.color}`}>
                  {cfg.label}
                </span>
                <span className="text-xs text-gray-500">{alert.detail}</span>
              </div>
            </Link>
          );
        })}
      </div>
      {alerts.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-2 text-xs text-gray-400 hover:text-white border-t border-gray-800/30 transition-colors"
        >
          {expanded ? 'Show less' : `Show all ${alerts.length} alerts`}
        </button>
      )}
    </div>
  );
}

// ── Page Export ─────────────────────────────────────────────────

import { Suspense } from 'react';

export default function CircleDashboardPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
        <CircleDashboardContent />
      </Suspense>
    </ProtectedRoute>
  );
}
