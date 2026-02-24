/**
 * useCircleAttendance — loads and caches meeting-occurrence data
 * from the circle_meeting_occurrences Supabase table.
 *
 * Data is background-synced from CCB so this hook never hits the
 * CCB API. It reads directly from Supabase and caches in-memory
 * for 10 minutes per leader.
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────────

export interface MeetingOccurrence {
  id: string;
  leader_id: number;
  meeting_date: string;
  status: 'met' | 'did_not_meet' | 'no_record';
  headcount: number | null;
  regular_count: number | null;
  visitor_count: number | null;
  source: string;
  synced_at: string | null;
}

export interface MonthlyAverage {
  month: string;      // "2025-09"
  label: string;      // "Sep 2025"
  avgAttendance: number;
  meetingCount: number;
  didNotMeetCount: number;
  noRecordCount: number;
  totalHeadcount: number;
}

export interface AttendanceSummary {
  weeklyData: MeetingOccurrence[];
  monthlyAverages: MonthlyAverage[];
  overallStats: {
    totalMeetings: number;
    metCount: number;
    didNotMeetCount: number;
    noRecordCount: number;
    avgAttendance: number;
    peakAttendance: number;
    attendanceTrend: 'up' | 'down' | 'flat';
    lastSyncedAt: string | null;
  };
}

// ── In-memory cache ────────────────────────────────────────────

const attendanceCache = new Map<number, { data: AttendanceSummary; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// ── Hook ───────────────────────────────────────────────────────

export function useCircleAttendance() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const loadAttendance = useCallback(
    async (leaderId: number, months = 6): Promise<AttendanceSummary | null> => {
      // Check cache first
      const cached = attendanceCache.get(leaderId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }

      // Prevent double-loading
      if (loadingRef.current) return null;
      loadingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);
        const startStr = startDate.toISOString().split('T')[0];

        const { data, error: queryError } = await supabase
          .from('circle_meeting_occurrences')
          .select(
            'id, leader_id, meeting_date, status, headcount, regular_count, visitor_count, source, synced_at'
          )
          .eq('leader_id', leaderId)
          .gte('meeting_date', startStr)
          .order('meeting_date', { ascending: true });

        if (queryError) throw queryError;

        const occurrences = (data || []) as MeetingOccurrence[];

        // ── Build monthly averages ─────────────────────────────────
        const monthBuckets = new Map<string, MeetingOccurrence[]>();
        for (const occ of occurrences) {
          const monthKey = occ.meeting_date.substring(0, 7); // "YYYY-MM"
          if (!monthBuckets.has(monthKey)) monthBuckets.set(monthKey, []);
          monthBuckets.get(monthKey)!.push(occ);
        }

        const monthlyAverages: MonthlyAverage[] = Array.from(monthBuckets.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([monthKey, occs]) => {
            const metOccs = occs.filter(
              (o) => o.status === 'met' && o.headcount != null
            );
            const totalHeadcount = metOccs.reduce(
              (sum, o) => sum + (o.headcount || 0),
              0
            );
            const avg = metOccs.length > 0 ? totalHeadcount / metOccs.length : 0;

            const [year, month] = monthKey.split('-');
            const label = new Date(
              parseInt(year),
              parseInt(month) - 1
            ).toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric',
            });

            return {
              month: monthKey,
              label,
              avgAttendance: Math.round(avg * 10) / 10,
              meetingCount: metOccs.length,
              didNotMeetCount: occs.filter((o) => o.status === 'did_not_meet')
                .length,
              noRecordCount: occs.filter((o) => o.status === 'no_record')
                .length,
              totalHeadcount,
            };
          });

        // ── Overall stats ──────────────────────────────────────────
        const metMeetings = occurrences.filter((o) => o.status === 'met');
        const allHeadcounts = metMeetings.map((o) => o.headcount || 0);
        const avgAttendance =
          allHeadcounts.length > 0
            ? allHeadcounts.reduce((a, b) => a + b, 0) / allHeadcounts.length
            : 0;

        // Trend: compare last half avg vs first half avg
        const midpoint = Math.floor(monthlyAverages.length / 2);
        const recentSlice = monthlyAverages.slice(midpoint);
        const priorSlice = monthlyAverages.slice(0, midpoint);
        const recentAvg =
          recentSlice.length > 0
            ? recentSlice.reduce((s, m) => s + m.avgAttendance, 0) /
              recentSlice.length
            : 0;
        const priorAvg =
          priorSlice.length > 0
            ? priorSlice.reduce((s, m) => s + m.avgAttendance, 0) /
              priorSlice.length
            : 0;

        const trend: 'up' | 'down' | 'flat' =
          priorAvg === 0
            ? 'flat'
            : recentAvg > priorAvg * 1.05
              ? 'up'
              : recentAvg < priorAvg * 0.95
                ? 'down'
                : 'flat';

        // Latest sync timestamp
        const lastSyncedAt =
          occurrences
            .filter((o) => o.synced_at)
            .sort((a, b) =>
              (b.synced_at || '').localeCompare(a.synced_at || '')
            )[0]?.synced_at || null;

        const summary: AttendanceSummary = {
          weeklyData: occurrences,
          monthlyAverages,
          overallStats: {
            totalMeetings: occurrences.length,
            metCount: metMeetings.length,
            didNotMeetCount: occurrences.filter(
              (o) => o.status === 'did_not_meet'
            ).length,
            noRecordCount: occurrences.filter(
              (o) => o.status === 'no_record'
            ).length,
            avgAttendance: Math.round(avgAttendance * 10) / 10,
            peakAttendance:
              allHeadcounts.length > 0 ? Math.max(...allHeadcounts) : 0,
            attendanceTrend: trend,
            lastSyncedAt,
          },
        };

        attendanceCache.set(leaderId, { data: summary, timestamp: Date.now() });
        return summary;
      } catch (err: any) {
        console.error('Error loading attendance:', err);
        setError(err.message || 'Failed to load attendance data');
        return null;
      } finally {
        setIsLoading(false);
        loadingRef.current = false;
      }
    },
    []
  );

  const invalidateCache = useCallback((leaderId?: number) => {
    if (leaderId) attendanceCache.delete(leaderId);
    else attendanceCache.clear();
  }, []);

  return { loadAttendance, invalidateCache, isLoading, error };
}
