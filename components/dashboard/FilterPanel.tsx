'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import ConfirmModal from '../ui/ConfirmModal';
import FollowUpDateModal from './FollowUpDateModal';

// Constants
const MEETING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

const ORDERED_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'follow-up', label: 'Follow Up' },
  { value: 'invited', label: 'Invited' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'paused', label: 'Paused' },
  { value: 'off-boarding', label: 'Off Boarding' }
] as const;

const STATUS_OPTIONS = [
  { value: 'invited', label: 'Invited', color: 'text-blue-700' },
  { value: 'pipeline', label: 'Pipeline', color: 'text-indigo-700' },
  { value: 'active', label: 'Active', color: 'text-green-700' },
  { value: 'paused', label: 'Paused', color: 'text-yellow-700' },
  { value: 'off-boarding', label: 'Off-boarding', color: 'text-red-700' },
  { value: 'follow-up', label: 'Follow Up', color: 'text-orange-700' }
] as const;

const STATUS_MAP = {
  'active': { label: 'Active', color: 'text-green-600 dark:text-green-400' },
  'paused': { label: 'Paused', color: 'text-yellow-600 dark:text-yellow-400' },
  'off-boarding': { label: 'Off Boarding', color: 'text-red-600 dark:text-red-400' },
  'invited': { label: 'Invited', color: 'text-blue-600 dark:text-blue-400' },
  'pipeline': { label: 'Pipeline', color: 'text-indigo-600 dark:text-indigo-400' },
  'follow-up': { label: 'Follow Up', color: 'text-orange-600 dark:text-orange-400' }
} as const;

const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Utility Functions
const formatDate = (date: Date | string): string => {
  try {
    if (typeof date === 'string') {
      if (!DATE_FORMAT_REGEX.test(date)) {
        console.warn('Invalid date format:', date);
        return date;
      }
      return date;
    }
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }
    console.warn('Invalid date type:', typeof date);
    return '';
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

const parseLocalDate = (dateString: string): Date | null => {
  try {
    if (!dateString || !DATE_FORMAT_REGEX.test(dateString)) {
      console.warn('Invalid date string format:', dateString);
      return null;
    }
    const [year, month, day] = dateString.split('-').map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      console.warn('Invalid date components:', { year, month, day });
      return null;
    }
    return new Date(year, month - 1, day);
  } catch (error) {
    console.error('Error parsing date:', error);
    return null;
  }
};

const isDateOverdue = (dateString: string): boolean => {
  try {
    const parsedDate = parseLocalDate(dateString);
    if (!parsedDate) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsedDate.setHours(0, 0, 0, 0);
    
    return parsedDate < today;
  } catch (error) {
    console.error('Error checking if date is overdue:', error);
    return false;
  }
};

const validateUserInput = (value: any, type: 'string' | 'number' | 'array' = 'string'): boolean => {
  if (value === null || value === undefined) return false;
  
  switch (type) {
    case 'string':
      return typeof value === 'string' && value.trim().length > 0;
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'array':
      return Array.isArray(value);
    default:
      return false;
  }
};

// Type Definitions
interface SettingsItem {
  id: number;
  value: string;
}

interface FollowUpLeader {
  id: number;
  name: string;
  campus: string;
  status: string;
  follow_up_date: string | null;
  last_note: {
    content: string;
    created_at: string;
  } | null;
}

/**
 * FilterPanel component for managing circle leader filters and bulk operations
 * Handles filtering by campus, status, meeting day, and provides follow-up management
 */
interface FilterPanelProps {
  filters: {
    campus: string[];
    acpd: string[];
    status: string[];
    meetingDay: string[];
    circleType: string[];
    eventSummary: string;
    connected: string;
  };
  onFiltersChange: (filters: any) => void;
  onClearAllFilters: () => void;
  onBulkUpdateStatus: (status: string) => void;
  onResetCheckboxes: () => void;
  totalLeaders: number;
  receivedCount: number;
}

