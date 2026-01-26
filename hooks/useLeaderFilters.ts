import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export interface LeaderFilters {
  campus: string[];
  acpd: string[];
  status: string[];
  meetingDay: string[];
  circleType: string[];
  frequency: string[];
  eventSummary: string;
  connected: string;
  timeOfDay: string;
}

export const defaultLeaderFilters: LeaderFilters = {
  campus: [],
  acpd: [],
  status: [],
  meetingDay: [],
  circleType: [],
  frequency: [],
  eventSummary: 'all',
  connected: 'all',
  timeOfDay: 'all'
};

type UseLeaderFiltersOptions = {
  basePath?: string;
  storageKey?: string;
};

export const useLeaderFilters = (options: UseLeaderFiltersOptions = {}) => {
  const basePath = options.basePath ?? '/leaders';
  const storageKey = options.storageKey ?? 'radiusLeaderFilters';
  const [filters, setFilters] = useState<LeaderFilters>(defaultLeaderFilters);
  const [isInitialized, setIsInitialized] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialize filters from URL parameters first, then localStorage
  useEffect(() => {
    try {
      let initialFilters = { ...defaultLeaderFilters };
      let hasUrlParams = false;

      // Parse URL parameters
      if (searchParams) {
        const urlCampus = searchParams.getAll('campus').filter(c => c && c !== '__ALL_CAMPUSES__');
        const urlAcpd = searchParams.getAll('acpd');
        const urlStatus = searchParams.getAll('status');
        const urlMeetingDay = searchParams.getAll('meetingDay');
        const urlCircleType = searchParams.getAll('circleType');
        const urlFrequency = searchParams.getAll('frequency');
        const urlEventSummary = searchParams.get('eventSummary');
        const urlConnected = searchParams.get('connected');
        const urlTimeOfDay = searchParams.get('timeOfDay');

        if (urlCampus.length > 0 || urlAcpd.length > 0 || urlStatus.length > 0 || 
            urlMeetingDay.length > 0 || urlCircleType.length > 0 || urlFrequency.length > 0 ||
            urlEventSummary || urlConnected || urlTimeOfDay) {
          hasUrlParams = true;
          
          initialFilters = {
            campus: urlCampus,
            acpd: urlAcpd,
            status: urlStatus,
            meetingDay: urlMeetingDay,
            circleType: urlCircleType,
            frequency: urlFrequency,
            eventSummary: urlEventSummary || 'all',
            connected: urlConnected || 'all',
            timeOfDay: urlTimeOfDay || 'all'
          };
          
          console.log('📄 [useLeaderFilters] Loaded filters from URL:', initialFilters);
        }
      }

      // If no URL params, try localStorage
      if (!hasUrlParams) {
        const savedState = localStorage.getItem(storageKey);
        if (savedState) {
          console.log('📂 [useLeaderFilters] Loading saved filters from localStorage:', savedState);
          const filterState = JSON.parse(savedState);
          initialFilters = {
            campus: (filterState.campus || []).filter((c: string) => c && c !== '__ALL_CAMPUSES__'),
            acpd: filterState.acpd || [],
            status: filterState.status || [],
            meetingDay: filterState.meetingDay || [],
            circleType: filterState.circleType || [],
            frequency: filterState.frequency || [],
            eventSummary: filterState.eventSummary || 'all',
            connected: filterState.connected || 'all',
            timeOfDay: filterState.timeOfDay || 'all'
          };
          console.log('📂 [useLeaderFilters] Parsed and cleaned filters:', initialFilters);
        }
      }

      setFilters(initialFilters);
      setIsInitialized(true);
      console.log('🚀 [useLeaderFilters] Initialization complete');
    } catch (error) {
      console.error('Error loading filter state:', error);
      setFilters(defaultLeaderFilters);
      setIsInitialized(true);
    }
  }, [searchParams]);

  // Save filters to localStorage whenever they change (but not URL params)
  useEffect(() => {
    if (typeof window !== 'undefined' && isInitialized) {
      console.log('💾 [useLeaderFilters] Saving filters to localStorage:', filters);
      try {
        localStorage.setItem(storageKey, JSON.stringify(filters));
        console.log('✅ [useLeaderFilters] Successfully saved to localStorage');
      } catch (error) {
        console.error('❌ [useLeaderFilters] Failed to save to localStorage:', error);
      }
    }
  }, [filters, isInitialized, storageKey]);

  const updateFilters = useCallback((newFilters: Partial<LeaderFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters(defaultLeaderFilters);
    // Clear URL parameters
    router.push(basePath);
  }, [router, basePath]);

  // Memoize the filters object to prevent unnecessary re-renders
  const memoizedFilters = useMemo(() => filters, [
    JSON.stringify(filters.campus),
    JSON.stringify(filters.acpd), 
    JSON.stringify(filters.status),
    JSON.stringify(filters.meetingDay),
    JSON.stringify(filters.circleType),
    JSON.stringify(filters.frequency),
    filters.eventSummary,
    filters.connected,
    filters.timeOfDay
  ]);

  return { 
    filters: memoizedFilters, 
    updateFilters, 
    clearAllFilters, 
    isInitialized 
  };
};
