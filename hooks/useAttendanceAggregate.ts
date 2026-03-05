/**
 * useAttendanceAggregate — loads aggregate attendance data across all circles
 * from the circle_meeting_occurrences table joined with circle_leaders.
 *
 * Supports filtering by campus, circle type, and date range.
 * Returns breakdowns by day-of-week, week, month, type, and campus.
 */

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────────

export type AggregateTimeRange = 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface AttendanceAggregateFilters {
  campuses?: string[];
  circleTypes?: string[];
  timeRange?: AggregateTimeRange;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

export interface DayBreakdown {
  day: string;       // e.g. "Monday"
  totalMeetings: number;
  totalAttendance: number;
  avgAttendance: number;
  circleCount: number;
}

export interface WeekBreakdown {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekLabel: string; // e.g. "Jan 6 – Jan 12"
  totalMeetings: number;
  totalAttendance: number;
  avgAttendance: number;
  circleCount: number;
}

export interface MonthBreakdown {
  month: string;      // "YYYY-MM"
  monthLabel: string; // "Jan 2025"
  totalMeetings: number;
  totalAttendance: number;
  avgAttendance: number;
  circleCount: number;
}

export interface TypeBreakdown {
  circleType: string;
  totalMeetings: number;
  totalAttendance: number;
  avgAttendance: number;
  circleCount: number;
}

export interface CampusBreakdown {
  campus: string;
  totalMeetings: number;
  totalAttendance: number;
  avgAttendance: number;
  circleCount: number;
}

export interface AttendanceAggregateSummary {
  totalCircles: number;        // unique circles that met
  totalMeetings: number;       // rows with status=met
  totalAttendance: number;     // sum of headcount
  avgAttendancePerMeeting: number;
  didNotMeetCount: number;
  noRecordCount: number;
  byDayOfWeek: DayBreakdown[];
  byWeek: WeekBreakdown[];
  byMonth: MonthBreakdown[];
  byType: TypeBreakdown[];
  byCampus: CampusBreakdown[];
  dateRangeStart: string;
  dateRangeEnd: string;
}

// ── Helpers ───────────────────────────────────────────────────

function getDateRange(timeRange: AggregateTimeRange, startDate?: string, endDate?: string): { start: string; end: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (timeRange === 'custom' && startDate && endDate) {
    return { start: startDate, end: endDate };
  }

  const end = today.toISOString().split('T')[0];

  if (timeRange === 'week') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { start: start.toISOString().split('T')[0], end };
  }
  if (timeRange === 'month') {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    return { start: start.toISOString().split('T')[0], end };
  }
  if (timeRange === 'quarter') {
    const start = new Date(today);
    start.setDate(start.getDate() - 89);
    return { start: start.toISOString().split('T')[0], end };
  }
  // year (default)
  const start = new Date(today);
  start.setFullYear(start.getFullYear() - 1);
  start.setDate(start.getDate() + 1);
  return { start: start.toISOString().split('T')[0], end };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getMondayOfWeek(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

function formatWeekLabel(mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${monday.toLocaleDateString('en-US', opts)} – ${sunday.toLocaleDateString('en-US', opts)}`;
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

// ── Raw row type from Supabase ─────────────────────────────────

interface RawCircleLeaderJoin {
  campus: string | null;
  circle_type: string | null;
}

interface RawOccurrence {
  meeting_date: string;
  status: string;
  headcount: number | null;
  leader_id: number;
  // Supabase returns joined rows as an array OR a single object depending on the relationship.
  // For a many-to-one FK (leader_id → circle_leaders.id), it returns a single object.
  // We cast via unknown to handle both.
  circle_leaders: RawCircleLeaderJoin | RawCircleLeaderJoin[] | null;
}

// ── Hook ───────────────────────────────────────────────────────

export function useAttendanceAggregate() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAggregate = useCallback(
    async (filters: AttendanceAggregateFilters = {}): Promise<AttendanceAggregateSummary | null> => {
      const { timeRange = 'month', startDate, endDate, campuses = [], circleTypes = [] } = filters;
      const { start, end } = getDateRange(timeRange, startDate, endDate);

      setIsLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('circle_meeting_occurrences')
          .select('meeting_date, status, headcount, leader_id, circle_leaders(campus, circle_type)')
          .gte('meeting_date', start)
          .lte('meeting_date', end)
          .order('meeting_date', { ascending: true });

        const { data, error: queryError } = await query;
        if (queryError) throw queryError;

        let occurrences = (data as unknown as RawOccurrence[]) || [];

        // Helper to safely read the joined circle_leaders.
        // Supabase-js types the join as an array, but for a many-to-one FK it
        // always returns a single object at runtime; guard both cases defensively.
        const getLeader = (o: RawOccurrence): RawCircleLeaderJoin | null => {
          if (!o.circle_leaders) return null;
          if (Array.isArray(o.circle_leaders)) return o.circle_leaders[0] ?? null;
          return o.circle_leaders;
        };

        // Apply campus / circle type filters client-side (after join)
        if (campuses.length > 0) {
          const normalised = campuses.map((c) => c.trim().toLowerCase());
          occurrences = occurrences.filter((o) =>
            normalised.includes((getLeader(o)?.campus || '').trim().toLowerCase())
          );
        }
        if (circleTypes.length > 0) {
          const normalised = circleTypes.map((t) => t.trim().toLowerCase());
          occurrences = occurrences.filter((o) =>
            normalised.includes((getLeader(o)?.circle_type || '').trim().toLowerCase())
          );
        }

        const metOccs = occurrences.filter((o) => o.status === 'met');
        const totalAttendance = metOccs.reduce((s, o) => s + (o.headcount || 0), 0);
        const avgAttendancePerMeeting = metOccs.length > 0 ? totalAttendance / metOccs.length : 0;

        // Unique circles that met
        const uniqueCirclesAllMet = new Set(metOccs.map((o) => o.leader_id));

        // ── By day of week ─────────────────────────────────────
        const dayMap = new Map<
          number,
          { meetings: number; attendance: number; circles: Set<number> }
        >();
        for (let i = 0; i < 7; i++) dayMap.set(i, { meetings: 0, attendance: 0, circles: new Set() });

        for (const occ of metOccs) {
          const dow = new Date(occ.meeting_date + 'T00:00:00').getDay();
          const entry = dayMap.get(dow)!;
          entry.meetings += 1;
          entry.attendance += occ.headcount || 0;
          entry.circles.add(occ.leader_id);
        }

        const byDayOfWeek: DayBreakdown[] = Array.from(dayMap.entries())
          .filter(([, v]) => v.meetings > 0)
          .map(([dow, v]) => ({
            day: DAY_NAMES[dow],
            totalMeetings: v.meetings,
            totalAttendance: v.attendance,
            avgAttendance: v.meetings > 0 ? Math.round((v.attendance / v.meetings) * 10) / 10 : 0,
            circleCount: v.circles.size,
          }))
          .sort((a, b) => {
            const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            return order.indexOf(a.day) - order.indexOf(b.day);
          });

        // ── By week ────────────────────────────────────────────
        const weekMap = new Map<
          string,
          { meetings: number; attendance: number; circles: Set<number> }
        >();
        for (const occ of metOccs) {
          const weekKey = getMondayOfWeek(occ.meeting_date);
          if (!weekMap.has(weekKey)) weekMap.set(weekKey, { meetings: 0, attendance: 0, circles: new Set() });
          const entry = weekMap.get(weekKey)!;
          entry.meetings += 1;
          entry.attendance += occ.headcount || 0;
          entry.circles.add(occ.leader_id);
        }
        const byWeek: WeekBreakdown[] = Array.from(weekMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([weekStart, v]) => ({
            weekStart,
            weekLabel: formatWeekLabel(weekStart),
            totalMeetings: v.meetings,
            totalAttendance: v.attendance,
            avgAttendance: v.meetings > 0 ? Math.round((v.attendance / v.meetings) * 10) / 10 : 0,
            circleCount: v.circles.size,
          }));

        // ── By month ───────────────────────────────────────────
        const monthMap = new Map<
          string,
          { meetings: number; attendance: number; circles: Set<number> }
        >();
        for (const occ of metOccs) {
          const monthKey = occ.meeting_date.substring(0, 7);
          if (!monthMap.has(monthKey)) monthMap.set(monthKey, { meetings: 0, attendance: 0, circles: new Set() });
          const entry = monthMap.get(monthKey)!;
          entry.meetings += 1;
          entry.attendance += occ.headcount || 0;
          entry.circles.add(occ.leader_id);
        }
        const byMonth: MonthBreakdown[] = Array.from(monthMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, v]) => ({
            month,
            monthLabel: formatMonthLabel(month),
            totalMeetings: v.meetings,
            totalAttendance: v.attendance,
            avgAttendance: v.meetings > 0 ? Math.round((v.attendance / v.meetings) * 10) / 10 : 0,
            circleCount: v.circles.size,
          }));

        // ── By circle type ─────────────────────────────────────
        const typeMap = new Map<
          string,
          { meetings: number; attendance: number; circles: Set<number> }
        >();
        for (const occ of metOccs) {
          const t = getLeader(occ)?.circle_type || 'Unknown';
          if (!typeMap.has(t)) typeMap.set(t, { meetings: 0, attendance: 0, circles: new Set() });
          const entry = typeMap.get(t)!;
          entry.meetings += 1;
          entry.attendance += occ.headcount || 0;
          entry.circles.add(occ.leader_id);
        }
        const byType: TypeBreakdown[] = Array.from(typeMap.entries())
          .map(([circleType, v]) => ({
            circleType,
            totalMeetings: v.meetings,
            totalAttendance: v.attendance,
            avgAttendance: v.meetings > 0 ? Math.round((v.attendance / v.meetings) * 10) / 10 : 0,
            circleCount: v.circles.size,
          }))
          .sort((a, b) => b.totalAttendance - a.totalAttendance);

        // ── By campus ──────────────────────────────────────────
        const campusMap = new Map<
          string,
          { meetings: number; attendance: number; circles: Set<number> }
        >();
        for (const occ of metOccs) {
          const c = getLeader(occ)?.campus || 'Unknown';
          if (!campusMap.has(c)) campusMap.set(c, { meetings: 0, attendance: 0, circles: new Set() });
          const entry = campusMap.get(c)!;
          entry.meetings += 1;
          entry.attendance += occ.headcount || 0;
          entry.circles.add(occ.leader_id);
        }
        const byCampus: CampusBreakdown[] = Array.from(campusMap.entries())
          .map(([campus, v]) => ({
            campus,
            totalMeetings: v.meetings,
            totalAttendance: v.attendance,
            avgAttendance: v.meetings > 0 ? Math.round((v.attendance / v.meetings) * 10) / 10 : 0,
            circleCount: v.circles.size,
          }))
          .sort((a, b) => b.totalAttendance - a.totalAttendance);

        return {
          totalCircles: uniqueCirclesAllMet.size,
          totalMeetings: metOccs.length,
          totalAttendance,
          avgAttendancePerMeeting: Math.round(avgAttendancePerMeeting * 10) / 10,
          didNotMeetCount: occurrences.filter((o) => o.status === 'did_not_meet').length,
          noRecordCount: occurrences.filter((o) => o.status === 'no_record').length,
          byDayOfWeek,
          byWeek,
          byMonth,
          byType,
          byCampus,
          dateRangeStart: start,
          dateRangeEnd: end,
        };
      } catch (err: any) {
        console.error('Error loading attendance aggregate:', err);
        setError(err.message || 'Failed to load attendance data');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { loadAggregate, isLoading, error };
}
