'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase, CircleLeader } from '../lib/supabase';
import type { CircleLeaderFilters } from './useCircleLeaders';

export const useTodayCircles = (filters: CircleLeaderFilters = {}, isReady: boolean = true) => {
  const [todayCircles, setTodayCircles] = useState<CircleLeader[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  // Create stable filter dependencies by JSON stringifying only the values we actually use
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
      const baseSelect = (includeSkipped: boolean) => (
        'id, name, campus, acpd, status, day, time, frequency, circle_type, ccb_profile_link, ' +
        'event_summary_received' +
        (includeSkipped ? ', event_summary_skipped' : '')
      );

      const applyFilters = (q: any, includeSkipped: boolean) => {
        // Required day filter
        q = q.eq('day', todayName);

        if (filters.campus && filters.campus.length > 0) {
          q = q.in('campus', filters.campus);
        }
        if (filters.acpd && filters.acpd.length > 0) {
          q = q.in('acpd', filters.acpd);
        }
        if (filters.status && filters.status.length > 0) {
          const regularStatuses = filters.status.filter(s => s !== 'follow-up');
          if (regularStatuses.length > 0) {
            q = q.in('status', regularStatuses);
          }
        }
        if (filters.circleType && filters.circleType.length > 0) {
          q = q.in('circle_type', filters.circleType);
        }

        // Event summary filter
        if (filters.eventSummary === 'received') {
          q = q.eq('event_summary_received', true);
        } else if (filters.eventSummary === 'skipped') {
          if (includeSkipped) {
            q = q.eq('event_summary_skipped', true);
          } else {
            // DB not migrated yet; return no rows
            q = q.eq('id', -1);
          }
        } else if (filters.eventSummary === 'not_received') {
          q = q.neq('event_summary_received', true);
          if (includeSkipped) {
            q = q.neq('event_summary_skipped', true);
          }
        }

        return q;
      };

      let query = applyFilters(
        supabase.from('circle_leaders').select(baseSelect(true)),
        true
      );

      let { data: leaders, error: leadersError } = await query.order('time', { ascending: true });

      if (leadersError && /event_summary_skipped/i.test(leadersError.message || '')) {
        console.warn('event_summary_skipped column missing; retrying without it. Apply add_event_summary_skipped.sql to enable tri-state.');
        query = applyFilters(
          supabase.from('circle_leaders').select(baseSelect(false)),
          false
        );
        ({ data: leaders, error: leadersError } = await query.order('time', { ascending: true }));

        if (leaders && leaders.length > 0) {
          leaders = leaders.map((l: any) => ({ ...l, event_summary_skipped: false }));
        }
      }

      if (leadersError) {
        console.error("Error loading today's circles:", leadersError);
        throw leadersError;
      }

      setTodayCircles(leaders || []);

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
