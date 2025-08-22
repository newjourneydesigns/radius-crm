'use client';

import { useState } from 'react';

interface SimpleCampusFilterProps {
  filters: {
    campus: string[];
  };
  onFiltersChange: (filters: { campus: string[] }) => void;
  onClearAllFilters: () => void;
  campuses: Array<{ id: number; value: string }>;
  totalLeaders: number;
}

export default function SimpleCampusFilter({
  filters,
  onFiltersChange,
  onClearAllFilters,
  campuses,
  totalLeaders
}: SimpleCampusFilterProps) {
  const [filtersVisible, setFiltersVisible] = useState(true);

  const handleCampusChange = (campusValue: string, checked: boolean) => {
    const newCampusFilters = checked
      ? [...filters.campus, campusValue]
      : filters.campus.filter(c => c !== campusValue);

    onFiltersChange({
      campus: newCampusFilters
    });
  };

  const toggleFilters = () => {
    setFiltersVisible(!filtersVisible);
  };

  const hasActiveFilters = filters.campus.length > 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Filter Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 2v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Filters</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{totalLeaders} leaders</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {hasActiveFilters && (
              <button
                onClick={onClearAllFilters}
                className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
              >
                Clear All
              </button>
            )}
            <button
              onClick={toggleFilters}
              className="px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {filtersVisible ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      </div>
      
      {filtersVisible && (
        <div className="p-4 sm:p-6">
          <div className="space-y-6">
            {/* Campus Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Campus
              </label>
              <div className="space-y-2">
                {campuses.map(campus => (
                  <label key={campus.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.campus.includes(campus.value)}
                      onChange={(e) => handleCampusChange(campus.value, e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                    />
                    <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">
                      {campus.value}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
