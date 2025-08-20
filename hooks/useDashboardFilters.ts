import { useState, useEffect, useCallback, useMemo } from 'react';

export interface DashboardFilters {
  campus: string[];
  acpd: string[];
  status: string[];
  meetingDay: string[];
  circleType: string[];
  eventSummary: string;
  connected: string;
  timeOfDay: string;
}

// Get today's day name for default filter
const getTodayDayName = (): string => {
  const today = new Date();
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return daysOfWeek[today.getDay()];
};

export const defaultFilters: DashboardFilters = {
  campus: [],
  acpd: [],
  status: [],
  meetingDay: [], // No default filter - show all days
  circleType: [],
  eventSummary: 'all',
  connected: 'all',
  timeOfDay: 'all'
};

export const useDashboardFilters = () => {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [isInitialized, setIsInitialized] = useState(true); // Start initialized
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  // Load saved filters on mount
  useEffect(() => {
    try {
      const savedState = localStorage.getItem('radiusDashboardFilters');
      if (savedState) {
        const filterState = JSON.parse(savedState);
        const newFilters = {
          campus: filterState.campus || [],
          acpd: filterState.acpd || [],
          status: filterState.status || [],
          meetingDay: filterState.meetingDay || [],
          circleType: filterState.circleType || [],
          eventSummary: filterState.eventSummary || 'all',
          connected: filterState.connected || 'all',
          timeOfDay: filterState.timeOfDay || 'all'
        };
        setFilters(newFilters);
      } else {
        setIsFirstVisit(true);
      }
    } catch (error) {
      console.error('Error loading filter state:', error);
    }
  }, []);

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('radiusDashboardFilters', JSON.stringify(filters));
    }
  }, [filters]);

  const updateFilters = useCallback((newFilters: Partial<DashboardFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    // Once user selects filters, it's no longer first visit
    if (isFirstVisit) {
      setIsFirstVisit(false);
    }
  }, [isFirstVisit]);

  const clearAllFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  // Memoize the filters object to prevent unnecessary re-renders
  const memoizedFilters = useMemo(() => filters, [
    JSON.stringify(filters.campus),
    JSON.stringify(filters.acpd), 
    JSON.stringify(filters.status),
    JSON.stringify(filters.meetingDay),
    JSON.stringify(filters.circleType),
    filters.eventSummary,
    filters.connected,
    filters.timeOfDay
  ]);

  return { filters: memoizedFilters, updateFilters, clearAllFilters, isInitialized, isFirstVisit };
};
