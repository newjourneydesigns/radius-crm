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
import { ScorecardRating } from '../../lib/supabase';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const DIMENSION_COLORS = {
  reach: { line: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
  connect: { line: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
  disciple: { line: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)' },
  develop: { line: '#f97316', bg: 'rgba(249, 115, 22, 0.1)' },
};

interface ProgressTimelineProps {
  ratings: ScorecardRating[];
  height?: number;
}

export default function ProgressTimeline({ ratings, height = 280 }: ProgressTimelineProps) {
  const chartData = useMemo(() => {
    if (ratings.length === 0) return null;

    // Sort chronologically (oldest first)
    const sorted = [...ratings].sort((a, b) => a.scored_date.localeCompare(b.scored_date));

    const labels = sorted.map(r => {
      const d = new Date(r.scored_date + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return {
      labels,
      datasets: [
        {
          label: 'Reach',
          data: sorted.map(r => r.reach_score),
          borderColor: DIMENSION_COLORS.reach.line,
          backgroundColor: DIMENSION_COLORS.reach.bg,
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: DIMENSION_COLORS.reach.line,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          borderWidth: 2,
        },
        {
          label: 'Connect',
          data: sorted.map(r => r.connect_score),
          borderColor: DIMENSION_COLORS.connect.line,
          backgroundColor: DIMENSION_COLORS.connect.bg,
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: DIMENSION_COLORS.connect.line,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          borderWidth: 2,
        },
        {
          label: 'Disciple',
          data: sorted.map(r => r.disciple_score),
          borderColor: DIMENSION_COLORS.disciple.line,
          backgroundColor: DIMENSION_COLORS.disciple.bg,
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: DIMENSION_COLORS.disciple.line,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          borderWidth: 2,
        },
        {
          label: 'Develop',
          data: sorted.map(r => r.develop_score),
          borderColor: DIMENSION_COLORS.develop.line,
          backgroundColor: DIMENSION_COLORS.develop.bg,
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: DIMENSION_COLORS.develop.line,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          borderWidth: 2,
        },
      ],
    };
  }, [ratings]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: {
            color: '#8da9c4',
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
            font: { size: 12 },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(11, 37, 69, 0.95)',
          titleColor: '#eef4ed',
          bodyColor: '#8da9c4',
          borderColor: 'rgba(76, 103, 133, 0.3)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            afterBody: (context: any) => {
              const index = context[0]?.dataIndex;
              if (index === undefined) return '';
              const sorted = [...ratings].sort((a, b) => a.scored_date.localeCompare(b.scored_date));
              const rating = sorted[index];
              if (rating?.notes) {
                return '\nNote: ' + rating.notes.substring(0, 80) + (rating.notes.length > 80 ? '...' : '');
              }
              return '';
            },
          },
        },
      },
      scales: {
        y: {
          min: 0.5,
          max: 5.5,
          ticks: {
            stepSize: 1,
            callback: (value: any) => {
              if (value >= 1 && value <= 5 && Number.isInteger(value)) return value;
              return '';
            },
            color: '#8da9c4',
            font: { size: 11 },
          },
          grid: {
            color: 'rgba(76, 103, 133, 0.2)',
          },
          border: {
            color: 'rgba(76, 103, 133, 0.3)',
          },
        },
        x: {
          ticks: {
            color: '#8da9c4',
            font: { size: 11 },
            maxRotation: 45,
          },
          grid: {
            display: false,
          },
          border: {
            color: 'rgba(76, 103, 133, 0.3)',
          },
        },
      },
      interaction: {
        intersect: false,
        mode: 'index' as const,
      },
    }),
    [ratings]
  );

  if (ratings.length === 0) {
    return null;
  }

  if (ratings.length === 1) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Progress Timeline</h3>
        <p className="text-xs text-gray-500">Score the leader again to start seeing trends over time.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Progress Timeline</h2>
            <p className="text-xs text-gray-500 mt-0.5">Score trends over time</p>
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-6">
        <div style={{ height: height + 'px' }}>
          {chartData && <Line data={chartData} options={chartOptions} />}
        </div>
      </div>
    </div>
  );
}
