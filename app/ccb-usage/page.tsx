'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  RefreshCw,
  Search,
  Timer,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { supabase } from '../../lib/supabase';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

type DashboardData = {
  summary: {
    totalToday: number;
    totalThisMonth: number;
    failedCalls: number;
    rateLimitErrors: number;
    averageResponseTime: number;
    mostUsedService: { service: string; count: number } | null;
    currentDailyUsage: { daily_limit: number | null; counter: number | null; percent_used: number | null } | null;
  };
  graph: Array<{ timestamp: string; calls: number; failed: number; rateLimited: number }>;
  rateLimits: Array<{
    ccb_service: string;
    label: string;
    rate_limit_limit: number | null;
    rate_limit_remaining: number | null;
    rate_limit_reset: string | null;
    retry_after: number | null;
    updated_at: string;
    last_status_code?: number | null;
  }>;
  alerts: Array<{ id: string; severity: string; title: string; message: string; ccb_service: string | null; created_at: string }>;
  recommendations: Array<{ module: string; action: string; service: string; count: number; message: string }>;
  logs: Array<{
    id: string;
    created_at: string;
    user_name: string;
    module: string;
    action: string;
    direction: string;
    ccb_service: string;
    status_code: number | null;
    success: boolean;
    duration_ms: number;
    rate_limit_remaining: number | null;
    error_message: string | null;
  }>;
};

const cardStyle = 'rounded-lg border border-slate-300 bg-white p-4 shadow-sm';

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return 'n/a';
  return new Intl.NumberFormat('en-US').format(value);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatReset(value: string | null) {
  if (!value) return 'No reset header captured';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function rangeLabel(range: string) {
  if (range === 'today') return 'today';
  if (range === '30d') return 'last 30 days';
  if (range === 'custom') return 'custom range';
  return 'last 7 days';
}

function statusClass(label: string) {
  if (label === 'Rate limited') return 'bg-red-100 text-red-800';
  if (label === 'At risk') return 'bg-orange-100 text-orange-800';
  if (label === 'Getting close') return 'bg-yellow-100 text-yellow-800';
  if (label === 'Healthy') return 'bg-emerald-100 text-emerald-800';
  return 'bg-slate-100 text-slate-700';
}

function statusContext(label: string, remaining: number | null, limit: number | null) {
  if (label === 'Rate limited') return 'CCB rejected the latest request. Wait for reset or retry-after.';
  if (label === 'At risk') return 'Less than 5% remains for this service.';
  if (label === 'Getting close') return 'Less than 20% remains for this service.';
  if (label === 'Healthy' && remaining !== null && limit) return `${Math.round((remaining / limit) * 100)}% of this service limit remains in the current rate-limit window.`;
  return 'Waiting for CCB rate-limit headers.';
}

function remainingPercent(remaining: number | null, limit: number | null) {
  if (remaining === null || !limit) return null;
  return Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)));
}

function dailyUsageStatus(percent: number | null) {
  if (percent === null) {
    return {
      label: 'Unknown',
      className: 'bg-slate-100 text-slate-700',
      barClassName: 'bg-slate-400',
      message: 'Refresh api_status to capture the current CCB daily allotment.',
    };
  }
  if (percent >= 95) {
    return {
      label: 'Critical',
      className: 'bg-red-100 text-red-800',
      barClassName: 'bg-red-600',
      message: 'Daily CCB usage is nearly exhausted. Pause nonessential syncs.',
    };
  }
  if (percent >= 80) {
    return {
      label: 'Watch',
      className: 'bg-amber-100 text-amber-800',
      barClassName: 'bg-amber-500',
      message: 'Daily CCB usage is above 80%. Prefer cached data and avoid bulk jobs.',
    };
  }
  return {
    label: 'Healthy',
    className: 'bg-emerald-100 text-emerald-800',
    barClassName: 'bg-emerald-500',
    message: 'Daily usage is comfortably below the CCB daily allotment.',
  };
}

