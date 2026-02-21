/**
 * Weekly Trend Utilities
 *
 * Buckets scorecard ratings into weekly snapshots (Sun → Sat, CST).
 * Each week "closes" at Saturday 11:59:59 PM CST (UTC-6).
 *
 * Used on both the Progress Dashboard (aggregate across leaders)
 * and the Circle Leader Profile page (single leader).
 */

import { ScorecardRating, ScorecardDimension } from './supabase';

// ── Types ───────────────────────────────────────────────────

export interface WeeklyDataPoint {
  /** ISO date string of the Saturday ending this week (YYYY-MM-DD) */
  weekEnding: string;
  /** Human-friendly label, e.g. "Feb 15" */
  label: string;
  /** Average score for the dimension this week (null if no data) */
  value: number | null;
  /** Number of scores that went into this average */
  count: number;
  /** Min score this week (for range shading) */
  min: number | null;
  /** Max score this week (for range shading) */
  max: number | null;
}

export interface CategoryWeeklyTrend {
  category: ScorecardDimension;
  data: WeeklyDataPoint[];
  /** Overall trend slope across all weeks (positive = improving) */
  trendSlope: number;
  /** Current week value (if available) */
  currentValue: number | null;
  /** Previous week value (if available) */
  previousValue: number | null;
  /** Absolute change from previous to current */
  weekOverWeekDelta: number | null;
}

