import { useState, useEffect, useCallback } from 'react';

export interface DashboardFilters {
  search: string;
  campus: string[];
  acpd: string[];
  status: string[];
  meetingDay: string[];
  circleType: string[];
  eventSummary: string;
}

export const defaultFilters: DashboardFilters = {
  search: '',
  campus: [],
  acpd: [],
  status: [],
  meetingDay: [],
  circleType: [],
  eventSummary: 'all'
};

export const useDashboardFilters = () => {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);

  // Load saved filters from localStorage
  useEffect(() => {
    try {
      const savedState = localStorage.getItem('radiusDashboardFilters');
      if (savedState) {
        const filterState = JSON.parse(savedState);
        setFilters({
          search: filterState.search || '',
          campus: filterState.campus || [],
          acpd: filterState.acpd || [],
          status: filterState.status || [],
          meetingDay: filterState.meetingDay || [],
          circleType: filterState.circleType || [],
          eventSummary: filterState.eventSummary || 'all'
        });
      }
    } catch (error) {
      console.error('Error loading filter state:', error);
      setFilters(defaultFilters);
    }
  }, []);

  // Save filters to localStorage whenever they change
  useEffect(() => {
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
