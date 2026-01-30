"use client";
import { useMemo } from 'react';
import SearchFilterPanel from './SearchFilterPanel';

interface DashboardFilters {
  campus: string[];
  acpd?: string[];
  status?: string[];
  meetingDay: string[];
  circleType: string[];
  eventSummary?: string;
  connected?: string;
  timeOfDay: string;
  searchTerm?: string;
}

interface SearchFilters {
  campus: string;
  circleType: string;
  meetingDay: string[];
  timeOfDay: string;
  searchTerm: string;
}

interface SearchFilters {
  campus: string;
  circleType: string; 
  meetingDay: string[];  // Changed to array for multiselect
  timeOfDay: string;
  searchTerm: string;
}

interface DashboardFilterAdapterProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: Partial<DashboardFilters>) => void;
  onClearAllFilters: () => void;
  totalLeaders: number;
  allLeaders: Array<{
    campus?: string;
    circle_type?: string;
    day?: string;
    time?: string;
  }>;
  // Optional props that the old filter panel expected but we don't need
  onBulkUpdateStatus?: (status: string) => void;
  onResetCheckboxes?: () => void;
  receivedCount?: number;
  onAddNote?: (leaderId: number, name: string) => void;
  onClearFollowUp?: (leaderId: number, name: string) => void;
  refreshKey?: number;
  directors?: Array<{ id: number; name: string }>;
  campuses?: Array<{ id: number; value: string }>;
  statuses?: Array<{ id: number; value: string }>;
  circleTypes?: Array<{ id: number; value: string }>;
  frequencies?: Array<{ id: number; value: string }>;
}

export default function DashboardFilterAdapter({
  filters,
  onFiltersChange,
  onClearAllFilters,
  totalLeaders,
  allLeaders,
  // Ignore the optional props we don't use
  ...rest
}: DashboardFilterAdapterProps) {
  
  // Convert complex DashboardFilters to simple SearchFilters
  const searchFilters: SearchFilters = useMemo(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 [DashboardFilterAdapter] Converting dashboard filters to search filters:', filters);
    }
    
    // Ensure all array values are properly converted
    // Handle "all campuses" selection and clean up any problematic values
    let campus = '';
    if (Array.isArray(filters.campus)) {
      // Filter out any problematic values and get the first valid campus
      const validCampuses = filters.campus.filter(c => c && c !== '__ALL_CAMPUSES__');
      campus = validCampuses[0] || '';
      // If no valid campuses after filtering, it means "all" should be selected
      if (validCampuses.length === 0 && filters.campus.length > 0) {
        campus = 'all';
      }
    } else {
      campus = typeof filters.campus === 'string' ? filters.campus : '';
    }
    
    const circleType = Array.isArray(filters.circleType) ? (filters.circleType[0] || '') : 
                      (typeof filters.circleType === 'string' ? filters.circleType : '');
    // For meetingDay, preserve the array structure for multiselect
    const meetingDay = Array.isArray(filters.meetingDay) ? filters.meetingDay : 
                      (typeof filters.meetingDay === 'string' && filters.meetingDay ? [filters.meetingDay] : []);
    
    // Handle timeOfDay conversion - if it's a lowercase am/pm from dashboard, convert to uppercase for UI
    let timeOfDay = '';
    if (filters.timeOfDay && typeof filters.timeOfDay === 'string' && filters.timeOfDay !== 'all') {
      timeOfDay = filters.timeOfDay.toUpperCase();
    }
    
    const result = {
      campus,
      circleType,
      meetingDay,
      timeOfDay,
      searchTerm: filters.searchTerm || ''
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 [DashboardFilterAdapter] Converted to search filters:', result);
    }
    return result;
  }, [filters]);

  // Convert SearchFilters back to DashboardFilters format
  const handleFiltersChange = (newSearchFilters: SearchFilters) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 [DashboardFilterAdapter] Converting search filters to dashboard filters:', newSearchFilters);
    }
    
    // Handle campus selection - "all" means no campus filter applied
    let campusValue: string[] = [];
    if (newSearchFilters.campus && newSearchFilters.campus !== 'all') {
      campusValue = [newSearchFilters.campus];
    }
    // Clean up any old problematic values and ensure "all" means empty array
    campusValue = campusValue.filter(c => c && c !== 'all' && c !== '__ALL_CAMPUSES__');
    
    const dashboardFilters: Partial<DashboardFilters> = {
      campus: campusValue,
      circleType: newSearchFilters.circleType ? [newSearchFilters.circleType] : [],
      meetingDay: newSearchFilters.meetingDay || [],
      // Convert UI uppercase (AM/PM) back to lowercase for dashboard filtering logic, or 'all' if empty
      timeOfDay: newSearchFilters.timeOfDay ? newSearchFilters.timeOfDay.toLowerCase() : 'all',
      searchTerm: newSearchFilters.searchTerm
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 [DashboardFilterAdapter] Converted to dashboard filters:', dashboardFilters);
    }
    
    onFiltersChange(dashboardFilters);
  };

  return (
    <SearchFilterPanel
      filters={searchFilters}
      onFiltersChange={handleFiltersChange}
      onClearAllFilters={onClearAllFilters}
      totalLeaders={totalLeaders}
      allLeaders={allLeaders}
    />
  );
}