export interface WeeklyTrendsResult {
  reach: CategoryWeeklyTrend;
  connect: CategoryWeeklyTrend;
  disciple: CategoryWeeklyTrend;
  develop: CategoryWeeklyTrend;
  /** All unique week-ending dates across all categories */
  allWeeks: string[];
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Get the Saturday that ends the week containing `dateStr`.
 * Weeks run Sunday (0) → Saturday (6).
 * CST = UTC-6. We treat the date as CST midnight for bucketing.
 */
function getSaturdayForDate(dateStr: string): string {
  // Parse as local date (no timezone shift issues with YYYY-MM-DD)
  const d = new Date(dateStr + 'T12:00:00-06:00'); // noon CST to avoid DST edge
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const daysUntilSat = (6 - day + 7) % 7; // 0 if already Saturday
  const sat = new Date(d);
  sat.setDate(sat.getDate() + daysUntilSat);
  return sat.toISOString().split('T')[0];
}

/**
 * Check whether this week (for a given Saturday) is still "in progress"
 * — i.e. today in CST is before Saturday 11:59:59 PM.
 */
function isCurrentWeek(saturdayStr: string): boolean {
  const now = new Date();
  // Convert now to CST by subtracting 6 hours
  const cst = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const todayCST = cst.toISOString().split('T')[0];
  return saturdayStr >= todayCST;
}

/**
 * Format a Saturday date as a short label: "Feb 15"
 */
function formatWeekLabel(saturdayStr: string): string {
  const d = new Date(saturdayStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Simple linear regression slope for trend detection.
 * Returns slope per week (positive = improving).
 */
function computeSlope(values: (number | null)[]): number {
  const points: [number, number][] = [];
  values.forEach((v, i) => {
    if (v !== null) points.push([i, v]);
  });
  if (points.length < 2) return 0;

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p[0], 0);
  const sumY = points.reduce((s, p) => s + p[1], 0);
  const sumXY = points.reduce((s, p) => s + p[0] * p[1], 0);
  const sumX2 = points.reduce((s, p) => s + p[0] * p[0], 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return Math.round(((n * sumXY - sumX * sumY) / denom) * 100) / 100;
}

// ── Main Functions ──────────────────────────────────────────

const DIMENSIONS: ScorecardDimension[] = ['reach', 'connect', 'disciple', 'develop'];
const SCORE_KEYS: Record<ScorecardDimension, keyof ScorecardRating> = {
  reach: 'reach_score',
  connect: 'connect_score',
  disciple: 'disciple_score',
  develop: 'develop_score',
};

/**
 * Compute weekly trends from an array of scorecard ratings.
 *
 * @param scores     Array of ScorecardRating (from one leader or many)
 * @param maxWeeks   Maximum number of weeks to return (default: 12, 0 = all)
 * @param includeCurrentWeek  Whether to include the in-progress current week
 */
export function computeWeeklyTrends(
  scores: ScorecardRating[],
  maxWeeks: number = 12,
  includeCurrentWeek: boolean = true
): WeeklyTrendsResult {
  if (scores.length === 0) {
    const empty: CategoryWeeklyTrend = {
      category: 'reach',
      data: [],
      trendSlope: 0,
      currentValue: null,
      previousValue: null,
      weekOverWeekDelta: null,
    };
    return {
      reach: { ...empty, category: 'reach' },
      connect: { ...empty, category: 'connect' },
      disciple: { ...empty, category: 'disciple' },
      develop: { ...empty, category: 'develop' },
      allWeeks: [],
    };
  }

  // 1. Bucket every score into its Saturday-ending week
  const weekBuckets = new Map<
    string,
    Record<ScorecardDimension, number[]>
  >();

  for (const score of scores) {
    const sat = getSaturdayForDate(score.scored_date);
    if (!weekBuckets.has(sat)) {
      weekBuckets.set(sat, { reach: [], connect: [], disciple: [], develop: [] });
    }
    const bucket = weekBuckets.get(sat)!;
    for (const dim of DIMENSIONS) {
      const val = score[SCORE_KEYS[dim]] as number;
      if (val != null) bucket[dim].push(val);
    }
  }

  // 2. Sort weeks chronologically
  let sortedWeeks = Array.from(weekBuckets.keys()).sort();

  // 3. Filter out current in-progress week if requested
  if (!includeCurrentWeek) {
    sortedWeeks = sortedWeeks.filter(w => !isCurrentWeek(w));
  }

  // 4. Limit to maxWeeks (most recent)
  if (maxWeeks > 0 && sortedWeeks.length > maxWeeks) {
    sortedWeeks = sortedWeeks.slice(-maxWeeks);
  }

  // 5. Build per-category trend data
  const result: Record<string, CategoryWeeklyTrend> = {};

  for (const dim of DIMENSIONS) {
    const data: WeeklyDataPoint[] = sortedWeeks.map(week => {
      const bucket = weekBuckets.get(week)!;
      const vals = bucket[dim];
      if (vals.length === 0) {
        return {
          weekEnding: week,
          label: formatWeekLabel(week),
          value: null,
          count: 0,
          min: null,
          max: null,
        };
      }
      const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
      return {
        weekEnding: week,
        label: formatWeekLabel(week),
        value: avg,
        count: vals.length,
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    });

    const values = data.map(d => d.value);
    const nonNull = values.filter((v): v is number => v !== null);
    const current = nonNull.length > 0 ? nonNull[nonNull.length - 1] : null;
    const previous = nonNull.length > 1 ? nonNull[nonNull.length - 2] : null;

    result[dim] = {
      category: dim,
      data,
      trendSlope: computeSlope(values),
      currentValue: current,
      previousValue: previous,
      weekOverWeekDelta: current !== null && previous !== null
        ? Math.round((current - previous) * 10) / 10
        : null,
    };
  }

  return {
    reach: result.reach,
    connect: result.connect,
    disciple: result.disciple,
    develop: result.develop,
    allWeeks: sortedWeeks,
  };
}

/**
 * Return a user-friendly trend label from a slope value.
 */
export function getTrendLabel(slope: number): { text: string; icon: '↑' | '↓' | '→'; sentiment: 'positive' | 'negative' | 'neutral' } {
  if (slope >= 0.3) return { text: 'Strong Growth', icon: '↑', sentiment: 'positive' };
  if (slope >= 0.1) return { text: 'Improving', icon: '↑', sentiment: 'positive' };
  if (slope <= -0.3) return { text: 'Declining', icon: '↓', sentiment: 'negative' };
  if (slope <= -0.1) return { text: 'Slight Decline', icon: '↓', sentiment: 'negative' };
  return { text: 'Stable', icon: '→', sentiment: 'neutral' };
}
