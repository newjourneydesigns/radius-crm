'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronsUpDown,
  Download,
  FileText,
  Filter,
  GitCompareArrows,
  Info,
  Layers,
  Minus,
  RefreshCw,
  Search,
  UserRound,
  Users,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import ProtectedRoute from '../../components/ProtectedRoute';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

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
  acpd?: string;
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
    acpds: string[];
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
  acpdBreakdown: Breakdown[];
  didNotMeetInsights: {
    total: number;
    topReasons: ReasonInsight[];
    byReason: ReasonInsight[];
    byCategory: { valid: number; coaching: number; other: number };
    notSpecified: number;
    notSpecifiedBySource: { radius: number; ccb: number; snapshot: number };
  };
  csvRows: Record<string, string | number>[];
};

type ReferenceData = {
  campuses?: { id: number; value: string }[];
  directors?: { id: number; name: string }[];
  acpds?: string[];
  circleTypes?: { id: number; value: string }[];
  statuses?: { id: number; value: string }[];
};

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

// The Saturday that ended the most recently completed week. This is what
// "through end of last week" pins to, and it rolls forward on its own as the
// calendar advances.
function endOfLastWeekISO(): string {
  return addDays(startOfWeekSunday(todayISO()), -1);
}

function semesterStartISO(): string {
  const today = todayISO();
  const month = new Date(`${today}T00:00:00`).getMonth();
  const year = today.slice(0, 4);
  return month <= 4 ? `${year}-01-01` : month <= 7 ? `${year}-05-01` : `${year}-08-01`;
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

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function rowsToCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape((row[header] ?? '') as string | number)).join(',')),
  ].join('\n');
}

const PREFS_KEY = 'circle-reporting-prefs';

// ── KPI card ───────────────────────────────────────────────────────────────
// One headline number with an optional week-over-week delta. `invert` flips the
// good/bad coloring for metrics where "up" is bad (Did Not Meet, No Summary).
function KpiCard({
  label,
  value,
  delta,
  deltaSuffix = '',
  deltaLabel = 'vs prior wk',
  invert = false,
  accent = 'slate',
  icon: Icon,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  deltaSuffix?: string;
  deltaLabel?: string;
  invert?: boolean;
  accent?: 'slate' | 'emerald' | 'sky' | 'amber' | 'rose' | 'violet';
  icon: typeof Users;
}) {
  const accents: Record<string, string> = {
    slate: 'text-slate-400',
    emerald: 'text-emerald-400',
    sky: 'text-sky-400',
    amber: 'text-amber-400',
    rose: 'text-rose-400',
    violet: 'text-violet-400',
  };

  return (
    <div className="group rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 transition hover:border-slate-700 hover:bg-slate-900">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <Icon className={`h-4 w-4 ${accents[accent]}`} />
      </div>
      <p className="mt-3 text-4xl font-semibold leading-none tracking-tight text-white tabular-nums">{value}</p>
      <div className="mt-3 h-5">
        {typeof delta === 'number' ? (
          <DeltaPill value={delta} suffix={deltaSuffix} invert={invert} label={deltaLabel} />
        ) : (
          <span className="text-xs text-slate-600">No comparison</span>
        )}
      </div>
    </div>
  );
}

