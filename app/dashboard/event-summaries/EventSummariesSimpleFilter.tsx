"use client";
import { useState } from "react";

interface EventSummariesSimpleFilterProps {
  filters: {
    campus: string;
    type: string;
    day: string;
    time: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  circleLeaders: any[];
}

export default function EventSummariesSimpleFilter({
  filters,
  onFilterChange,
  onClearFilters,
  circleLeaders
}: EventSummariesSimpleFilterProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get unique values from circle leaders data for dropdowns
  const getUniqueValues = (key: string) => {
    const values = circleLeaders.map(leader => {
      switch(key) {
        case 'campus': return leader.campus;
        case 'type': return leader.circle_type;
        case 'day': return leader.meeting_day;
        case 'time': return leader.time_of_day;
        default: return '';
      }
    }).filter(Boolean);
    return Array.from(new Set(values)).sort();
  };

  const campuses = getUniqueValues('campus');
  const types = getUniqueValues('type');
  const days = getUniqueValues('day');
  const times = getUniqueValues('time');

  // Count active filters
  const activeFilterCount = Object.values(filters).filter(value => value !== '').length;

  return (
    <div className="bg-white border-b border-gray-200">
      {/* Mobile Toggle Button */}
      <div className="md:hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between text-left text-gray-700 hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium">Filters</span>
            {activeFilterCount > 0 && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                {activeFilterCount}
              </span>
            )}
          </div>
          {isExpanded ? (
            <span className="text-lg">▲</span>
          ) : (
            <span className="text-lg">▼</span>
          )}
        </button>
      </div>

      {/* Filter Content */}
      <div className={`${isExpanded ? 'block' : 'hidden'} md:block p-4`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Campus Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Campus
            </label>
            <select
              value={filters.campus}
              onChange={(e) => onFilterChange('campus', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Campuses</option>
              {campuses.map(campus => (
                <option key={campus} value={campus}>{campus}</option>
              ))}
            </select>
          </div>

          {/* Circle Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Circle Type
            </label>
            <select
              value={filters.type}
              onChange={(e) => onFilterChange('type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Types</option>
              {types.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Meeting Day Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Meeting Day
            </label>
            <select
              value={filters.day}
              onChange={(e) => onFilterChange('day', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Days</option>
              {days.map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </div>

          {/* Time Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time
            </label>
            <select
              value={filters.time}
              onChange={(e) => onFilterChange('time', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Times</option>
              {times.map(time => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Clear Filters Button */}
        {activeFilterCount > 0 && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClearFilters}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
