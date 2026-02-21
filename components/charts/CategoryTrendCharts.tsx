'use client';

import { useState, useMemo } from 'react';
import CategoryTrendChart from './CategoryTrendChart';
import { WeeklyTrendsResult, computeWeeklyTrends } from '../../lib/weeklyTrends';
import { ScorecardRating, ScorecardDimension } from '../../lib/supabase';

// ── Range presets ───────────────────────────────────────────

type RangePreset = '8w' | '12w' | '6m' | 'all';

const RANGE_OPTIONS: { key: RangePreset; label: string; weeks: number }[] = [
  { key: '8w', label: '8 Weeks', weeks: 8 },
  { key: '12w', label: '12 Weeks', weeks: 12 },
  { key: '6m', label: '6 Months', weeks: 26 },
  { key: 'all', label: 'All Time', weeks: 0 },
];

// ── Props ───────────────────────────────────────────────────

interface CategoryTrendChartsProps {
  /** Raw scorecard ratings to analyze */
  scores: ScorecardRating[];
  /** Title displayed above the charts (optional) */
  title?: string;
  /** Subtitle displayed below the title (optional) */
  subtitle?: string;
  /** Chart height per chart (default: 200) */
  chartHeight?: number;
  /** Whether these are aggregate scores (shows range shading) */
  isAggregate?: boolean;
  /** Show the goal line at score 4 (default: true) */
  showGoalLine?: boolean;
  /** Show the range selector (default: true) */
  showRangeSelector?: boolean;
  /** Default range (default: '12w') */
  defaultRange?: RangePreset;
  /** Compact mode for smaller layouts (default: false) */
  compact?: boolean;
  /** Pre-computed trends (if provided, skips computing from scores) */
  precomputedTrends?: WeeklyTrendsResult;
}

// ── Main Container ──────────────────────────────────────────

export default function CategoryTrendCharts({
  scores,
  title = 'Weekly Category Trends',
  subtitle,
  chartHeight = 200,
  isAggregate = false,
  showGoalLine = true,
  showRangeSelector = true,
  defaultRange = '12w',
  compact = false,
  precomputedTrends,
}: CategoryTrendChartsProps) {
  const [range, setRange] = useState<RangePreset>(defaultRange);

  const maxWeeks = RANGE_OPTIONS.find(r => r.key === range)?.weeks ?? 12;

  const trends = useMemo(() => {
    if (precomputedTrends) return precomputedTrends;
    return computeWeeklyTrends(scores, maxWeeks, true);
  }, [scores, maxWeeks, precomputedTrends]);

  const categories: ScorecardDimension[] = ['reach', 'connect', 'disciple', 'develop'];
  const hasAnyData = categories.some(c => trends[c].data.some(d => d.value !== null));

  if (!hasAnyData && scores.length === 0) {
    return null; // Nothing to show
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium text-white">{title}</h2>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          )}
          {!subtitle && (
            <p className="text-xs text-gray-500 mt-0.5">
              Weekly snapshots — updates each Saturday at midnight CST
            </p>
          )}
        </div>
        {showRangeSelector && (
          <div className="flex items-center gap-1 bg-gray-900/50 rounded-lg p-0.5">
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setRange(opt.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  range === opt.key
                    ? 'bg-gray-700 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Charts Grid */}
      <div className="p-4 sm:p-6">
        {!hasAnyData ? (
          <div className="py-8 text-center">
            <svg className="w-10 h-10 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            <p className="text-sm text-gray-500">Not enough data to show weekly trends yet.</p>
            <p className="text-xs text-gray-600 mt-1">Score leaders weekly to start seeing trends here.</p>
          </div>
        ) : (
          <div className={`grid grid-cols-1 ${compact ? '' : 'lg:grid-cols-2'} gap-4`}>
            {categories.map(cat => (
              <CategoryTrendChart
                key={cat}
                trend={trends[cat]}
                height={chartHeight}
                showGoalLine={showGoalLine}
                showRange={isAggregate}
                compact={compact}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