function formatSource(row: DashboardData['logs'][number]) {
  const source = row.user_name === 'System' ? 'Background job' : row.user_name;
  return `${source} / ${row.module}`;
}

export default function CCBUsageDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('7d');
  const [groupBy, setGroupBy] = useState('day');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function load(refreshStatus = false) {
    setLoading(true);
    setError('');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError('Sign in to view CCB API usage.');
      setLoading(false);
      return;
    }

    if (refreshStatus) {
      await fetch('/api/ccb/usage-dashboard', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    const params = new URLSearchParams({ range, groupBy });
    if (range === 'custom') {
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);
    }
    if (search) params.set('search', search);
    if (status) params.set('status', status);

    const res = await fetch(`/api/ccb/usage-dashboard?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json();

    if (!res.ok) {
      setError(payload.error || 'Failed to load CCB API usage.');
      setData(null);
    } else {
      setData(payload);
    }

    setLoading(false);
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, groupBy, status]);

  const chartData = useMemo(() => ({
    labels: data?.graph.map((point) => point.timestamp) || [],
    datasets: [
      {
        label: 'Calls',
        data: data?.graph.map((point) => point.calls) || [],
        borderColor: '#2563eb',
        backgroundColor: '#2563eb',
        tension: 0.3,
      },
      {
        label: 'Failed',
        data: data?.graph.map((point) => point.failed) || [],
        borderColor: '#dc2626',
        backgroundColor: '#dc2626',
        tension: 0.3,
      },
      {
        label: '429s',
        data: data?.graph.map((point) => point.rateLimited) || [],
        borderColor: '#f97316',
        backgroundColor: '#f97316',
        tension: 0.3,
      },
    ],
  }), [data]);

  const totalInRange = data?.logs.length || 0;
  const failureRate = data && totalInRange ? Math.round((data.summary.failedCalls / totalInRange) * 100) : 0;
  const rateLimitRate = data && totalInRange ? Math.round((data.summary.rateLimitErrors / totalInRange) * 100) : 0;
  const dailyCounter = data?.summary.currentDailyUsage?.counter ?? null;
  const dailyLimit = data?.summary.currentDailyUsage?.daily_limit ?? null;
  const dailyPercent = data?.summary.currentDailyUsage?.percent_used ?? null;

  const dailyStatus = dailyUsageStatus(dailyPercent);
  const dailyPercentWidth = dailyPercent === null ? 0 : Math.max(0, Math.min(100, dailyPercent));

  const summaryCards = data ? [
    {
      label: 'Total calls today',
      value: formatNumber(data.summary.totalToday),
      context: `${formatNumber(totalInRange)} calls visible in the ${rangeLabel(range)} window.`,
      Icon: Activity,
    },
    {
      label: 'Total calls this month',
      value: formatNumber(data.summary.totalThisMonth),
      context: 'Calendar-month logged usage. CCB documents daily and rate-window limits, not a monthly quota.',
      Icon: TrendingUp,
    },
    {
      label: 'Failed calls',
      value: formatNumber(data.summary.failedCalls),
      context: `${failureRate}% of visible requests failed.`,
      Icon: AlertTriangle,
    },
    {
      label: '429 errors',
      value: formatNumber(data.summary.rateLimitErrors),
      context: `${rateLimitRate}% of visible requests hit a CCB rate limit.`,
      Icon: Zap,
    },
    {
      label: 'Avg response',
      value: `${formatNumber(data.summary.averageResponseTime)} ms`,
      context: data.summary.averageResponseTime > 2000 ? 'Slow enough to watch for retries or heavy services.' : 'Average duration across logged CCB calls.',
      Icon: Timer,
    },
    {
      label: 'Most-used service',
      value: data.summary.mostUsedService?.service || 'None',
      context: data.summary.mostUsedService ? `${formatNumber(data.summary.mostUsedService.count)} calls in the current filter.` : 'No service calls in this filter.',
      Icon: Database,
    },
  ] : [];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-700">Internal operations</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">CCB API Usage</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={range} onChange={(event) => setRange(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900">
              <option value="today">Today</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="custom">Custom</option>
            </select>
            <select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900">
              <option value="hour">Hour</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
            </select>
            <button onClick={() => load(true)} className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
              <RefreshCw size={16} /> Refresh status
            </button>
          </div>
        </div>

        {range === 'custom' && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <label className="text-sm font-semibold text-slate-700">
              Start
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              End
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <button onClick={() => load(false)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900">Apply</button>
          </div>
        )}

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

        <section className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <Clock size={22} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-600">CCB Daily API Usage</p>
                  <h2 className="mt-1 text-3xl font-extrabold text-slate-950">
                    {dailyPercent !== null ? `${dailyPercent}% used` : 'Usage unknown'}
                  </h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${dailyStatus.className}`}>{dailyStatus.label}</span>
              </div>
              <p className="mt-4 max-w-3xl text-sm font-medium leading-6 text-slate-700">{dailyStatus.message}</p>
            </div>

            <div className="w-full lg:max-w-md">
              <div className="grid grid-cols-3 gap-3 text-sm font-medium text-slate-700">
                <span>Used <strong className="block text-2xl font-extrabold text-slate-950">{formatNumber(dailyCounter)}</strong></span>
                <span>Limit <strong className="block text-2xl font-extrabold text-slate-950">{formatNumber(dailyLimit)}</strong></span>
                <span>Remaining <strong className="block text-2xl font-extrabold text-slate-950">
                  {dailyCounter !== null && dailyLimit !== null ? formatNumber(Math.max(0, dailyLimit - dailyCounter)) : 'n/a'}
                </strong></span>
              </div>
              <div className="mt-4 h-4 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${dailyStatus.barClassName}`} style={{ width: `${dailyPercentWidth}%` }} />
              </div>
              <p className="mt-2 text-xs font-medium text-slate-600">
                This comes from CCB `api_status` and is separate from per-service rate-limit windows.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {summaryCards.map(({ label, value, context, Icon }) => (
            <div key={label} className={cardStyle}>
              <Icon size={18} className="text-slate-500" />
              <p className="mt-3 text-xs font-bold uppercase text-slate-600">{label}</p>
              <p className="mt-1 truncate text-2xl font-extrabold text-slate-950">{loading ? '...' : value}</p>
              <p className="mt-2 min-h-[36px] text-xs font-medium leading-5 text-slate-700">{context}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
          <div className={cardStyle}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-950">Usage over time</h2>
            </div>
            <div className="h-[320px]">
              <Line
                data={chartData}
                options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, ticks: { precision: 0 } } } }}
              />
            </div>
          </div>

          <div className={cardStyle}>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-bold text-slate-950">Rate limits by service</h2>
              <p className="text-sm font-medium text-slate-700">
                CCB reports limit and remaining for the current rate-limit window. Use the reset time to see when that service bucket refills.
              </p>
            </div>
            <div className="mt-4 space-y-3">
              {(data?.rateLimits || []).map((row) => {
                const percent = remainingPercent(row.rate_limit_remaining, row.rate_limit_limit);
                const used = row.rate_limit_limit !== null && row.rate_limit_remaining !== null
                  ? row.rate_limit_limit - row.rate_limit_remaining
                  : null;

                return (
                  <div key={row.ccb_service} className="rounded-md border border-slate-300 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm font-bold text-slate-950">{row.ccb_service}</p>
                        <p className="mt-1 text-xs font-medium leading-5 text-slate-700">
                          {statusContext(row.label, row.rate_limit_remaining, row.rate_limit_limit)}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${statusClass(row.label)}`}>{row.label}</span>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={row.label === 'Healthy' ? 'h-full rounded-full bg-emerald-500' : row.label === 'Getting close' ? 'h-full rounded-full bg-yellow-500' : 'h-full rounded-full bg-red-500'}
                        style={{ width: `${percent ?? 0}%` }}
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-medium text-slate-700 sm:grid-cols-4">
                      <span>Limit window <strong className="block text-slate-950">{formatNumber(row.rate_limit_limit)}</strong></span>
                      <span>Remaining <strong className="block text-slate-950">{formatNumber(row.rate_limit_remaining)}{percent !== null ? ` (${percent}%)` : ''}</strong></span>
                      <span>Used <strong className="block text-slate-950">{formatNumber(used)}</strong></span>
                      <span>Retry after <strong className="block text-slate-950">{row.retry_after ? `${row.retry_after}s` : 'n/a'}</strong></span>
                    </div>

                    <div className="mt-3 grid gap-1 border-t border-slate-200 pt-3 text-xs font-medium text-slate-700 sm:grid-cols-2">
                      <span>Reset: <strong className="font-semibold text-slate-950">{formatReset(row.rate_limit_reset)}</strong></span>
                      <span>Last checked: <strong className="font-semibold text-slate-950">{formatTime(row.updated_at)}</strong></span>
                    </div>
                  </div>
                );
              })}
              {!data?.rateLimits?.length && <p className="text-sm text-slate-500">No CCB rate-limit headers have been captured yet.</p>}
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className={cardStyle}>
            <h2 className="text-base font-bold">Open alerts</h2>
            <div className="mt-3 space-y-2">
              {(data?.alerts || []).map((alert) => (
                <div key={alert.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-semibold">{alert.title}</p>
                  <p className="mt-1 text-amber-900">{alert.message}</p>
                </div>
              ))}
              {!data?.alerts?.length && <p className="text-sm text-slate-500">No open alerts.</p>}
            </div>
          </div>

          <div className={cardStyle}>
            <h2 className="text-base font-bold">Caching recommendations</h2>
            <div className="mt-3 space-y-2">
              {(data?.recommendations || []).map((item) => (
                <div key={`${item.module}-${item.action}-${item.service}`} className="rounded-md border border-slate-200 p-3 text-sm">
                  <p className="font-semibold">{item.service}</p>
                  <p className="mt-1 text-slate-600">{item.message}</p>
                </div>
              ))}
              {!data?.recommendations?.length && <p className="text-sm text-slate-500">No repeated high-volume service patterns in this range.</p>}
            </div>
          </div>
        </section>

        <section className={cardStyle}>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-950">Recent CCB requests</h2>
              <p className="mt-1 text-sm font-medium text-slate-700">
                This is mostly for troubleshooting spikes, slow calls, and failures. Empty error fields are hidden unless a request fails.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load(false)} placeholder="Search logs" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm font-medium text-slate-900 sm:w-72" />
              </label>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900">
                <option value="">All statuses</option>
                <option value="failed">Failed</option>
                <option value="429">429 only</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-600">
                  <th className="px-3 py-2">Timestamp</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">Rate limit</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {(data?.logs || []).map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 text-slate-900">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">{formatTime(row.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{formatSource(row)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{row.action}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-slate-800">{row.ccb_service}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={row.success ? 'font-bold text-emerald-700' : 'font-bold text-red-700'}>{row.status_code || 'ERR'}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{formatNumber(row.duration_ms)} ms</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">
                      {row.rate_limit_remaining !== null ? `${formatNumber(row.rate_limit_remaining)} remaining` : 'No header'}
                    </td>
                    <td className="max-w-md px-3 py-2 font-medium text-slate-700">
                      {row.error_message ? (
                        <span className="line-clamp-1 text-red-700">{row.error_message}</span>
                      ) : (
                        <span className="text-slate-500">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!data?.logs?.length && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-sm font-medium text-slate-600">
                      No CCB requests match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
