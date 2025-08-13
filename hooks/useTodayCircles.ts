'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase, CircleLeader } from '../lib/supabase';
import type { CircleLeaderFilters } from './useCircleLeaders';

export const useTodayCircles = (filters: CircleLeaderFilters = {}, isReady: boolean = true) => {
  const [todayCircles, setTodayCircles] = useState<CircleLeader[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  // Create stable filter dependencies by JSON stringifying the values
  const filterKey = JSON.stringify({
    campus: filters.campus || [],
    acpd: filters.acpd || [],
    status: filters.status || [],
    circleType: filters.circleType || [],
    eventSummary: filters.eventSummary || 'all'
  });

  const loadTodayCircles = useCallback(async () => {
    // Avoid fetching until filters are initialized/ready
    if (!isReady) return;
    
    // Prevent multiple simultaneous loads
    if (loadingRef.current) return;

    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Get today's day name
      const today = new Date();
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayName = daysOfWeek[today.getDay()];

      // Build query for circle leaders that meet today
      let query = supabase
        .from('circle_leaders')
        .select('id, name, email, phone, campus, acpd, status, day, time, frequency, circle_type, event_summary_received, follow_up_required, follow_up_date, ccb_profile_link')
        .eq('day', todayName);

      // Apply dashboard filters
      if (filters) {
        if (filters.campus && filters.campus.length > 0) {
          query = query.in('campus', filters.campus);
        }
        if (filters.acpd && filters.acpd.length > 0) {
          query = query.in('acpd', filters.acpd);
        }
        if (filters.status && filters.status.length > 0) {
          const regularStatuses = filters.status.filter(s => s !== 'follow-up');
          if (regularStatuses.length > 0) {
            query = query.in('status', regularStatuses);
          }
        }
        if (filters.circleType && filters.circleType.length > 0) {
          query = query.in('circle_type', filters.circleType);
        }
        if (filters.eventSummary === 'received') {
          query = query.eq('event_summary_received', true);
        } else if (filters.eventSummary === 'not_received') {
          query = query.neq('event_summary_received', true);
        }
      }

      const { data: leaders, error: leadersError } = await query.order('time', { ascending: true });

      if (leadersError) {
        console.error("Error loading today's circles:", leadersError);
        throw leadersError;
      }

      // Load notes only for today's leaders
      let allNotes: any[] = [];
      if (leaders && leaders.length > 0) {
        const leaderIds = leaders.map(leader => leader.id);
        const { data: notesData, error: notesError } = await supabase
          .from('notes')
          .select('*')
          .in('circle_leader_id', leaderIds)
          .order('created_at', { ascending: false });

        if (!notesError && notesData) {
          allNotes = notesData;
        }
      }

      // Create a map of leader_id to their latest note
      const latestNotesMap = new Map();
      if (allNotes && allNotes.length > 0) {
        allNotes.forEach((note: any) => {
          if (!latestNotesMap.has(note.circle_leader_id)) {
            latestNotesMap.set(note.circle_leader_id, note);
          }
        });
      }

      // Combine leaders with their latest notes
      const leadersWithNotes = (leaders || []).map(leader => ({
        ...leader,
        last_note: latestNotesMap.get(leader.id) || null
      }));

      setTodayCircles(leadersWithNotes);

    } catch (error: any) {
      console.error("Error loading today's circles:", error);
      setError("Error loading today's circles.");
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [filterKey, isReady]); // Use filterKey instead of filters to avoid re-renders

  // Load today's circles when hook is first used and when filters become ready
  useEffect(() => {
    loadTodayCircles();
  }, [loadTodayCircles]);

  // Debounced refresh function to prevent excessive calls
  const refreshTimeout = useRef<NodeJS.Timeout | null>(null);
  const refreshTodayCircles = useCallback(() => {
    // Clear any existing timeout
    if (refreshTimeout.current) {
      clearTimeout(refreshTimeout.current);
    }
    
    // Set a new timeout to batch multiple rapid calls
    refreshTimeout.current = setTimeout(() => {
      loadTodayCircles();
    }, 100);
  }, [loadTodayCircles]);

  return {
    todayCircles,
    isLoading,
    error,
    refreshTodayCircles
  };
};
