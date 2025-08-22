'use client';

import { useState } from 'react';

interface Filters {
  campus: string;
  type: string;
  day: string;
  time: string;
}

interface EventSummariesFilterPanelProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  campuses: string[];
  circleTypes: string[];
  totalLeaders: number;
}

export default function EventSummariesFilterPanel({
  filters,
  onFiltersChange,
  campuses,
  circleTypes,
  totalLeaders
}: EventSummariesFilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const updateFilter = (key: keyof Filters, value: string) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      campus: '',
      type: '',
      day: '',
      time: ''
    });
  };

  const hasActiveFilters = filters.campus || filters.type;
  const activeFilterCount = [filters.campus, filters.type].filter(Boolean).length;

  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg mb-4 md:mb-6">
      {/* Mobile Filter Toggle */}
      <div className="md:hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Filters
            </span>
            {activeFilterCount > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-1 min-w-[1.5rem] text-center">
                {activeFilterCount}
              </span>
            )}
          </div>
          <svg
            className="w-5 h-5 text-gray-500 transform transition-transform"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {/* Mobile Filter Content */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Campus
              </label>
              <select
                value={filters.campus}
                onChange={(e) => updateFilter('campus', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
              >
                <option value="">All Campuses</option>
                {campuses.map(campus => (
                  <option key={campus} value={campus}>{campus}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Circle Type
              </label>
              <select
                value={filters.type}
                onChange={(e) => updateFilter('type', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
              >
                <option value="">All Types</option>
                {circleTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            {hasActiveFilters && (
              <div className="pt-2">
                <button
                  onClick={clearAllFilters}
                  className="w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            )}
            <div className="pt-2 text-sm text-gray-600 dark:text-gray-400 text-center">
              Showing {totalLeaders} circle leaders
            </div>
          </div>
        )}
      </div>

      {/* Desktop Filter Layout */}
      <div className="hidden md:block p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="min-w-0 flex-1">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Campus
            </label>
            <select
              value={filters.campus}
              onChange={(e) => updateFilter('campus', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
            >
              <option value="">All Campuses</option>
              {campuses.map(campus => (
                <option key={campus} value={campus}>{campus}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Circle Type
            </label>
            <select
              value={filters.type}
              onChange={(e) => updateFilter('type', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
            >
              <option value="">All Types</option>
              {circleTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          {hasActiveFilters && (
            <div className="flex-shrink-0">
              <button
                onClick={clearAllFilters}
                className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                Clear All
              </button>
            </div>
          )}
        </div>
        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Showing {totalLeaders} circle leaders
        </div>
      </div>
    </div>
  );
}