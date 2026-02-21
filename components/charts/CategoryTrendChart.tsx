'use client';

import { useMemo } from 'react';
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
import { CategoryWeeklyTrend, getTrendLabel } from '../../lib/weeklyTrends';
import { ScorecardDimension } from '../../lib/supabase';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// ── Category color palette (matches existing project theme) ──
const CATEGORY_THEME: Record<ScorecardDimension, {
  line: string;
  bg: string;
  bgFill: string;
  text: string;
  border: string;
  glow: string;
  label: string;
}> = {
  reach: {
    line: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.08)',
    bgFill: 'rgba(59, 130, 246, 0.15)',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    glow: 'shadow-blue-500/10',
    label: 'Reach',
  },
  connect: {
    line: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.08)',
    bgFill: 'rgba(34, 197, 94, 0.15)',
    text: 'text-green-400',
    border: 'border-green-500/30',
    glow: 'shadow-green-500/10',
    label: 'Connect',
  },
  disciple: {
    line: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.08)',
    bgFill: 'rgba(168, 85, 247, 0.15)',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    glow: 'shadow-purple-500/10',
    label: 'Disciple',
  },
  develop: {
    line: '#f97316',
    bg: 'rgba(249, 115, 22, 0.08)',
    bgFill: 'rgba(249, 115, 22, 0.15)',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    glow: 'shadow-orange-500/10',
    label: 'Develop',
  },
};

// ── Component Props ─────────────────────────────────────────

interface CategoryTrendChartProps {
  /** Weekly trend data for this category */
  trend: CategoryWeeklyTrend;
  /** Chart height in pixels (default: 200) */
  height?: number;
  /** Show the header with title and stats (default: true) */
  showHeader?: boolean;
  /** Show the goal line at score 4 (default: true) */
  showGoalLine?: boolean;
  /** Show min/max range shading when aggregate data (default: true for aggregate) */
  showRange?: boolean;
  /** Compact mode for smaller containers (default: false) */
  compact?: boolean;
}

// ── Chart.js annotation plugin for goal line ────────────────

const goalLinePlugin = {
  id: 'goalLine',
  beforeDraw(chart: any, _args: any, options: any) {
    if (!options?.enabled) return;
    const { ctx, scales: { y } } = chart;
    const yPos = y.getPixelForValue(options.value ?? 4);

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = options.color ?? 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.moveTo(chart.chartArea.left, yPos);
    ctx.lineTo(chart.chartArea.right, yPos);
    ctx.stroke();

    // Draw "Goal" label
    ctx.fillStyle = options.color ?? 'rgba(255, 255, 255, 0.25)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Goal', chart.chartArea.right - 4, yPos - 4);

    ctx.restore();
  },
};

ChartJS.register(goalLinePlugin);

// ── Main Component ──────────────────────────────────────────

