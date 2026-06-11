'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Download,
  FileText,
  Filter,
  RefreshCw,
  Users,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import ProtectedRoute from '../../components/ProtectedRoute';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

type EventStatus = 'met' | 'did_not_meet' | 'no_summary';

type Summary = {
  expected: number;
  met: number;
  didNotMeet: number;
  noSummary: number;
  compliancePct: number;
  totalAttendance: number;
  averageCircleSize: number;
};

type WeeklyEvent = {
  week_start_date: string;
  leader_id: number;
  leader_name: string;
  circle_name: string;
  leader_status: string;
  campus: string;
  circle_type: string;
  scheduled_date: string;
  scheduled_time: string;
  frequency: string;
  status: EventStatus;
  status_label: string;
  attendance_count: number | null;
  notes_submitted: boolean;
  did_not_meet_reason: string | null;
  source: 'radius' | 'ccb' | 'snapshot' | 'none';
};

type TrendPoint = Summary & {
  week_start_date: string;
  label: string;
};

type Breakdown = Summary & {
  name: string;
};

type ReasonInsight = {
  reason: string;
  count: number;
  category: 'valid' | 'coaching' | 'other';
};

type ReportingData = {
  filters: {
    rangePreset: string;
    startDate: string;
    endDate: string;
    selectedWeek: string;
    previousWeek: string;
    campuses: string[];
    circleTypes: string[];
    statuses: string[];
  };
  summary: Summary;
  selectedWeekSummary: Summary;
  wowTrend: {
    complianceDelta: number;
    attendanceDelta: number;
    expectedDelta: number;
  };
  weeklyEvents: WeeklyEvent[];
  weeklyTrend: TrendPoint[];
  reasonTrend: Array<{ week_start_date: string; valid: number; coaching: number; other: number }>;
  campusBreakdown: Breakdown[];
  circleTypeBreakdown: Breakdown[];
  didNotMeetInsights: {
    total: number;
    topReasons: ReasonInsight[];
    byReason: ReasonInsight[];
    byCategory: { valid: number; coaching: number; other: number };
  };
  csvRows: Record<string, string | number>[];
};

type ReferenceData = {
  campuses?: { id: number; value: string }[];
  circleTypes?: { id: number; value: string }[];
  statuses?: { id: number; value: string }[];
};

const RANGE_OPTIONS = [
  { value: 'current_week', label: 'Current week' },
  { value: 'previous_week', label: 'Previous week' },
  { value: 'semester_to_date', label: 'Semester to date' },
  { value: 'year_to_date', label: 'Year to date' },
  { value: 'custom', label: 'Custom range' },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeekSunday(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() - date.getDay());
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function csvEscape(value: string | number): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportRows(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function MetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'neutral' | 'green' | 'blue' | 'amber' | 'red';
  icon: typeof Users;
}) {
  const tones = {
    neutral: 'border-slate-700 bg-slate-900/70 text-slate-200',
    green: 'border-emerald-700/60 bg-emerald-950/30 text-emerald-100',
    blue: 'border-sky-700/60 bg-sky-950/30 text-sky-100',
    amber: 'border-amber-700/60 bg-amber-950/30 text-amber-100',
    red: 'border-rose-700/60 bg-rose-950/30 text-rose-100',
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-slate-400" />
      </div>
      {detail && <p className="mt-2 text-sm text-slate-400">{detail}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: EventStatus }) {
  const classes = {
    met: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    did_not_meet: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
    no_summary: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  };
  const labels = {
    met: 'Met',
    did_not_meet: 'Did Not Meet',
    no_summary: 'No Summary',
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[status]}`}>{labels[status]}</span>;
}

function TrendDelta({ value, suffix = '' }: { value: number; suffix?: string }) {
  const positive = value > 0;
  const negative = value < 0;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : RefreshCw;
  const className = positive ? 'text-emerald-300' : negative ? 'text-rose-300' : 'text-slate-400';
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${className}`}>
      <Icon className="h-4 w-4" />
      {positive ? '+' : ''}
      {value}
      {suffix}
    </span>
  );
}

