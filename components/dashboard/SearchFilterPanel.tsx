"use client";
import { useMemo, useState, useEffect, useRef } from "react";

const MEETING_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_OPTIONS = ["AM", "PM"];

interface SearchFilters {
  campus: string;
  circleType: string; 
  meetingDay: string[];  // Changed to array for multiselect
  timeOfDay: string;
  searchTerm: string;
}

interface SearchFilterPanelProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  onClearAllFilters: () => void;
  totalLeaders: number;
  allLeaders: Array<{
    campus?: string;
    circle_type?: string;
    day?: string;
    time?: string;
  }>;
}

export default function SearchFilterPanel({
  filters,
  onFiltersChange,
  onClearAllFilters,
  totalLeaders,
  allLeaders = []
}: SearchFilterPanelProps) {
  const [showDayDropdown, setShowDayDropdown] = useState(false);
  const dayDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dayDropdownRef.current && !dayDropdownRef.current.contains(event.target as Node)) {
        setShowDayDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Generate unique options from actual data
  const uniqueCampuses = useMemo(() => {
    const campuses = Array.from(new Set(allLeaders.map(leader => leader.campus).filter(Boolean))) as string[];
    return campuses.sort();
  }, [allLeaders]);

  const uniqueCircleTypes = useMemo(() => {
    const types = Array.from(new Set(allLeaders.map(leader => leader.circle_type).filter(Boolean))) as string[];
    return types.sort();
  }, [allLeaders]);

  // Handle filter changes
  const handleFilterChange = (filterType: keyof SearchFilters, value: string | string[]) => {
    onFiltersChange({
      ...filters,
      [filterType]: value
    });
  };

  // Handle multiselect day filter changes
  const handleDayFilterChange = (day: string) => {
    const currentDays = filters.meetingDay || [];
    const updatedDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day];
    
    onFiltersChange({
      ...filters,
      meetingDay: updatedDays
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg mb-8 p-6">
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* Campus Filter */}
        <div>
          <label htmlFor="campus-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Campus
          </label>
          <select
            id="campus-filter"
            value={filters.campus}
            onChange={e => handleFilterChange('campus', e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a Campus</option>
            <option value="all">All Campuses</option>
            {uniqueCampuses.map(campus => (
              <option key={campus} value={campus}>{campus}</option>
            ))}
          </select>
        </div>

        {/* Circle Type Filter */}
        <div>
          <label htmlFor="circleType-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Circle Type
          </label>
          <select
            id="circleType-filter"
            value={filters.circleType}
            onChange={e => handleFilterChange('circleType', e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Types</option>
            {uniqueCircleTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Meeting Day Filter - Multiselect */}
        <div ref={dayDropdownRef}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Day
          </label>
          <div className="relative">
            <div className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-h-[38px] cursor-pointer"
                 onClick={() => setShowDayDropdown(!showDayDropdown)}>
              {filters.meetingDay.length === 0 ? (
                <span className="text-gray-500 dark:text-gray-400">All Days</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {filters.meetingDay.map(day => (
                    <span
                      key={day}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    >
                      {day}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDayFilterChange(day);
                        }}
                        className="ml-1 h-3 w-3 rounded-full inline-flex items-center justify-center text-blue-400 hover:bg-blue-200 hover:text-blue-600 dark:hover:bg-blue-800"
                      >
                        <span className="sr-only">Remove {day}</span>
                        <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                          <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {showDayDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-50">
                <div className="py-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFiltersChange({
                        ...filters,
                        meetingDay: []
                      });
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    Clear all days
                  </button>
                  <hr className="border-gray-200 dark:border-gray-600 my-1" />
                  {MEETING_DAYS.map(day => (
                    <label
                      key={day}
                      className="flex items-center px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={filters.meetingDay.includes(day)}
                        onChange={() => handleDayFilterChange(day)}
                        className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{day}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Time of Day Filter */}
        <div>
          <label htmlFor="timeOfDay-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Time of Day
          </label>
          <select
            id="timeOfDay-filter"
            value={filters.timeOfDay}
            onChange={e => handleFilterChange('timeOfDay', e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Times</option>
            {TIME_OPTIONS.map(time => (
              <option key={time} value={time}>{time}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Clear Filters Button */}
      <div className="flex justify-between items-center">
        <button
          onClick={onClearAllFilters}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Clear all filters
        </button>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {totalLeaders} leaders
        </div>
      </div>
    </div>
  );
}