export default function CategoryTrendChart({
  trend,
  height = 200,
  showHeader = true,
  showGoalLine = true,
  showRange = false,
  compact = false,
}: CategoryTrendChartProps) {
  const theme = CATEGORY_THEME[trend.category];
  const trendInfo = getTrendLabel(trend.trendSlope);

  const chartData = useMemo(() => {
    const labels = trend.data.map(d => d.label);
    const values = trend.data.map(d => d.value);

    const datasets: any[] = [
      {
        label: theme.label,
        data: values,
        borderColor: theme.line,
        backgroundColor: theme.bgFill,
        tension: 0.35,
        pointRadius: compact ? 3 : 5,
        pointHoverRadius: compact ? 5 : 8,
        pointBackgroundColor: theme.line,
        pointBorderColor: '#1f2937',
        pointBorderWidth: 2,
        borderWidth: compact ? 2 : 2.5,
        fill: true,
        spanGaps: true,
      },
    ];

    // Optional min/max range band
    if (showRange) {
      const mins = trend.data.map(d => d.min);
      const maxs = trend.data.map(d => d.max);
      const hasRange = mins.some((m, i) => m !== null && maxs[i] !== null && m !== maxs[i]);

      if (hasRange) {
        datasets.unshift({
          label: 'Range (max)',
          data: maxs,
          borderColor: 'transparent',
          backgroundColor: theme.bgFill,
          fill: '+1',
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 0,
          spanGaps: true,
        });
        datasets.push({
          label: 'Range (min)',
          data: mins,
          borderColor: 'transparent',
          backgroundColor: 'transparent',
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 0,
          spanGaps: true,
        });
      }
    }

    return { labels, datasets };
  }, [trend, theme, compact, showRange]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(11, 37, 69, 0.95)',
        titleColor: '#eef4ed',
        bodyColor: '#8da9c4',
        borderColor: theme.line + '40',
        borderWidth: 1,
        padding: compact ? 8 : 12,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          title: (context: any) => {
            const idx = context[0]?.dataIndex;
            if (idx === undefined) return '';
            const dp = trend.data[idx];
            return `Week ending ${dp?.weekEnding ?? ''}`;
          },
          label: (context: any) => {
            const idx = context.dataIndex;
            const dp = trend.data[idx];
            if (!dp || dp.value === null) return 'No data';
            const parts = [`${theme.label}: ${dp.value}/5`];
            if (dp.count > 1) parts.push(`${dp.count} scores averaged`);
            if (dp.min !== null && dp.max !== null && dp.min !== dp.max) {
              parts.push(`Range: ${dp.min} – ${dp.max}`);
            }
            return parts;
          },
        },
      },
      goalLine: {
        enabled: showGoalLine,
        value: 4,
        color: 'rgba(255, 255, 255, 0.12)',
      },
    },
    scales: {
      y: {
        min: 0.5,
        max: 5.5,
        ticks: {
          stepSize: 1,
          callback: (v: any) => (v >= 1 && v <= 5 && Number.isInteger(v) ? v : ''),
          color: '#6b7280',
          font: { size: compact ? 10 : 11 },
        },
        grid: { color: 'rgba(76, 103, 133, 0.12)' },
        border: { color: 'rgba(76, 103, 133, 0.2)' },
      },
      x: {
        ticks: {
          color: '#6b7280',
          font: { size: compact ? 9 : 11 },
          maxRotation: 45,
        },
        grid: { display: false },
        border: { color: 'rgba(76, 103, 133, 0.2)' },
      },
    },
    interaction: { intersect: false, mode: 'index' as const },
  }), [trend, theme, compact, showGoalLine]);

  // No data state
  if (trend.data.length === 0 || trend.data.every(d => d.value === null)) {
    return (
      <div className={`rounded-xl border ${theme.border} ${theme.bg} p-4`}>
        {showHeader && (
          <div className="mb-2">
            <h3 className={`text-sm font-semibold ${theme.text}`}>{theme.label}</h3>
          </div>
        )}
        <p className="text-xs text-gray-500">No weekly data yet</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${theme.border} ${theme.bg} shadow-sm ${theme.glow}`}>
      {showHeader && (
        <div className="px-4 pt-4 pb-2 flex items-start justify-between">
          <div>
            <h3 className={`text-sm font-semibold ${theme.text}`}>{theme.label}</h3>
            <div className="flex items-center gap-2 mt-1">
              {trend.currentValue !== null && (
                <span className="text-lg font-bold text-white">{trend.currentValue}</span>
              )}
              {trend.weekOverWeekDelta !== null && (
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                  trend.weekOverWeekDelta > 0
                    ? 'bg-green-500/15 text-green-400'
                    : trend.weekOverWeekDelta < 0
                    ? 'bg-red-500/15 text-red-400'
                    : 'bg-gray-500/15 text-gray-400'
                }`}>
                  {trend.weekOverWeekDelta > 0 ? '+' : ''}{trend.weekOverWeekDelta}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className={`text-xs font-medium ${
              trendInfo.sentiment === 'positive' ? 'text-green-400'
              : trendInfo.sentiment === 'negative' ? 'text-red-400'
              : 'text-gray-400'
            }`}>
              {trendInfo.icon} {trendInfo.text}
            </span>
            <p className="text-[10px] text-gray-600 mt-0.5">
              {trend.data.filter(d => d.value !== null).length} week{trend.data.filter(d => d.value !== null).length !== 1 ? 's' : ''} of data
            </p>
          </div>
        </div>
      )}
      <div className={compact ? 'px-2 pb-2' : 'px-4 pb-4'}>
        <div style={{ height: height + 'px' }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}

export { CATEGORY_THEME };
