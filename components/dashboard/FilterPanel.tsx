'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import ConfirmModal from '../ui/ConfirmModal';

interface SettingsItem {
  id: number;
  value: string;
}

interface FilterPanelProps {
  filters: {
    search: string;
    campus: string[];
    acpd: string[];
    status: string[];
    meetingDay: string[];
    circleType: string[];
    eventSummary: string;
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
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
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
      const [directorsResult, campusesResult, statusesResult, circleTypesResult, frequenciesResult] = await Promise.all([
        supabase.from('acpd_list').select('*').eq('active', true).order('name'),
        supabase.from('campuses').select('*').order('value'),
        supabase.from('statuses').select('*').order('value'),
        supabase.from('circle_types').select('*').order('value'),
        supabase.from('frequencies').select('*').order('value')
      ]);

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
      console.error('Error loading reference data:', error);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    loadReferenceData();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('filtersVisible');
    setFiltersVisible(saved !== 'false');
  }, []);

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

  const handleFilterChange = (key: string, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  const handleMultiSelectChange = (key: string, selectElement: HTMLSelectElement) => {
    const selectedValues = Array.from(selectElement.selectedOptions).map(option => option.value);
    handleFilterChange(key, selectedValues);
  };

  // Check if any filters are active
  const hasActiveFilters = () => {
    return filters.search.trim() !== '' ||
           filters.campus.length > 0 ||
           filters.acpd.length > 0 ||
           filters.status.length > 0 ||
           filters.meetingDay.length > 0 ||
           filters.circleType.length > 0 ||
           filters.eventSummary !== 'all';
  };

  // Bulk actions handlers
  const statusOptions = [
    { value: 'invited', label: 'Invited', color: 'text-blue-700' },
    { value: 'pipeline', label: 'Pipeline', color: 'text-indigo-700' },
    { value: 'follow-up', label: 'Follow Up', color: 'text-orange-700' },
    { value: 'active', label: 'Active', color: 'text-green-700' },
    { value: 'paused', label: 'Paused', color: 'text-yellow-700' },
    { value: 'off-boarding', label: 'Off-boarding', color: 'text-red-700' }
  ];

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

  // Calculate progress percentage
  const progressPercentage = totalLeaders > 0 ? Math.round((receivedCount / totalLeaders) * 100) : 0;

  // Meeting days array
  const meetingDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
              <p className="text-sm text-gray-500 dark:text-gray-400">Search & SortCircle Leaders</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {hasActiveFilters() && (
              <button
                onClick={onClearAllFilters}
                className="flex items-center px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 focus:outline-none bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-md transition-colors"
                title="Clear all active filters"
              >
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
                Clear All
              </button>
            )}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-1"></div>
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
              {/* Search */}
              <div className="sm:col-span-2 xl:col-span-2">
                <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search</label>
                <input 
                  type="text" 
                  id="search" 
                  placeholder="Search by name..." 
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Campus Filter */}
              <div>
                <label htmlFor="campusFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Campus</label>
                <select 
                  id="campusFilter" 
                  multiple 
                  value={filters.campus}
                  onChange={(e) => handleMultiSelectChange('campus', e.target)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {campuses.map(campus => (
                    <option key={campus.id} value={campus.value}>{campus.value}</option>
                  ))}
                </select>
              </div>

              {/* ACPD Filter */}
              <div>
                <label htmlFor="acpdFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ACPD</label>
                <select 
                  id="acpdFilter" 
                  multiple 
                  value={filters.acpd}
                  onChange={(e) => handleMultiSelectChange('acpd', e.target)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {directors.map(director => (
                    <option key={director.id} value={director.value}>{director.value}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select 
                  id="statusFilter" 
                  multiple 
                  value={filters.status}
                  onChange={(e) => handleMultiSelectChange('status', e.target)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {statuses.map(status => (
                    <option key={status.id} value={status.value}>{status.value}</option>
                  ))}
                </select>
              </div>

              {/* Meeting Day Filter */}
              <div>
                <label htmlFor="meetingDayFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meeting Day</label>
                <select 
                  id="meetingDayFilter" 
                  multiple 
                  value={filters.meetingDay}
                  onChange={(e) => handleMultiSelectChange('meetingDay', e.target)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {meetingDays.map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>

              {/* Circle Type Filter */}
              <div>
                <label htmlFor="circleTypeFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Circle Type</label>
                <select 
                  id="circleTypeFilter" 
                  multiple 
                  value={filters.circleType}
                  onChange={(e) => handleMultiSelectChange('circleType', e.target)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {circleTypes.map(type => (
                    <option key={type.id} value={type.value}>{type.value}</option>
                  ))}
                </select>
              </div>

              {/* Event Summary Filter */}
              <div>
                <label htmlFor="eventSummaryFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Event Summary</label>
                <select 
                  id="eventSummaryFilter"
                  value={filters.eventSummary}
                  onChange={(e) => handleFilterChange('eventSummary', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All</option>
                  <option value="received">Summary Received</option>
                  <option value="not_received">Summary Not Received</option>
                </select>
              </div>
            </div>
          )}

          {/* Actions Section */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              
              {/* Bulk Status Update */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Bulk Actions:</span>
                <div className="relative" ref={bulkDropdownRef}>
                  <button
                    onClick={() => setShowBulkDropdown(!showBulkDropdown)}
                    className="flex items-center px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  >
                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                    </svg>
                    Update Status ({totalLeaders})
                    <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                  </button>

                  {showBulkDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg z-50">
                      {statusOptions.map((status) => (
                        <button
                          key={status.value}
                          onClick={() => handleStatusSelect(status.value, status.label)}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-md last:rounded-b-md ${status.color} dark:text-gray-300`}
                        >
                          {status.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Event Summary Progress & Reset */}
              <div className="flex items-center gap-3">
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Event Summaries: {receivedCount}/{totalLeaders} ({progressPercentage}%)
                </div>
                <button
                  onClick={onResetCheckboxes}
                  className="flex items-center px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded border border-red-300 dark:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                  Reset
                </button>
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
    </div>
  );
}
