'use client';

import { useState, useEffect } from 'react';

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
  campuses: string[];
  acpds: string[];
  statuses: string[];
  circleTypes: string[];
  meetingDays: string[];
}

export default function FilterPanel({
  filters,
  onFiltersChange,
  campuses,
  acpds,
  statuses,
  circleTypes,
  meetingDays
}: FilterPanelProps) {
  const [filtersVisible, setFiltersVisible] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('filtersVisible');
    setFiltersVisible(saved !== 'false');
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
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Filters & Search</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Filter and sort Circle Leaders</p>
            </div>
          </div>
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
      
      {filtersVisible && (
        <div className="p-4 sm:p-6">
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
                  <option key={campus} value={campus}>{campus}</option>
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
                {acpds.map(acpd => (
                  <option key={acpd} value={acpd}>{acpd}</option>
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
                  <option key={status} value={status}>{status}</option>
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
                  <option key={type} value={type}>{type}</option>
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
        </div>
      )}
    </div>
  );
}