function CircleReportingContent() {
  const [range, setRange] = useState('semester_to_date');
  const [weekStart, setWeekStart] = useState(startOfWeekSunday(todayISO()));
  const [startDate, setStartDate] = useState(addDays(startOfWeekSunday(todayISO()), -84));
  const [endDate, setEndDate] = useState(todayISO());
  const [campus, setCampus] = useState('');
  const [circleType, setCircleType] = useState('');
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState<'summary' | 'events' | 'trends' | 'did-not-meet'>('summary');
  const [data, setData] = useState<ReportingData | null>(null);
  const [refData, setRefData] = useState<ReferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/reference-data')
      .then((res) => res.json())
      .then(setRefData)
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('range', range);
      params.set('week_start_date', weekStart);
      if (range === 'custom') {
        params.set('start_date', startDate);
        params.set('end_date', endDate);
      }
      if (campus) params.append('campus', campus);
      if (circleType) params.append('circle_type', circleType);
      if (status) params.append('status', status);

      const res = await fetch(`/api/circle-reporting?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to load dashboard');
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [campus, circleType, endDate, range, startDate, status, weekStart]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const campusOptions = refData?.campuses?.map((item) => item.value).filter(Boolean) ?? data?.filters.campuses ?? [];
  const typeOptions = refData?.circleTypes?.map((item) => item.value).filter(Boolean) ?? data?.filters.circleTypes ?? [];
  const statusOptions = refData?.statuses?.map((item) => item.value).filter(Boolean) ?? data?.filters.statuses ?? [];

  const complianceChartData = useMemo(() => {
    if (!data?.weeklyTrend.length) return null;
    return {
      labels: data.weeklyTrend.map((point) => point.label),
      datasets: [
        {
          label: 'Compliance %',
          data: data.weeklyTrend.map((point) => point.compliancePct),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.12)',
          tension: 0.25,
          fill: true,
          pointRadius: 3,
        },
      ],
    };
  }, [data?.weeklyTrend]);

  const attendanceChartData = useMemo(() => {
    if (!data?.weeklyTrend.length) return null;
    return {
      labels: data.weeklyTrend.map((point) => point.label),
      datasets: [
        {
          label: 'Total attendance',
          data: data.weeklyTrend.map((point) => point.totalAttendance),
          backgroundColor: 'rgba(59, 130, 246, 0.75)',
          borderColor: '#60a5fa',
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    };
  }, [data?.weeklyTrend]);

  const statusChartData = useMemo(() => {
    if (!data?.weeklyTrend.length) return null;
    return {
      labels: data.weeklyTrend.map((point) => point.label),
      datasets: [
        { label: 'Met', data: data.weeklyTrend.map((point) => point.met), backgroundColor: '#22c55e' },
        { label: 'Did Not Meet', data: data.weeklyTrend.map((point) => point.didNotMeet), backgroundColor: '#38bdf8' },
        { label: 'No Summary', data: data.weeklyTrend.map((point) => point.noSummary), backgroundColor: '#f43f5e' },
      ],
    };
  }, [data?.weeklyTrend]);

  const reasonChartData = useMemo(() => {
    if (!data?.reasonTrend.length) return null;
    return {
      labels: data.reasonTrend.map((point) => formatShortDate(point.week_start_date)),
      datasets: [
        { label: 'Valid', data: data.reasonTrend.map((point) => point.valid), backgroundColor: '#22c55e' },
        { label: 'Coaching', data: data.reasonTrend.map((point) => point.coaching), backgroundColor: '#f59e0b' },
        { label: 'Other', data: data.reasonTrend.map((point) => point.other), backgroundColor: '#94a3b8' },
      ],
    };
  }, [data?.reasonTrend]);

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#cbd5e1' } },
      tooltip: { backgroundColor: '#0f172a', titleColor: '#f8fafc', bodyColor: '#cbd5e1' },
    },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148, 163, 184, 0.12)' } },
      y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148, 163, 184, 0.12)' } },
    },
  };

  const stackedOptions = {
    ...lineOptions,
    scales: {
      x: { stacked: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148, 163, 184, 0.12)' } },
      y: { stacked: true, beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148, 163, 184, 0.12)' } },
    },
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Adult Circles</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Circle Reporting Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Supabase-backed view of expected meetings, submitted summaries, attendance, and did-not-meet trends.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              disabled={!data?.csvRows.length}
              onClick={() => data && exportRows(`circle-weekly-events-${data.filters.selectedWeek}.csv`, data.csvRows)}
              className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-900/40 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export weekly CSV
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Filter className="h-4 w-4" />
            Filters
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            <label className="text-sm text-slate-300">
              Date range
              <select
                value={range}
                onChange={(event) => setRange(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                {RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-300">
              Weekly events week
              <input
                type="date"
                value={weekStart}
                onChange={(event) => setWeekStart(startOfWeekSunday(event.target.value))}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-sm text-slate-300">
              Campus
              <select
                value={campus}
                onChange={(event) => setCampus(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="">All campuses</option>
                {campusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-300">
              Circle type
              <select
                value={circleType}
                onChange={(event) => setCircleType(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="">All types</option>
                {typeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-300">
              Current status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="">All statuses</option>
                {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            {range === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm text-slate-300">
                  Start
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="text-sm text-slate-300">
                  End
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-lg border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-100">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-8 rounded-lg border border-slate-800 bg-slate-900/70 p-8 text-center text-slate-400">
            Loading reporting data...
          </div>
        )}

        {!loading && data && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard icon={CalendarDays} label="Expected to meet" value={data.summary.expected} detail={`${formatDate(data.filters.startDate)} - ${formatDate(data.filters.endDate)}`} />
              <MetricCard icon={Users} label="Circles met" value={data.summary.met} detail={`${data.summary.totalAttendance} total attendance`} tone="green" />
              <MetricCard icon={AlertTriangle} label="Did not meet" value={data.summary.didNotMeet} detail={`${data.summary.noSummary} no summary`} tone="blue" />
              <MetricCard icon={FileText} label="Compliance" value={`${data.summary.compliancePct}%`} detail={`Avg size ${data.summary.averageCircleSize}`} tone={data.summary.compliancePct >= 85 ? 'green' : data.summary.compliancePct >= 70 ? 'amber' : 'red'} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-sm text-slate-400">Selected week compliance</p>
                <div className="mt-2 flex items-end justify-between">
                  <p className="text-2xl font-semibold text-white">{data.selectedWeekSummary.compliancePct}%</p>
                  <TrendDelta value={data.wowTrend.complianceDelta} suffix=" pts" />
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-sm text-slate-400">Selected week attendance</p>
                <div className="mt-2 flex items-end justify-between">
                  <p className="text-2xl font-semibold text-white">{data.selectedWeekSummary.totalAttendance}</p>
                  <TrendDelta value={data.wowTrend.attendanceDelta} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-sm text-slate-400">Selected week expected circles</p>
                <div className="mt-2 flex items-end justify-between">
                  <p className="text-2xl font-semibold text-white">{data.selectedWeekSummary.expected}</p>
                  <TrendDelta value={data.wowTrend.expectedDelta} />
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                ['summary', 'Executive Summary'],
                ['events', 'Weekly Events'],
                ['trends', 'Historical Trends'],
                ['did-not-meet', 'Did Not Meet Insights'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value as typeof tab)}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${tab === value ? 'bg-emerald-500 text-slate-950' : 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'summary' && (
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                  <h2 className="text-base font-semibold text-white">Compliance by Week</h2>
                  <div className="mt-4 h-72">{complianceChartData ? <Line data={complianceChartData} options={lineOptions as any} /> : <EmptyState />}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                  <h2 className="text-base font-semibold text-white">Attendance by Week</h2>
                  <div className="mt-4 h-72">{attendanceChartData ? <Bar data={attendanceChartData} options={lineOptions as any} /> : <EmptyState />}</div>
                </div>
                <BreakdownTable title="Campus Breakdown" rows={data.campusBreakdown} />
                <BreakdownTable title="Circle Type Breakdown" rows={data.circleTypeBreakdown} />
              </div>
            )}

            {tab === 'events' && (
              <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/70">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 p-4">
                  <div>
                    <h2 className="text-base font-semibold text-white">Weekly Events</h2>
                    <p className="text-sm text-slate-400">{formatDate(data.filters.selectedWeek)} week</p>
                  </div>
                  <p className="text-sm text-slate-400">{data.weeklyEvents.length} expected events</p>
                </div>
                {data.weeklyEvents.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-800 text-sm">
                      <thead className="bg-slate-950/60 text-left text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Leader</th>
                          <th className="px-4 py-3">Circle</th>
                          <th className="px-4 py-3">Current Status</th>
                          <th className="px-4 py-3">Campus</th>
                          <th className="px-4 py-3">Scheduled</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Attendance</th>
                          <th className="px-4 py-3">Notes</th>
                          <th className="px-4 py-3">Did Not Meet Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {data.weeklyEvents.map((event) => (
                          <tr key={`${event.leader_id}-${event.week_start_date}`} className="hover:bg-slate-800/40">
                            <td className="px-4 py-3 font-medium text-white">{event.leader_name}</td>
                            <td className="px-4 py-3 text-slate-300">{event.circle_name}</td>
                            <td className="px-4 py-3 text-slate-300">{event.leader_status}</td>
                            <td className="px-4 py-3 text-slate-300">{event.campus}</td>
                            <td className="px-4 py-3 text-slate-300">{formatDate(event.scheduled_date)} {event.scheduled_time}</td>
                            <td className="px-4 py-3"><StatusBadge status={event.status} /></td>
                            <td className="px-4 py-3 text-slate-300">{event.attendance_count ?? '-'}</td>
                            <td className="px-4 py-3 text-slate-300">{event.notes_submitted ? 'Yes' : 'No'}</td>
                            <td className="max-w-xs px-4 py-3 text-slate-300">{event.did_not_meet_reason || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tab === 'trends' && (
              <div className="mt-5 grid gap-5">
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                  <h2 className="text-base font-semibold text-white">Weekly Status Mix</h2>
                  <div className="mt-4 h-80">{statusChartData ? <Bar data={statusChartData} options={stackedOptions as any} /> : <EmptyState />}</div>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/70">
                  <table className="min-w-full divide-y divide-slate-800 text-sm">
                    <thead className="bg-slate-950/60 text-left text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Week</th>
                        <th className="px-4 py-3">Expected</th>
                        <th className="px-4 py-3">Met</th>
                        <th className="px-4 py-3">Did Not Meet</th>
                        <th className="px-4 py-3">No Summary</th>
                        <th className="px-4 py-3">Compliance</th>
                        <th className="px-4 py-3">Attendance</th>
                        <th className="px-4 py-3">Avg Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {data.weeklyTrend.map((point) => (
                        <tr key={point.week_start_date}>
                          <td className="px-4 py-3 text-white">{formatDate(point.week_start_date)}</td>
                          <td className="px-4 py-3 text-slate-300">{point.expected}</td>
                          <td className="px-4 py-3 text-slate-300">{point.met}</td>
                          <td className="px-4 py-3 text-slate-300">{point.didNotMeet}</td>
                          <td className="px-4 py-3 text-slate-300">{point.noSummary}</td>
                          <td className="px-4 py-3 text-slate-300">{point.compliancePct}%</td>
                          <td className="px-4 py-3 text-slate-300">{point.totalAttendance}</td>
                          <td className="px-4 py-3 text-slate-300">{point.averageCircleSize}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'did-not-meet' && (
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                  <h2 className="text-base font-semibold text-white">Reason Categories Over Time</h2>
                  <div className="mt-4 h-72">{reasonChartData ? <Bar data={reasonChartData} options={stackedOptions as any} /> : <EmptyState />}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                  <h2 className="text-base font-semibold text-white">Top Reasons</h2>
                  <div className="mt-4 space-y-3">
                    {data.didNotMeetInsights.topReasons.length === 0 ? (
                      <EmptyState />
                    ) : (
                      data.didNotMeetInsights.topReasons.map((reason, index) => (
                        <div key={reason.reason} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">{index + 1}. {reason.reason}</p>
                              <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{reason.category}</p>
                            </div>
                            <p className="text-lg font-semibold text-white">{reason.count}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 lg:col-span-2">
                  <h2 className="text-base font-semibold text-white">All Did Not Meet Reasons</h2>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-800 text-sm">
                      <thead className="bg-slate-950/60 text-left text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Reason</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Count</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {data.didNotMeetInsights.byReason.map((reason) => (
                          <tr key={reason.reason}>
                            <td className="px-4 py-3 text-white">{reason.reason}</td>
                            <td className="px-4 py-3 capitalize text-slate-300">{reason.category}</td>
                            <td className="px-4 py-3 text-slate-300">{reason.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
      No reporting data for the selected filters.
    </div>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: Breakdown[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/70">
      <div className="border-b border-slate-800 p-4">
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-950/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">Expected</th>
              <th className="px-4 py-3">Met</th>
              <th className="px-4 py-3">Did Not Meet</th>
              <th className="px-4 py-3">No Summary</th>
              <th className="px-4 py-3">Compliance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="px-4 py-3 font-medium text-white">{row.name}</td>
                <td className="px-4 py-3 text-slate-300">{row.expected}</td>
                <td className="px-4 py-3 text-slate-300">{row.met}</td>
                <td className="px-4 py-3 text-slate-300">{row.didNotMeet}</td>
                <td className="px-4 py-3 text-slate-300">{row.noSummary}</td>
                <td className="px-4 py-3 text-slate-300">{row.compliancePct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function CircleReportingPage() {
  return (
    <ProtectedRoute>
      <CircleReportingContent />
    </ProtectedRoute>
  );
}
