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
import { ScoreHistoryEntry } from '../../hooks/useScoreHistory';
import { ScorecardRating } from '../../lib/supabase';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const DIMENSIONS = [
  { key: 'reach' as const, label: 'Reach', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  { key: 'connect' as const, label: 'Connect', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  { key: 'disciple' as const, label: 'Disciple', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
  { key: 'develop' as const, label: 'Develop', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' },
];

interface ScorecardTrendChartProps {
  /** New per-dimension history entries (from scorecard_score_history table) */
  scoreHistory: ScoreHistoryEntry[];
  /** Existing full-row ratings (from circle_leader_scores table) – used as fallback */
  ratings: ScorecardRating[];
}

/** Build chart datasets from the new per-dimension history table */
function buildFromHistory(scoreHistory: ScoreHistoryEntry[]) {
  const byDimension: Record<string, ScoreHistoryEntry[]> = {
    reach: [], connect: [], disciple: [], develop: [],
  };
  for (const entry of scoreHistory) {
    if (byDimension[entry.dimension]) {
      byDimension[entry.dimension].push(entry);
    }
  }

  const allTimestamps = new Map<string, Date>();
  for (const entry of scoreHistory) {
    const date = new Date(entry.recorded_at);
    const key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (!allTimestamps.has(key) || date > allTimestamps.get(key)!) {
      allTimestamps.set(key, date);
    }
  }

  const sortedLabels = Array.from(allTimestamps.entries())
    .sort((a, b) => a[1].getTime() - b[1].getTime())
    .map(([label]) => label);

  if (sortedLabels.length < 1) return null;

  const datasets = DIMENSIONS.map((dim) => {
    const entries = byDimension[dim.key].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
    );
    const data: (number | null)[] = sortedLabels.map((label) => {
      const labelDate = allTimestamps.get(label)!;
      let lastScore: number | null = null;
      for (const entry of entries) {
        if (new Date(entry.recorded_at) <= new Date(labelDate.getTime() + 86400000)) {
          lastScore = entry.score;
        }
      }
      return lastScore;
    });
    return buildDataset(dim, data);
  });

  const hasData = datasets.some((ds) => ds.data.some((v) => v !== null));
  return hasData ? { labels: sortedLabels, datasets, count: scoreHistory.length } : null;
}

/** Build chart datasets from the legacy circle_leader_scores rows */
function buildFromRatings(ratings: ScorecardRating[]) {
  if (ratings.length < 2) return null;

  const sorted = [...ratings].sort(
    (a, b) => new Date(a.scored_date).getTime() - new Date(b.scored_date).getTime()
  );

  const labels = sorted.map((r) =>
    new Date(r.scored_date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  );

  const datasets = DIMENSIONS.map((dim) => {
    const data = sorted.map((r) => r[`${dim.key}_score` as keyof ScorecardRating] as number);
    return buildDataset(dim, data);
  });

  return { labels, datasets, count: ratings.length };
}

function buildDataset(dim: (typeof DIMENSIONS)[number], data: (number | null)[]) {
  return {
    label: dim.label,
    data,
    borderColor: dim.color,
    backgroundColor: dim.bg,
    pointBackgroundColor: dim.color,
    pointBorderColor: dim.color,
    pointHoverBackgroundColor: '#fff',
    pointHoverBorderColor: dim.color,
    pointRadius: 4,
    pointHoverRadius: 6,
    borderWidth: 2.5,
    tension: 0.3,
    fill: false,
    spanGaps: true,
  };
}

export default function ScorecardTrendChart({ scoreHistory, ratings }: ScorecardTrendChartProps) {
  const chartData = useMemo(() => {
    // Prefer new per-dimension history; fall back to legacy ratings
    if (scoreHistory.length > 0) {
      return buildFromHistory(scoreHistory);
    }
    if (ratings.length >= 2) {
      return buildFromRatings(ratings);
    }
    return null;
  }, [scoreHistory, ratings]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom' as const,
          labels: {
            color: 'rgba(255,255,255,0.7)',
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
            font: { size: 11 },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.8)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx: any) => {
              const val = ctx.parsed.y;
              return val !== null ? `${ctx.dataset.label}: ${val}/5` : `${ctx.dataset.label}: —`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: 'rgba(255,255,255,0.5)',
            font: { size: 10 },
            maxRotation: 45,
          },
        },
        y: {
          min: 0,
          max: 5,
          ticks: {
            stepSize: 1,
            color: 'rgba(255,255,255,0.5)',
            font: { size: 10 },
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
      },
    }),
    []
  );

  if (!chartData) return null;

  return (
    <div className="mt-5 pt-5 border-t border-gray-700/50">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
          />
        </svg>
        <h3 className="text-sm font-medium text-gray-300">Score Trends</h3>
        <span className="text-xs text-gray-500">({chartData.count} entries)</span>
      </div>
      <div style={{ height: 220 }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}