export default function FilterPanel({
  filters,
  onFiltersChange,
  onClearAllFilters,
  onBulkUpdateStatus,
  onResetCheckboxes,
  totalLeaders,
  receivedCount
}: FilterPanelProps) {
  // Core Component State
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  // Follow-up Table State
  const [followUpTableVisible, setFollowUpTableVisible] = useState(true);
  const [followUpLeaders, setFollowUpLeaders] = useState<FollowUpLeader[]>([]);
  const [isLoadingFollowUp, setIsLoadingFollowUp] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'follow_up_date' | 'last_note_date'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Modal State
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [selectedLeader, setSelectedLeader] = useState<FollowUpLeader | null>(null);
  
  const router = useRouter();
  
  // Reference data state
  const [campuses, setCampuses] = useState<SettingsItem[]>([]);
  const [directors, setDirectors] = useState<SettingsItem[]>([]);
  const [statuses, setStatuses] = useState<SettingsItem[]>([]);
  const [circleTypes, setCircleTypes] = useState<SettingsItem[]>([]);
  const [frequencies, setFrequencies] = useState<SettingsItem[]>([]);
  
  // Bulk actions state
  const [showBulkDropdown, setShowBulkDropdown] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<{value: string, label: string} | null>(null);
  const bulkDropdownRef = useRef<HTMLDivElement>(null);

  // Load reference data from database
  const loadReferenceData = async () => {
    try {
      // Load each table individually with error handling
      const directorsResult = await supabase.from('acpd_list').select('*').eq('active', true).order('name');
      
      const campusesResult = await supabase.from('campuses').select('*').order('value');
      
      const statusesResult = await supabase.from('statuses').select('*').order('value');
      
      const circleTypesResult = await supabase.from('circle_types').select('*').order('value');
      
      const frequenciesResult = await supabase.from('frequencies').select('*').order('value');

      if (directorsResult.data) {
        const formattedDirectors = directorsResult.data.map(director => ({
          id: director.id,
          value: director.name
        }));
        setDirectors(formattedDirectors);
      }
      
      if (campusesResult.data) setCampuses(campusesResult.data);
      if (statusesResult.data) setStatuses(statusesResult.data);
      if (circleTypesResult.data) setCircleTypes(circleTypesResult.data);
      if (frequenciesResult.data) setFrequencies(frequenciesResult.data);
      
    } catch (error) {
      console.error('FilterPanel: Error loading reference data:', error);
    } finally {
      setIsLoadingData(false);
    }
  };

  // Load follow-up leaders based on selected campus with validation
  const loadFollowUpLeaders = useCallback(async () => {
    if (!filters.campus || filters.campus.length === 0) {
      setFollowUpLeaders([]);
      return;
    }

    // Validate campus inputs
    const validCampuses = filters.campus.filter(campus => 
      typeof campus === 'string' && campus.trim().length > 0
    );
    
    if (validCampuses.length === 0) {
      setFollowUpLeaders([]);
      return;
    }

    setIsLoadingFollowUp(true);
    try {
      // Load circle leaders with follow-up status from selected campuses
      const { data: leaders, error: leadersError } = await supabase
        .from('circle_leaders')
        .select('id, name, campus, status, follow_up_date')
        .eq('follow_up_required', true)
        .in('campus', validCampuses)
        .order('name');

      if (leadersError) {
        console.error('Error loading follow-up leaders:', leadersError);
        setFollowUpLeaders([]);
        return;
      }

      if (!leaders || leaders.length === 0) {
        setFollowUpLeaders([]);
        return;
      }

      // Validate leader IDs before querying notes
      const validLeaderIds = leaders
        .filter(leader => leader.id && typeof leader.id === 'number')
        .map(leader => leader.id);

      if (validLeaderIds.length === 0) {
        setFollowUpLeaders(leaders.map(leader => ({
          ...leader,
          last_note: null
        })));
        return;
      }

      // Get the latest note for each leader
      const { data: notes, error: notesError } = await supabase
        .from('notes')
        .select('circle_leader_id, content, created_at')
        .in('circle_leader_id', validLeaderIds)
        .order('created_at', { ascending: false });

      if (notesError) {
        console.error('Error loading notes for follow-up leaders:', notesError);
      }

      // Combine leaders with their latest notes
      const leadersWithNotes = leaders.map(leader => {
        const latestNote = notes?.find(note => note.circle_leader_id === leader.id) || null;
        return {
          id: leader.id,
          name: leader.name || 'Unknown',
          campus: leader.campus || 'Unknown',
          status: leader.status || 'unknown',
          follow_up_date: leader.follow_up_date,
          last_note: latestNote ? {
            content: latestNote.content || '',
            created_at: latestNote.created_at
          } : null
        };
      });

      setFollowUpLeaders(leadersWithNotes);
    } catch (error) {
      console.error('Error loading follow-up data:', error);
      setFollowUpLeaders([]);
    } finally {
      setIsLoadingFollowUp(false);
    }
  }, [filters.campus]);

  useEffect(() => {
    loadReferenceData();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('filtersVisible');
    setFiltersVisible(saved !== 'false');
  }, []);

  useEffect(() => {
    const savedFollowUp = localStorage.getItem('followUpTableVisible');
    setFollowUpTableVisible(savedFollowUp !== 'false');
  }, []);

  // Load follow-up data when campus filter changes
  useEffect(() => {
    loadFollowUpLeaders();
  }, [filters.campus]); // Added missing dependency

  // Close bulk dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bulkDropdownRef.current && !bulkDropdownRef.current.contains(event.target as Node)) {
        setShowBulkDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleFilters = () => {
    const newVisible = !filtersVisible;
    setFiltersVisible(newVisible);
    localStorage.setItem('filtersVisible', newVisible.toString());
  };

  const toggleFollowUpTable = () => {
    const newVisible = !followUpTableVisible;
    setFollowUpTableVisible(newVisible);
    localStorage.setItem('followUpTableVisible', newVisible.toString());
  };

  // Sorting functions
  const handleSort = (field: 'name' | 'follow_up_date' | 'last_note_date') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedFollowUpLeaders = useMemo(() => {
    return [...followUpLeaders].sort((a, b) => {
      let aValue: string | Date | null = null;
      let bValue: string | Date | null = null;

      switch (sortField) {
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'follow_up_date':
          aValue = a.follow_up_date ? new Date(a.follow_up_date) : null;
          bValue = b.follow_up_date ? new Date(b.follow_up_date) : null;
          break;
        case 'last_note_date':
          aValue = a.last_note?.created_at ? new Date(a.last_note.created_at) : null;
          bValue = b.last_note?.created_at ? new Date(b.last_note.created_at) : null;
          break;
      }

      // Handle null values
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return sortDirection === 'asc' ? 1 : -1;
      if (bValue === null) return sortDirection === 'asc' ? -1 : 1;

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [followUpLeaders, sortField, sortDirection]);

  // Display formatter for dates - handles local timezone display
  const formatDateDisplay = useCallback((dateString: string | null) => {
    if (!dateString) return 'No date set';
    
    try {
      // Parse the date as a local date to avoid timezone issues
      const dateParts = dateString.split('T')[0]; // Remove time part if present
      const [year, month, day] = dateParts.split('-').map(num => parseInt(num, 10));
      
      // Validate date components
      if (!year || !month || !day || year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
        return 'Invalid date';
      }
      
      const localDate = new Date(year, month - 1, day); // month is 0-indexed
      
      return localDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date for display:', error);
      return 'Invalid date';
    }
  }, []);

  // Enhanced date overdue checker using utility functions
  const isFollowUpDateOverdue = useCallback((dateString: string | null) => {
    if (!dateString) return false;
    return isDateOverdue(dateString);
  }, []);

  // Status formatter using constants
  const getStatusInfo = useCallback((status: string) => {
    return STATUS_MAP[status as keyof typeof STATUS_MAP] || { 
      label: status.charAt(0).toUpperCase() + status.slice(1), 
      color: 'text-gray-600 dark:text-gray-400' 
    };
  }, []);

  // Navigation handler with validation
  const handleLeaderClick = useCallback((leaderId: number) => {
    if (!validateUserInput(leaderId, 'number') || leaderId <= 0) {
      console.error('Invalid leader ID');
      return;
    }
    router.push(`/circle/${leaderId}`);
  }, [router]);

  // Follow-up date handlers with validation
  const handleFollowUpDateClick = useCallback((leader: FollowUpLeader) => {
    if (!leader || !leader.id) {
      console.error('Invalid leader data');
      return;
    }
    setSelectedLeader(leader);
    setShowFollowUpModal(true);
  }, []);

  const handleFollowUpDateSave = useCallback(async (date: string | null) => {
    if (!selectedLeader?.id) {
      console.error('No leader selected for follow-up date update');
      return;
    }

    // Validate date format if provided
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      console.error('Invalid date format');
      return;
    }

    try {
      const { error } = await supabase
        .from('circle_leaders')
        .update({ 
          follow_up_date: date,
          follow_up_required: date !== null
        })
        .eq('id', selectedLeader.id);

      if (error) {
        console.error('Error updating follow-up date:', error);
        return;
      }

      // Update local state
      setFollowUpLeaders(prev => prev.map(leader => 
        leader.id === selectedLeader.id 
          ? { ...leader, follow_up_date: date }
          : leader
      ));

      setShowFollowUpModal(false);
      setSelectedLeader(null);
    } catch (error) {
      console.error('Error updating follow-up date:', error);
    }
  }, [selectedLeader]);

  const handleFollowUpDateSaveWrapper = (date: string) => {
    handleFollowUpDateSave(date);
  };

  const handleFollowUpModalClose = () => {
    setShowFollowUpModal(false);
    setSelectedLeader(null);
  };

  const handleFilterChange = useCallback((key: string, value: any) => {
    if (!key || typeof key !== 'string') {
      console.error('Invalid filter key');
      return;
    }
    
    onFiltersChange({
      ...filters,
      [key]: value
    });
  }, [filters, onFiltersChange]);

  const handleMultiSelectChange = useCallback((key: string, selectElement: HTMLSelectElement | null) => {
    if (!selectElement || !key) {
      console.error('Invalid parameters for multi-select change');
      return;
    }
    
    try {
      const selectedValues = Array.from(selectElement.selectedOptions)
        .map(option => option.value)
        .filter(value => typeof value === 'string' && value.trim().length > 0);
      
      handleFilterChange(key, selectedValues);
    } catch (error) {
      console.error('Error handling multi-select change:', error);
    }
  }, [handleFilterChange]);

  /**
   * Removes a specific value from a filter
   * @param filterKey - The filter key to modify
   * @param valueToRemove - The value to remove from the filter
   */
  const removeFilterValue = (filterKey: string, valueToRemove: string) => {
    if (filterKey === 'eventSummary' || filterKey === 'connected') {
      handleFilterChange(filterKey, 'all');
    } else {
      const currentValues = filters[filterKey as keyof typeof filters] as string[];
      const newValues = currentValues.filter(value => value !== valueToRemove);
      handleFilterChange(filterKey, newValues);
    }
  };

  // Bulk status update actions using constants
  const statusOptions = STATUS_OPTIONS;

  const handleStatusSelect = (status: string, label: string) => {
    setPendingStatus({ value: status, label });
    setShowConfirmModal(true);
    setShowBulkDropdown(false);
  };

  const handleConfirmUpdate = () => {
    if (pendingStatus) {
      onBulkUpdateStatus(pendingStatus.value);
    }
    setShowConfirmModal(false);
    setPendingStatus(null);
  };

  const handleCancelUpdate = () => {
    setShowConfirmModal(false);
    setPendingStatus(null);
  };

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return filters.campus.length > 0 ||
           filters.acpd.length > 0 ||
           filters.status.length > 0 ||
           filters.meetingDay.length > 0 ||
           filters.circleType.length > 0 ||
           filters.eventSummary !== 'all' ||
           filters.connected !== 'all';
  }, [filters]);

  /**
   * Calculates the progress percentage for filtered results
   * @returns Progress percentage as a number between 0 and 100
   */
  const progressPercentage = useMemo(() => {
    if (totalLeaders === 0) return 0;
    return Math.round((receivedCount / totalLeaders) * 100);
  }, [receivedCount, totalLeaders]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-md flex items-center justify-center mr-3">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd"></path>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Filters</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Search & Sort</p>
            </div>
          </div>
          
          <div className="flex items-center">
            <button
              onClick={toggleFilters}
              className="flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 focus:outline-none"
            >
              <span>{filtersVisible ? 'Hide Filters' : 'Edit Filters'}</span>
              <svg 
                className={`w-4 h-4 ml-2 transform transition-transform ${filtersVisible ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {filtersVisible && (
        <div className="p-4 sm:p-6">
          {isLoadingData ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-2"></div>
                  <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 sm:gap-6">
              {/* Campus Filter */}
              <div className="space-y-2">
                <label htmlFor="campusFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Campus</label>
                <select 
                  id="campusFilter" 
                  multiple 
                  value={filters.campus}
                  onChange={(e) => handleMultiSelectChange('campus', e.target)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-32 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 dark:[&::-webkit-scrollbar-track]:bg-gray-600 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-500 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent"
                >
                  {campuses.map(campus => (
                    <option key={campus.id} value={campus.value}>{campus.value}</option>
                  ))}
                </select>
              </div>

              {/* ACPD Filter */}
              <div className="space-y-2">
                <label htmlFor="acpdFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">ACPD</label>
                <select 
                  id="acpdFilter" 
                  multiple 
                  value={filters.acpd}
                  onChange={(e) => handleMultiSelectChange('acpd', e.target)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-32 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 dark:[&::-webkit-scrollbar-track]:bg-gray-600 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-500 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent"
                >
                  {directors.map(director => (
                    <option key={director.id} value={director.value}>{director.value}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <select 
                  id="statusFilter" 
                  multiple 
                  value={filters.status}
                  onChange={(e) => handleMultiSelectChange('status', e.target)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-32 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 dark:[&::-webkit-scrollbar-track]:bg-gray-600 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-500 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent"
                >
                  {ORDERED_STATUSES.map(status => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </div>

              {/* Meeting Day Filter */}
              <div className="space-y-2">
                <label htmlFor="meetingDayFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Meeting Day</label>
                <select 
                  id="meetingDayFilter" 
                  multiple 
                  value={filters.meetingDay}
                  onChange={(e) => handleMultiSelectChange('meetingDay', e.target)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-32 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 dark:[&::-webkit-scrollbar-track]:bg-gray-600 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-500 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent"
                >
                  {MEETING_DAYS.map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>

              {/* Circle Type Filter */}
              <div className="space-y-2">
                <label htmlFor="circleTypeFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Circle Type</label>
                <select 
                  id="circleTypeFilter" 
                  multiple 
                  value={filters.circleType}
                  onChange={(e) => handleMultiSelectChange('circleType', e.target)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-32 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 dark:[&::-webkit-scrollbar-track]:bg-gray-600 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-500 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent"
                >
                  {circleTypes.map(type => (
                    <option key={type.id} value={type.value}>{type.value}</option>
                  ))}
                </select>
              </div>

              {/* Event Summary & Connected Filters - Stacked */}
              <div className="space-y-2">
                <div className="space-y-2">
                  <label htmlFor="eventSummaryFilter" className="block text-xs font-medium text-gray-700 dark:text-gray-300">Event Summary</label>
                  <select 
                    id="eventSummaryFilter"
                    value={filters.eventSummary}
                    onChange={(e) => handleFilterChange('eventSummary', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-8"
                  >
                    <option value="all">All</option>
                    <option value="received">Received</option>
                    <option value="not_received">Not Received</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="connectedFilter" className="block text-xs font-medium text-gray-700 dark:text-gray-300">Connected</label>
                  <select 
                    id="connectedFilter"
                    value={filters.connected}
                    onChange={(e) => handleFilterChange('connected', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-8"
                  >
                    <option value="all">All</option>
                    <option value="connected">Connected</option>
                    <option value="not_connected">Not Connected</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active Filters:</span>
                <button
                  onClick={onClearAllFilters}
                  className="flex items-center px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 focus:outline-none bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-colors"
                  title="Clear all active filters"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                  Clear All
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Campus Tags */}
                {filters.campus.map(campus => (
                  <button
                    key={`campus-${campus}`}
                    onClick={() => removeFilterValue('campus', campus)}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    Campus: {campus}
                    <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ))}

                {/* ACPD Tags */}
                {filters.acpd.map(acpd => (
                  <button
                    key={`acpd-${acpd}`}
                    onClick={() => removeFilterValue('acpd', acpd)}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/30 transition-colors"
                  >
                    ACPD: {acpd}
                    <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ))}

                {/* Status Tags */}
                {filters.status.map(status => {
                  const statusObj = ORDERED_STATUSES.find(s => s.value === status);
                  const displayLabel = statusObj ? statusObj.label : status.charAt(0).toUpperCase() + status.slice(1);
                  
                  return (
                    <button
                      key={`status-${status}`}
                      onClick={() => removeFilterValue('status', status)}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/30 transition-colors"
                    >
                      Status: {displayLabel}
                      <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  );
                })}

                {/* Meeting Day Tags */}
                {filters.meetingDay.map(day => (
                  <button
                    key={`day-${day}`}
                    onClick={() => removeFilterValue('meetingDay', day)}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/30 transition-colors"
                  >
                    Day: {day}
                    <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ))}

                {/* Circle Type Tags */}
                {filters.circleType.map(type => (
                  <button
                    key={`type-${type}`}
                    onClick={() => removeFilterValue('circleType', type)}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900/30 transition-colors"
                  >
                    Type: {type}
                    <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ))}

                {/* Event Summary Tag */}
                {filters.eventSummary !== 'all' && (
                  <button
                    onClick={() => removeFilterValue('eventSummary', '')}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/30 transition-colors"
                  >
                    Event Summary: {filters.eventSummary === 'received' ? 'Received' : 'Not Received'}
                    <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}

                {/* Connected Tag */}
                {filters.connected !== 'all' && (
                  <button
                    onClick={() => removeFilterValue('connected', '')}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/20 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-900/30 transition-colors"
                  >
                    Connected: {filters.connected === 'connected' ? 'This Month' : 'Not This Month'}
                    <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Actions Section */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              
              {/* Bulk Status Update */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Bulk Actions:</span>
                <div className="relative" ref={bulkDropdownRef}>
                  <button
                    onClick={() => setShowBulkDropdown(!showBulkDropdown)}
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors w-full sm:w-auto"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                    </svg>
                    Update Status ({totalLeaders})
                    <svg className="w-4 h-4 ml-auto sm:ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                  </button>

                  {showBulkDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-full sm:w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg z-50">
                      {statusOptions.map((status) => (
                        <button
                          key={status.value}
                          onClick={() => handleStatusSelect(status.value, status.label)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-md last:rounded-b-md ${status.color} dark:text-gray-300`}
                        >
                          {status.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && pendingStatus && (
        <ConfirmModal
          isOpen={showConfirmModal}
          onClose={handleCancelUpdate}
          onConfirm={handleConfirmUpdate}
          title="Confirm Bulk Status Update"
          message={`Are you sure you want to update the status of all ${totalLeaders} Circle Leaders to "${pendingStatus.label}"?`}
          confirmText="Update All"
          cancelText="Cancel"
        />
      )}

      {/* Follow Up Table */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900 rounded-md flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Follow Up Required</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {filters.campus.length > 0 
                    ? `Circle leaders requiring follow-up in ${filters.campus.join(', ')}`
                    : 'Select a campus to view follow-up leaders'
                  }
                </p>
              </div>
            </div>
            <button
              onClick={toggleFollowUpTable}
              className="flex items-center px-3 py-2 text-sm font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 focus:outline-none"
            >
              <span>{followUpTableVisible ? 'Hide Table' : 'Show Table'}</span>
              <svg 
                className={`w-4 h-4 ml-2 transform transition-transform ${followUpTableVisible ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>
          </div>
        </div>

        {followUpTableVisible && (
          <div className="p-6">
            {filters.campus.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-400 dark:text-gray-500 mb-2">
                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400">Select a campus in the filters above to view follow-up leaders</p>
              </div>
            ) : isLoadingFollowUp ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                <span className="ml-2 text-gray-600 dark:text-gray-400">Loading follow-up data...</span>
              </div>
            ) : followUpLeaders.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-green-400 dark:text-green-500 mb-2">
                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400">No follow-up required for leaders in selected campus(es)</p>
              </div>
            ) : (
              <div className="overflow-hidden border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th 
                          onClick={() => handleSort('name')}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        >
                          <div className="flex items-center">
                            Circle Leader
                            <svg className="w-3 h-3 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                            </svg>
                            {sortField === 'name' && (
                              <svg 
                                className={`w-4 h-4 ml-1 transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                              </svg>
                            )}
                          </div>
                        </th>
                        <th 
                          onClick={() => handleSort('follow_up_date')}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        >
                          <div className="flex items-center">
                            Follow Up Date
                            <svg className="w-3 h-3 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                            </svg>
                            {sortField === 'follow_up_date' && (
                              <svg 
                                className={`w-4 h-4 ml-1 transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                              </svg>
                            )}
                          </div>
                        </th>
                        <th 
                          onClick={() => handleSort('last_note_date')}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        >
                          <div className="flex items-center">
                            Last Note
                            {sortField === 'last_note_date' && (
                              <svg 
                                className={`w-4 h-4 ml-1 transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                              </svg>
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                      {sortedFollowUpLeaders.map((leader) => (
                        <tr key={leader.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <button
                                onClick={() => handleLeaderClick(leader.id)}
                                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline focus:outline-none focus:underline"
                              >
                                {leader.name}
                              </button>
                              <div className={`text-sm ${getStatusInfo(leader.status).color}`}>
                                {getStatusInfo(leader.status).label}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={() => handleFollowUpDateClick(leader)}
                              className="text-left focus:outline-none hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded px-2 py-1 -mx-2 -my-1 transition-colors group"
                              title="Click to edit follow-up date"
                            >
                              <div className="flex items-center">
                                <div>
                                  <div className="text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                    {formatDateDisplay(leader.follow_up_date)}
                                  </div>
                                  {leader.follow_up_date && (
                                    <div className={`text-xs ${
                                      isFollowUpDateOverdue(leader.follow_up_date)
                                        ? 'text-red-500 dark:text-red-400' 
                                        : 'text-green-500 dark:text-green-400'
                                    }`}>
                                      {isFollowUpDateOverdue(leader.follow_up_date) ? 'Overdue' : 'Upcoming'}
                                    </div>
                                  )}
                                </div>
                                <svg className="w-4 h-4 ml-2 text-gray-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                                </svg>
                              </div>
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            {leader.last_note ? (
                              <div>
                                <div className="text-sm text-gray-900 dark:text-white mb-1 line-clamp-2">
                                  {leader.last_note.content.length > 100 
                                    ? `${leader.last_note.content.substring(0, 100)}...`
                                    : leader.last_note.content
                                  }
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatDateDisplay(leader.last_note.created_at)}
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400 dark:text-gray-500 italic">
                                No notes available
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
                            )}
          </div>
        )}
      </div>

      {/* Follow Up Date Modal */}
      {showFollowUpModal && selectedLeader && (
        <FollowUpDateModal
          isOpen={showFollowUpModal}
          onClose={handleFollowUpModalClose}
          onConfirm={handleFollowUpDateSaveWrapper}
          leaderName={selectedLeader.name}
          existingDate={selectedLeader.follow_up_date || undefined}
          isEditing={true}
        />
      )}
    </div>
  );
}