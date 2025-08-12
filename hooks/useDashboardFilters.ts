import { useState, useEffect, useCallback } from 'react';

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

export const defaultFilters: DashboardFilters = {
  campus: [],
  acpd: [],
  status: [],
  meetingDay: [],
  circleType: [],
  eventSummary: 'all',
  connected: 'all',
  timeOfDay: 'all'
};

export const useDashboardFilters = () => {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [isClient, setIsClient] = useState(false);

  // Set client flag after hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Load saved filters from localStorage only on client
  useEffect(() => {
    if (!isClient) return; // Skip during SSR
    
    try {
      const savedState = localStorage.getItem('radiusDashboardFilters');
      if (savedState) {
        const filterState = JSON.parse(savedState);
        setFilters({
          campus: filterState.campus || [],
          acpd: filterState.acpd || [],
          status: filterState.status || [],
          meetingDay: filterState.meetingDay || [],
          circleType: filterState.circleType || [],
          eventSummary: filterState.eventSummary || 'all',
          connected: filterState.connected || 'all',
          timeOfDay: filterState.timeOfDay || 'all'
        });
      }
    } catch (error) {
      console.error('Error loading filter state:', error);
      setFilters(defaultFilters);
    }
  }, [isClient]);

  // Save filters to localStorage whenever they change (only on client)
  useEffect(() => {
    if (!isClient) return; // Skip during SSR
    localStorage.setItem('radiusDashboardFilters', JSON.stringify(filters));
  }, [filters]);

  const updateFilters = useCallback((newFilters: Partial<DashboardFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  return { filters, updateFilters, clearAllFilters };
};