function DeltaPill({ value, suffix = '', invert = false, label = 'vs prior wk' }: { value: number; suffix?: string; invert?: boolean; label?: string }) {
  const rounded = Math.round(value * 10) / 10;
  const positive = rounded > 0;
  const negative = rounded < 0;
  const good = invert ? negative : positive;
  const bad = invert ? positive : negative;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;
  const tone = good ? 'text-emerald-400' : bad ? 'text-rose-400' : 'text-slate-500';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      {positive ? '+' : ''}
      {rounded}
      {suffix}
      <span className="text-slate-600">{label}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: EventStatus }) {
  const classes = {
    met: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    did_not_meet: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    no_summary: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  };
  const labels = {
    met: 'Met',
    did_not_meet: 'Did Not Meet',
    no_summary: 'No Summary',
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}

function complianceTone(pct: number): string {
  if (pct >= 85) return 'bg-emerald-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-rose-500';
}

// A single section heading with an eyebrow label, used to give the page its
// top-to-bottom narrative (KPIs → trends → breakdowns → tables).
function SectionHeading({ eyebrow, title, hint }: { eyebrow: string; title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">{eyebrow}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
      </div>
      <div className="mt-4 h-60">{children}</div>
    </div>
  );
}

// Ranked compliance view for a breakdown dimension (campus / type / ACPD).
// Reads at a glance: name, met-of-expected, and a colored compliance bar.
function BreakdownCard({
  title,
  icon: Icon,
  rows,
  compareRows,
}: {
  title: string;
  icon: typeof Users;
  rows: Breakdown[];
  compareRows?: Breakdown[];
}) {
  const maxExpected = Math.max(1, ...rows.map((row) => row.expected));
  const compareByName = new Map((compareRows ?? []).map((row) => [row.name, row.compliancePct]));
  const comparing = !!compareRows;
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <EmptyState compact />
      ) : (
        <div className="space-y-3.5">
          {rows.map((row) => {
            const bPct = compareByName.get(row.name);
            const delta = typeof bPct === 'number' ? Math.round((row.compliancePct - bPct) * 10) / 10 : null;
            return (
              <div key={row.name}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-200">{row.name}</span>
                  <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                    {row.met}/{row.expected} · <span className="text-slate-300">{row.compliancePct}%</span>
                    {comparing && (
                      <span className={delta === null ? 'text-slate-600' : delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-500'}>
                        {' '}· B {typeof bPct === 'number' ? `${bPct}%` : '—'}
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full ${complianceTone(row.compliancePct)}`}
                    style={{ width: `${Math.min(100, Math.max(2, (row.expected / maxExpected) * 100 * (row.compliancePct / 100)))}%` }}
                    title={`${row.compliancePct}% compliance across ${row.expected} expected`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type SortKey = 'leader_name' | 'campus' | 'scheduled_date' | 'status' | 'attendance_count';
type StatusFilter = 'all' | 'no_summary' | 'did_not_meet' | 'met';

function CircleReportingContent() {
  const [weekStart, setWeekStart] = useState(startOfWeekSunday(todayISO()));
  const [startDate, setStartDate] = useState(addDays(endOfLastWeekISO(), -83));
  const [endDate, setEndDate] = useState(endOfLastWeekISO());
  const [rollForwardEnd, setRollForwardEnd] = useState(true);
  const [campus, setCampus] = useState('');
  const [acpd, setAcpd] = useState('');
  const [circleType, setCircleType] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState<ReportingData | null>(null);
  const [refData, setRefData] = useState<ReferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Range comparison (e.g. year-over-year). Range A is the main range above;
  // Range B is fetched from the same endpoint and overlaid for comparison.
  const [compareMode, setCompareMode] = useState(false);
  const [compareStart, setCompareStart] = useState(addDays(endOfLastWeekISO(), -83 - 364));
  const [compareEnd, setCompareEnd] = useState(addDays(endOfLastWeekISO(), -364));
  const [compareData, setCompareData] = useState<ReportingData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // Weekly-events table controls (client-side only — no refetch).
  const [eventSearch, setEventSearch] = useState('');
  const [eventStatusFilter, setEventStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('scheduled_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetch('/api/reference-data')
      .then((res) => res.json())
      .then(setRefData)
      .catch(() => {});
  }, []);

  // Restore saved filters. The end date intentionally re-pins to "end of last
  // week" on load whenever roll-forward is on, so a returning user always sees
  // the latest completed week rather than the stale date they left behind.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const prefs = JSON.parse(raw);
        const roll = typeof prefs.rollForwardEnd === 'boolean' ? prefs.rollForwardEnd : true;
        if (typeof prefs.startDate === 'string') setStartDate(prefs.startDate);
        setRollForwardEnd(roll);
        setEndDate(roll ? endOfLastWeekISO() : prefs.endDate || endOfLastWeekISO());
        if (typeof prefs.weekStart === 'string') setWeekStart(prefs.weekStart);
        if (typeof prefs.campus === 'string') setCampus(prefs.campus);
        if (typeof prefs.acpd === 'string') setAcpd(prefs.acpd);
        if (typeof prefs.circleType === 'string') setCircleType(prefs.circleType);
        if (typeof prefs.status === 'string') setStatus(prefs.status);
        if (typeof prefs.compareMode === 'boolean') setCompareMode(prefs.compareMode);
        if (typeof prefs.compareStart === 'string') setCompareStart(prefs.compareStart);
        if (typeof prefs.compareEnd === 'string') setCompareEnd(prefs.compareEnd);
      }
    } catch {
      // Ignore malformed preferences and fall back to defaults.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ startDate, endDate, rollForwardEnd, weekStart, campus, acpd, circleType, status, compareMode, compareStart, compareEnd })
      );
    } catch {
      // Storage may be unavailable (private mode); filters just won't persist.
    }
  }, [hydrated, startDate, endDate, rollForwardEnd, weekStart, campus, acpd, circleType, status, compareMode, compareStart, compareEnd]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('start_date', startDate);
    params.set('end_date', endDate);
    params.set('week_start_date', weekStart);
    if (campus) params.append('campus', campus);
    if (acpd) params.append('acpd', acpd);
    if (circleType) params.append('circle_type', circleType);
    if (status) params.append('status', status);
    return params;
  }, [acpd, campus, circleType, endDate, startDate, status, weekStart]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/circle-reporting?${buildParams().toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to load dashboard');
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    if (hydrated) loadData();
  }, [hydrated, loadData]);

  // Fetch Range B whenever comparison is on. Reuses the same endpoint and the
  // same campus/type/status filters; only the date range differs.
  useEffect(() => {
    if (!hydrated || !compareMode) {
      setCompareData(null);
      return;
    }
    const params = new URLSearchParams();
    params.set('start_date', compareStart);
    params.set('end_date', compareEnd);
    if (campus) params.append('campus', campus);
    if (acpd) params.append('acpd', acpd);
    if (circleType) params.append('circle_type', circleType);
    if (status) params.append('status', status);

    let cancelled = false;
    setCompareLoading(true);
    fetch(`/api/circle-reporting?${params.toString()}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setCompareData(json);
      })
      .catch(() => {
        if (!cancelled) setCompareData(null);
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, compareMode, compareStart, compareEnd, campus, acpd, circleType, status]);

  // Snap Range B to the prior year (52 weeks back keeps Sun–Sat alignment).
  const setCompareToPriorYear = useCallback(() => {
    setCompareStart(addDays(startDate, -364));
    setCompareEnd(addDays(endDate, -364));
  }, [startDate, endDate]);

  const handleExport = useCallback(
    async (format: 'json' | 'csv') => {
      setExporting(format);
      setError(null);
      try {
        const params = buildParams();
        params.delete('week_start_date');
        params.set('export', '1');
        const res = await fetch(`/api/circle-reporting?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || 'Export failed');
        const base = `circle-event-summaries-${startDate}_to_${endDate}`;
        if (format === 'json') {
          downloadBlob(`${base}.json`, JSON.stringify(json, null, 2), 'application/json');
        } else {
          downloadBlob(`${base}.csv`, rowsToCSV(json.events ?? []), 'text/csv;charset=utf-8;');
        }
      } catch (err: any) {
        setError(err.message || 'Export failed');
      } finally {
        setExporting(null);
      }
    },
    [buildParams, endDate, startDate]
  );

  const applyPreset = useCallback((preset: 'last4' | 'last12' | 'semester' | 'year') => {
    const end = endOfLastWeekISO();
    setRollForwardEnd(true);
    setEndDate(end);
    if (preset === 'last4') setStartDate(addDays(end, -27));
    else if (preset === 'last12') setStartDate(addDays(end, -83));
    else if (preset === 'semester') setStartDate(semesterStartISO());
    else setStartDate(`${todayISO().slice(0, 4)}-01-01`);
  }, []);

  const campusOptions = refData?.campuses?.map((item) => item.value).filter(Boolean) ?? data?.filters.campuses ?? [];
  const acpdOptions =
    refData?.acpds ??
    refData?.directors?.map((item) => item.name).filter(Boolean) ??
    data?.filters.acpds ??
    [];
  const typeOptions = refData?.circleTypes?.map((item) => item.value).filter(Boolean) ?? data?.filters.circleTypes ?? [];
  const statusOptions = refData?.statuses?.map((item) => item.value).filter(Boolean) ?? data?.filters.statuses ?? [];

  // Week-over-week deltas for the KPI row, derived from the existing weekly
  // trend series (latest completed week vs the one before it). No server change.
  const kpiDeltas = useMemo(() => {
    const trend = data?.weeklyTrend ?? [];
    if (trend.length < 2) return null;
    const last = trend[trend.length - 1];
    const prev = trend[trend.length - 2];
    return {
      totalAttendance: last.totalAttendance - prev.totalAttendance,
      expected: last.expected - prev.expected,
      averageCircleSize: Math.round((last.averageCircleSize - prev.averageCircleSize) * 10) / 10,
      compliancePct: Math.round((last.compliancePct - prev.compliancePct) * 10) / 10,
      didNotMeet: last.didNotMeet - prev.didNotMeet,
      noSummary: last.noSummary - prev.noSummary,
    };
  }, [data?.weeklyTrend]);

  // Range A vs Range B deltas for the KPI row when comparison is on.
  const compareDeltas = useMemo(() => {
    if (!data || !compareData) return null;
    const a = data.summary;
    const b = compareData.summary;
    return {
      totalAttendance: a.totalAttendance - b.totalAttendance,
      expected: a.expected - b.expected,
      averageCircleSize: Math.round((a.averageCircleSize - b.averageCircleSize) * 10) / 10,
      compliancePct: Math.round((a.compliancePct - b.compliancePct) * 10) / 10,
      didNotMeet: a.didNotMeet - b.didNotMeet,
      noSummary: a.noSummary - b.noSummary,
    };
  }, [data, compareData]);

  const comparing = compareMode && !!compareData;
  const kpiDelta = comparing ? compareDeltas : kpiDeltas;
  const kpiDeltaLabel = comparing ? 'vs Range B' : 'vs prior wk';

  const rangeLabel = data ? `${formatShortDate(data.filters.startDate)} – ${formatDate(data.filters.endDate)}` : '';
  const compareRangeLabel = compareData ? `${formatShortDate(compareData.filters.startDate)} – ${formatDate(compareData.filters.endDate)}` : '';

  const lineOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#0f172a', titleColor: '#f8fafc', bodyColor: '#cbd5e1', padding: 10 },
      },
      scales: {
        x: { ticks: { color: '#64748b', maxRotation: 0, autoSkipPadding: 12 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: '#64748b' }, grid: { color: 'rgba(148, 163, 184, 0.08)' } },
      },
    }),
    []
  );

  // Index-aligned Range B series (week 1 of B lines up with week 1 of A), so
  // calendar offset between the two ranges doesn't matter for the overlay.
  const cmpSeries = useCallback(
    (sel: (point: TrendPoint) => number): (number | null)[] | null => {
      if (!comparing || !data?.weeklyTrend.length || !compareData?.weeklyTrend.length) return null;
      return data.weeklyTrend.map((_, index) => {
        const point = compareData.weeklyTrend[index];
        return point ? sel(point) : null;
      });
    },
    [comparing, data?.weeklyTrend, compareData?.weeklyTrend]
  );

  const complianceChartData = useMemo(() => {
    if (!data?.weeklyTrend.length) return null;
    const datasets: any[] = [
      {
        label: 'Range A',
        data: data.weeklyTrend.map((point) => point.compliancePct),
        borderColor: '#34d399',
        backgroundColor: 'rgba(52, 211, 153, 0.12)',
        tension: 0.3,
        fill: !comparing,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ];
    const b = cmpSeries((point) => point.compliancePct);
    if (b) datasets.push({ label: 'Range B', data: b, borderColor: '#94a3b8', borderDash: [5, 4], tension: 0.3, fill: false, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2, spanGaps: true });
    return { labels: data.weeklyTrend.map((point) => point.label), datasets };
  }, [data?.weeklyTrend, comparing, cmpSeries]);

  const attendanceChartData = useMemo(() => {
    if (!data?.weeklyTrend.length) return null;
    const datasets: any[] = [
      {
        label: 'Range A',
        data: data.weeklyTrend.map((point) => point.totalAttendance),
        backgroundColor: 'rgba(56, 189, 248, 0.7)',
        borderColor: '#38bdf8',
        borderWidth: 0,
        borderRadius: 4,
      },
    ];
    const b = cmpSeries((point) => point.totalAttendance);
    if (b) datasets.push({ label: 'Range B', data: b, backgroundColor: 'rgba(148, 163, 184, 0.45)', borderRadius: 4 });
    return { labels: data.weeklyTrend.map((point) => point.label), datasets };
  }, [data?.weeklyTrend, cmpSeries]);

  const circleCountChartData = useMemo(() => {
    if (!data?.weeklyTrend.length) return null;
    const datasets: any[] = [
      {
        label: comparing ? 'Range A · Expected' : 'Expected circles',
        data: data.weeklyTrend.map((point) => point.expected),
        borderColor: '#a78bfa',
        backgroundColor: 'rgba(167, 139, 250, 0.12)',
        tension: 0.3,
        fill: !comparing,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ];
    const b = cmpSeries((point) => point.expected);
    if (b) {
      datasets.push({ label: 'Range B · Expected', data: b, borderColor: '#94a3b8', borderDash: [5, 4], tension: 0.3, fill: false, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2, spanGaps: true });
    } else {
      datasets.push({ label: 'Met', data: data.weeklyTrend.map((point) => point.met), borderColor: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0)', tension: 0.3, fill: false, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2, borderDash: [4, 3] });
    }
    return { labels: data.weeklyTrend.map((point) => point.label), datasets };
  }, [data?.weeklyTrend, comparing, cmpSeries]);

  const didNotMeetChartData = useMemo(() => {
    if (!data?.weeklyTrend.length) return null;
    const b = cmpSeries((point) => point.didNotMeet);
    const datasets: any[] = [
      {
        label: comparing ? 'Range A · Did not meet' : 'Did not meet',
        data: data.weeklyTrend.map((point) => point.didNotMeet),
        backgroundColor: 'rgba(251, 146, 60, 0.7)',
        borderRadius: 4,
      },
    ];
    if (b) {
      datasets.push({ label: 'Range B · Did not meet', data: b, backgroundColor: 'rgba(148, 163, 184, 0.45)', borderRadius: 4 });
    } else {
      datasets.push({ label: 'No summary', data: data.weeklyTrend.map((point) => point.noSummary), backgroundColor: 'rgba(244, 63, 94, 0.6)', borderRadius: 4 });
    }
    return { labels: data.weeklyTrend.map((point) => point.label), datasets };
  }, [data?.weeklyTrend, comparing, cmpSeries]);

  const legendOptions = useMemo(
    () => ({
      ...lineOptions,
      plugins: {
        ...lineOptions.plugins,
        legend: { display: true, position: 'bottom' as const, labels: { color: '#94a3b8', boxWidth: 10, boxHeight: 10, padding: 14, usePointStyle: true } },
      },
    }),
    [lineOptions]
  );

  // Weekly Events table: filter (search + status) then sort, client-side.
  const visibleEvents = useMemo(() => {
    const rows = data?.weeklyEvents ?? [];
    const needle = eventSearch.trim().toLowerCase();
    const filtered = rows.filter((event) => {
      if (eventStatusFilter !== 'all' && event.status !== eventStatusFilter) return false;
      if (!needle) return true;
      return (
        event.leader_name.toLowerCase().includes(needle) ||
        event.circle_name.toLowerCase().includes(needle) ||
        event.campus.toLowerCase().includes(needle) ||
        (event.acpd ?? '').toLowerCase().includes(needle)
      );
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'attendance_count') {
        return ((a.attendance_count ?? -1) - (b.attendance_count ?? -1)) * dir;
      }
      const av = String(a[sortKey] ?? '').toLowerCase();
      const bv = String(b[sortKey] ?? '').toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }, [data?.weeklyEvents, eventSearch, eventStatusFilter, sortKey, sortDir]);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setSortDir('asc');
      return key;
    });
  }, []);

  const statusFilterChips: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'no_summary', label: 'Missing summaries' },
    { key: 'did_not_meet', label: 'Did not meet' },
    { key: 'met', label: 'Met' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Adult Circles</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Circle Reporting</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Attendance, compliance, and did-not-meet trends across the selected reporting range.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => handleExport('json')}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/70 bg-emerald-900/30 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting === 'json' ? 'Exporting…' : 'Export JSON (AI)'}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => handleExport('csv')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-5 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Filter className="h-4 w-4" />
            Filters
          </div>

          <div className="grid gap-5 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reporting range</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  ['last4', 'Last 4 weeks'],
                  ['last12', 'Last 12 weeks'],
                  ['semester', 'Semester to date'],
                  ['year', 'Year to date'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => applyPreset(value as 'last4' | 'last12' | 'semester' | 'year')}
                    className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-emerald-600/60 hover:text-emerald-200"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Start date
                  <input
                    type="date"
                    value={startDate}
                    max={endDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="text-sm text-slate-300">
                  End date
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    disabled={rollForwardEnd}
                    onChange={(event) => {
                      setRollForwardEnd(false);
                      setEndDate(event.target.value);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !rollForwardEnd;
                    setRollForwardEnd(next);
                    if (next) setEndDate(endOfLastWeekISO());
                  }}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    rollForwardEnd
                      ? 'border-emerald-500/70 bg-emerald-500/15 text-emerald-200'
                      : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
                  }`}
                  aria-pressed={rollForwardEnd}
                >
                  <CalendarDays className="h-4 w-4" />
                  Through end of last week
                </button>
                <span className="text-xs text-slate-500">
                  {rollForwardEnd
                    ? `Pinned to ${formatShortDate(endDate)}, rolls forward weekly`
                    : 'Fixed end date'}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:col-span-6 lg:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm text-slate-300">
                Campus
                <select
                  value={campus}
                  onChange={(event) => setCampus(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="">All campuses</option>
                  {campusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-300">
                ACPD
                <select
                  value={acpd}
                  onChange={(event) => setAcpd(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="">All ACPDs</option>
                  {acpdOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-300">
                Circle type
                <select
                  value={circleType}
                  onChange={(event) => setCircleType(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="">All types</option>
                  {typeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-300">
                Status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="">All statuses</option>
                  {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>
          </div>

          {/* Comparison (year-over-year): pick a second range to compare against */}
          <div className="mt-4 border-t border-slate-800 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setCompareMode((value) => !value)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  compareMode
                    ? 'border-sky-500/70 bg-sky-500/15 text-sky-200'
                    : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
                }`}
                aria-pressed={compareMode}
              >
                <GitCompareArrows className="h-4 w-4" />
                Compare ranges
              </button>
              {compareMode && (
                <>
                  <label className="text-xs text-slate-400">
                    Range B start
                    <input
                      type="date"
                      value={compareStart}
                      max={compareEnd}
                      onChange={(event) => setCompareStart(event.target.value)}
                      className="ml-2 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Range B end
                    <input
                      type="date"
                      value={compareEnd}
                      min={compareStart}
                      onChange={(event) => setCompareEnd(event.target.value)}
                      className="ml-2 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={setCompareToPriorYear}
                    className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-sky-600/60 hover:text-sky-200"
                  >
                    Prior year
                  </button>
                  <span className="text-xs text-slate-500">
                    {compareLoading ? 'Loading Range B…' : compareData ? `B: ${compareRangeLabel}` : 'Pick a comparison range'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-100">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-900/40" />
            ))}
          </div>
        )}

        {!loading && data && (
          <>
            {/* Row 1 — KPIs */}
            <section className="mt-7">
              <SectionHeading eyebrow="Overview" title="Key metrics" hint={rangeLabel} />
              {comparing && compareData && (
                <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-2.5 text-xs">
                  <span className="inline-flex items-center gap-2 text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> Range A · {rangeLabel} · {data.summary.compliancePct}% compliance
                  </span>
                  <span className="inline-flex items-center gap-2 text-slate-400">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Range B · {compareRangeLabel} · {compareData.summary.compliancePct}% compliance
                  </span>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <KpiCard icon={Users} accent="sky" label="Total Attendance" value={data.summary.totalAttendance.toLocaleString()} delta={kpiDelta?.totalAttendance} deltaLabel={kpiDeltaLabel} />
                <KpiCard icon={CalendarDays} accent="violet" label="Total Circles" value={data.summary.expected.toLocaleString()} delta={kpiDelta?.expected} deltaLabel={kpiDeltaLabel} />
                <KpiCard icon={Users} accent="emerald" label="Avg Circle Size" value={data.summary.averageCircleSize} delta={kpiDelta?.averageCircleSize} deltaLabel={kpiDeltaLabel} />
                <KpiCard icon={FileText} accent={data.summary.compliancePct >= 85 ? 'emerald' : data.summary.compliancePct >= 70 ? 'amber' : 'rose'} label="Compliance" value={`${data.summary.compliancePct}%`} delta={kpiDelta?.compliancePct} deltaSuffix=" pts" deltaLabel={kpiDeltaLabel} />
                <KpiCard icon={AlertTriangle} accent="amber" label="Did Not Meet" value={data.summary.didNotMeet} delta={kpiDelta?.didNotMeet} invert deltaLabel={kpiDeltaLabel} />
                <KpiCard icon={FileText} accent="rose" label="No Summary" value={data.summary.noSummary} delta={kpiDelta?.noSummary} invert deltaLabel={kpiDeltaLabel} />
              </div>
            </section>

            {/* Row 2 — Trends */}
            <section className="mt-9">
              <SectionHeading eyebrow="Trends" title="How the story is moving" hint="By week" />
              <div className="grid gap-3 lg:grid-cols-2">
                <ChartCard title="Attendance over time" subtitle="Total headcount">
                  {attendanceChartData ? <Bar data={attendanceChartData} options={(comparing ? legendOptions : lineOptions) as any} /> : <EmptyState />}
                </ChartCard>
                <ChartCard title="Compliance over time" subtitle="% met or reported">
                  {complianceChartData ? <Line data={complianceChartData} options={(comparing ? legendOptions : lineOptions) as any} /> : <EmptyState />}
                </ChartCard>
                <ChartCard title="Circle count over time" subtitle="Expected vs met">
                  {circleCountChartData ? <Line data={circleCountChartData} options={legendOptions as any} /> : <EmptyState />}
                </ChartCard>
                <ChartCard title="Did Not Meet trend" subtitle="Misses & gaps">
                  {didNotMeetChartData ? <Bar data={didNotMeetChartData} options={legendOptions as any} /> : <EmptyState />}
                </ChartCard>
              </div>
            </section>

            {/* Row 3 — Breakdowns */}
            <section className="mt-9">
              <SectionHeading eyebrow="Breakdowns" title="Where it's happening" hint="Bar length = volume · color = compliance" />
              <div className="grid gap-3 lg:grid-cols-3">
                <BreakdownCard title="By Campus" icon={Building2} rows={data.campusBreakdown} compareRows={comparing ? compareData?.campusBreakdown : undefined} />
                <BreakdownCard title="By Circle Type" icon={Layers} rows={data.circleTypeBreakdown} compareRows={comparing ? compareData?.circleTypeBreakdown : undefined} />
                <BreakdownCard title="By ACPD" icon={UserRound} rows={data.acpdBreakdown ?? []} compareRows={comparing ? compareData?.acpdBreakdown : undefined} />
              </div>
            </section>

            {/* Row 4 — Operational tables */}
            <section className="mt-9">
              <SectionHeading eyebrow="Operations" title="Weekly events" hint={`Week of ${formatDate(data.filters.selectedWeek)}`} />
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60">
                <div className="flex flex-col gap-3 border-b border-slate-800 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    {statusFilterChips.map((chip) => (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() => setEventStatusFilter(chip.key)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          eventStatusFilter === chip.key
                            ? 'border-emerald-500/70 bg-emerald-500/15 text-emerald-200'
                            : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type="search"
                        value={eventSearch}
                        onChange={(event) => setEventSearch(event.target.value)}
                        placeholder="Search leader, circle, campus, ACPD"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-8 pr-3 text-sm text-white placeholder:text-slate-500 sm:w-64"
                      />
                    </label>
                    <input
                      type="date"
                      value={weekStart}
                      onChange={(event) => setWeekStart(startOfWeekSunday(event.target.value))}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                      title="Pick the week shown in this table"
                    />
                  </div>
                </div>

                {visibleEvents.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-800 text-sm">
                      <thead className="bg-slate-950/60 text-left text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                          <SortableTh label="Leader" col="leader_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <th className="px-4 py-3 font-medium">Circle</th>
                          <SortableTh label="Campus" col="campus" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableTh label="Scheduled" col="scheduled_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableTh label="Status" col="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableTh label="Attendance" col="attendance_count" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <th className="px-4 py-3 font-medium">Summary</th>
                          <th className="px-4 py-3 font-medium">Did Not Meet Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {visibleEvents.map((event) => (
                          <tr key={`${event.leader_id}-${event.week_start_date}`} className="hover:bg-slate-800/40">
                            <td className="px-4 py-3 font-medium text-white">{event.leader_name}</td>
                            <td className="px-4 py-3 text-slate-300">{event.circle_name}</td>
                            <td className="px-4 py-3 text-slate-300">{event.campus}</td>
                            <td className="px-4 py-3 text-slate-400">{formatShortDate(event.scheduled_date)} {event.scheduled_time}</td>
                            <td className="px-4 py-3"><StatusBadge status={event.status} /></td>
                            <td className="px-4 py-3 text-slate-300 tabular-nums">{event.attendance_count ?? '—'}</td>
                            <td className="px-4 py-3 text-slate-400">{event.notes_submitted ? 'Yes' : '—'}</td>
                            <td className="max-w-xs px-4 py-3 text-slate-400">{event.did_not_meet_reason || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="border-t border-slate-800 px-4 py-2.5 text-xs text-slate-500">
                  Showing {visibleEvents.length} of {data.weeklyEvents.length} expected events this week
                </div>
              </div>
            </section>

            {/* Reasons for not meeting */}
            <section className="mt-9 pb-4">
              <SectionHeading eyebrow="Operations" title="Reasons for not meeting" hint={`${data.didNotMeetInsights.total} across the range`} />
              {data.didNotMeetInsights.notSpecified > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-2.5 text-xs text-slate-400">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span>
                    <span className="font-medium text-slate-300">{data.didNotMeetInsights.notSpecified}</span> did-not-meet
                    {data.didNotMeetInsights.notSpecified === 1 ? ' event has' : ' events have'} no recorded reason
                    {(data.didNotMeetInsights.notSpecifiedBySource.ccb > 0 || data.didNotMeetInsights.notSpecifiedBySource.snapshot > 0) && (
                      <> — {data.didNotMeetInsights.notSpecifiedBySource.ccb + data.didNotMeetInsights.notSpecifiedBySource.snapshot} came from CCB/snapshot syncs, which don't capture a reason</>
                    )}
                    . Only misses leaders log in Radius include a reason.
                  </span>
                </div>
              )}
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 lg:col-span-1">
                  <h3 className="text-sm font-semibold text-white">Top reasons</h3>
                  <div className="mt-4 space-y-3">
                    {data.didNotMeetInsights.topReasons.length === 0 ? (
                      <EmptyState compact />
                    ) : (
                      data.didNotMeetInsights.topReasons.map((reason, index) => (
                        <div key={reason.reason} className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                          <div>
                            <p className="text-sm font-medium text-white">{index + 1}. {reason.reason}</p>
                            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">{reason.category}</p>
                          </div>
                          <p className="text-lg font-semibold text-white tabular-nums">{reason.count}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 lg:col-span-2">
                  <div className="border-b border-slate-800 p-4">
                    <h3 className="text-sm font-semibold text-white">All did-not-meet reasons</h3>
                  </div>
                  {data.didNotMeetInsights.byReason.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-800 text-sm">
                        <thead className="bg-slate-950/60 text-left text-xs uppercase tracking-wide text-slate-400">
                          <tr>
                            <th className="px-4 py-3 font-medium">Reason</th>
                            <th className="px-4 py-3 font-medium">Category</th>
                            <th className="px-4 py-3 font-medium">Count</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {data.didNotMeetInsights.byReason.map((reason) => (
                            <tr key={reason.reason} className="hover:bg-slate-800/40">
                              <td className="px-4 py-3 text-white">{reason.reason}</td>
                              <td className="px-4 py-3 capitalize text-slate-400">{reason.category}</td>
                              <td className="px-4 py-3 text-slate-300 tabular-nums">{reason.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function SortableTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 transition hover:text-slate-200 ${active ? 'text-emerald-300' : ''}`}
      >
        {label}
        {active ? (
          sortDir === 'asc' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function EmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center justify-center rounded-xl border border-dashed border-slate-700/70 text-center text-sm text-slate-500 ${compact ? 'min-h-24 p-4' : 'min-h-32 p-6'}`}>
      No data for the selected filters.
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
