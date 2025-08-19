'use client';

import { useState, useEffect } from 'react';

// Status configuration with new On-Boarding and Archive statuses
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'text-green-600' },
  { value: 'invited', label: 'Invited', color: 'text-blue-600' },
  { value: 'pipeline', label: 'Pipeline', color: 'text-indigo-600' },
  { value: 'on-boarding', label: 'On-Boarding', color: 'text-purple-600' },
  { value: 'paused', label: 'Paused', color: 'text-yellow-600' },
  { value: 'off-boarding', label: 'Off-boarding', color: 'text-red-600' },
  { value: 'archive', label: 'Archive', color: 'text-gray-600' },
  { value: 'follow-up', label: 'Follow Up', color: 'text-orange-600' }
];

const MEETING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface FilterPanelProps {
  filters: {
    campus: string[];
    acpd: string[];
    status: string[];
    meetingDay: string[];
    circleType: string[];
    eventSummary: string;
    connected: string;
    timeOfDay: string;
  };
  onFiltersChange: (filters: any) => void;
  onClearAllFilters: () => void;
  onBulkUpdateStatus?: (status: string) => void;
  onResetCheckboxes?: () => void;
  totalLeaders: number;
  receivedCount: number;
  onAddNote?: (leaderId: number, name: string) => void;
  onClearFollowUp?: (leaderId: number, name: string) => void;
  refreshKey?: number;
  // Reference data props
  directors: Array<{id: number; name: string}>;
  campuses: Array<{id: number; value: string}>;
  statuses: Array<{id: number; value: string}>;
  circleTypes: Array<{id: number; value: string}>;
  frequencies: Array<{id: number; value: string}>;
}

export default function FilterPanelNew({
  filters,
  onFiltersChange,
  onClearAllFilters,
  onBulkUpdateStatus,
  totalLeaders,
  directors = [],
  campuses = [],
  statuses = [],
  circleTypes = [],
  frequencies = []
}: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Helper function to handle multi-select changes
  const handleMultiSelectChange = (filterType: string, target: HTMLSelectElement) => {
    const selectedOptions = Array.from(target.selectedOptions).map(option => option.value);
    onFiltersChange({
      ...filters,
      [filterType]: selectedOptions
    });
  };

  // Helper function to handle single select changes
  const handleSingleSelectChange = (filterType: string, value: string) => {
    onFiltersChange({
      ...filters,
      [filterType]: value
    });
  };

  // Check if any filters are active
  const hasActiveFilters = 
    filters.campus.length > 0 ||
    filters.acpd.length > 0 ||
    filters.status.length > 0 ||
    filters.meetingDay.length > 0 ||
    filters.circleType.length > 0 ||
    filters.eventSummary !== '' ||
    filters.connected !== '' ||
    filters.timeOfDay !== '';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg mb-8">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Filters
          </h2>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {totalLeaders} leaders
            </span>
            {hasActiveFilters && (
              <button
                onClick={onClearAllFilters}
                className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              >
                Clear All
              </button>
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {isExpanded ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      </div>

      {/* Filter Content */}
      {isExpanded && (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            
            {/* Campus Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Campus ({campuses.length})
              </label>
              <select
                multiple
                value={filters.campus}
                onChange={(e) => handleMultiSelectChange('campus', e.target)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-32"
              >
                {campuses.map(campus => (
                  <option key={campus.id} value={campus.value}>
                    {campus.value}
                  </option>
                ))}
              </select>
              {campuses.length === 0 && (
                <p className="text-xs text-red-500">No campuses available</p>
              )}
            </div>

            {/* ACPD Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                ACPD ({directors.length})
              </label>
              <select
                multiple
                value={filters.acpd}
                onChange={(e) => handleMultiSelectChange('acpd', e.target)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-32"
              >
                {directors.map(director => (
                  <option key={director.id} value={director.name}>
                    {director.name}
                  </option>
                ))}
              </select>
              {directors.length === 0 && (
                <p className="text-xs text-red-500">No directors available</p>
              )}
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Status ({statuses.length})
              </label>
              <select
                multiple
                value={filters.status}
                onChange={(e) => handleMultiSelectChange('status', e.target)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-32"
              >
                {STATUS_OPTIONS.map(status => {
                  // Find if this status exists in the database
                  const dbStatus = statuses.find(s => s.value === status.value);
                  if (!dbStatus && status.value !== 'follow-up') return null; // Only show follow-up even if not in DB
                  
                  return (
                    <option key={status.value} value={status.value} className={status.color}>
                      {status.label}
                    </option>
                  );
                })}
              </select>
              {statuses.length === 0 && (
                <p className="text-xs text-red-500">No statuses available</p>
              )}
            </div>

            {/* Circle Type Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Circle Type ({circleTypes.length})
              </label>
              <select
                multiple
                value={filters.circleType}
                onChange={(e) => handleMultiSelectChange('circleType', e.target)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-32"
              >
                {circleTypes.map(type => (
                  <option key={type.id} value={type.value}>
                    {type.value}
                  </option>
                ))}
              </select>
              {circleTypes.length === 0 && (
                <p className="text-xs text-red-500">No circle types available</p>
              )}
            </div>

            {/* Meeting Day Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Meeting Day
              </label>
              <select
                multiple
                value={filters.meetingDay}
                onChange={(e) => handleMultiSelectChange('meetingDay', e.target)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-32"
              >
                {MEETING_DAYS.map(day => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>

            {/* Event Summary Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Event Summary
              </label>
              <select
                value={filters.eventSummary}
                onChange={(e) => handleSingleSelectChange('eventSummary', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All</option>
                <option value="sent">Sent</option>
                <option value="not-sent">Not Sent</option>
              </select>
            </div>

            {/* Connected Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Connected
              </label>
              <select
                value={filters.connected}
                onChange={(e) => handleSingleSelectChange('connected', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            {/* Time of Day Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Time of Day
              </label>
              <select
                value={filters.timeOfDay}
                onChange={(e) => handleSingleSelectChange('timeOfDay', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
            </div>
          </div>

          {/* Bulk Actions */}
          {onBulkUpdateStatus && (
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Bulk Actions:
              </h3>
              <div className="flex items-center space-x-3">
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      onBulkUpdateStatus(e.target.value);
                      e.target.value = ''; // Reset dropdown after selection
                    }
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  defaultValue=""
                >
                  <option value="" disabled>Set selected leaders to...</option>
                  {STATUS_OPTIONS.map(status => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Select leaders using checkboxes first
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Bottom spacing for proper panel separation */}
      <div className="pb-8"></div>
    </div>
  );
}
