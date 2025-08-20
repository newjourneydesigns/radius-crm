"use client";
import { useState } from "react";

const MEETING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface FilterPanelProps {
  filters: {
    campus: string[];
    acpd?: string[];
    status?: string[];
    meetingDay: string[];
    circleType: string[];
    eventSummary?: string;
    connected?: string;
    timeOfDay: string;
    searchTerm?: string;
  };
  onFiltersChange: (filters: any) => void;
  onClearAllFilters: () => void;
  onBulkUpdateStatus?: (status: string) => void;
  onResetCheckboxes?: () => void;
  totalLeaders: number;
  receivedCount?: number;
  onAddNote?: (leaderId: number, name: string) => void;
  onClearFollowUp?: (leaderId: number, name: string) => void;
  refreshKey?: number;
  directors?: Array<{ id: number; name: string }>;
  campuses: Array<{ id: number; value: string }>;
  statuses?: Array<{ id: number; value: string }>;
  circleTypes: Array<{ id: number; value: string }>;
  frequencies?: Array<{ id: number; value: string }>;
}

export default function FilterPanelNew({
  filters,
  onFiltersChange,
  onClearAllFilters,
  onBulkUpdateStatus,
  onResetCheckboxes,
  totalLeaders,
  receivedCount,
  onAddNote,
  onClearFollowUp,
  refreshKey,
  directors = [],
  campuses = [],
  statuses = [],
  circleTypes = [],
  frequencies = []
}: FilterPanelProps) {
  // Single-select change handler
  const handleSelectChange = (filterType: string, value: string) => {
    let normalizedValue = value;
    if (filterType === "timeOfDay" && value) {
      normalizedValue = value.toUpperCase();
    }
    
    // For array-based filters, convert to array format
    if (['campus', 'meetingDay', 'circleType'].includes(filterType)) {
      onFiltersChange({ ...filters, [filterType]: value ? [value] : [] });
    } else {
      onFiltersChange({ ...filters, [filterType]: normalizedValue });
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg mb-8 p-6">
      {/* Search Bar */}
      <div className="mb-6">
        <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Search Leaders
        </label>
        <div className="relative">
          <input
            type="text"
            id="search"
            value={filters.searchTerm || ""}
            onChange={e => onFiltersChange({ ...filters, searchTerm: e.target.value })}
            placeholder="Search by leader name, campus, or circle type..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* Campus Filter */}
        <div>
          <label htmlFor="campus-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Campus
          </label>
          <select
            id="campus-filter"
            value={Array.isArray(filters.campus) ? (filters.campus[0] || "") : ""}
            onChange={e => handleSelectChange("campus", e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Campuses</option>
            {campuses.map(campus => (
              <option key={campus.id} value={campus.value}>{campus.value}</option>
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
            value={Array.isArray(filters.circleType) ? (filters.circleType[0] || "") : ""}
            onChange={e => handleSelectChange("circleType", e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Types</option>
            {circleTypes.map(type => (
              <option key={type.id} value={type.value}>{type.value}</option>
            ))}
          </select>
        </div>

        {/* Meeting Day Filter */}
        <div>
          <label htmlFor="meetingDay-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Day
          </label>
          <select
            id="meetingDay-filter"
            value={Array.isArray(filters.meetingDay) ? (filters.meetingDay[0] || "") : ""}
            onChange={e => handleSelectChange("meetingDay", e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Days</option>
            {MEETING_DAYS.map(day => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </div>

        {/* Time of Day Filter */}
        <div>
          <label htmlFor="timeOfDay-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Time of Day
          </label>
          <select
            id="timeOfDay-filter"
            value={filters.timeOfDay || ""}
            onChange={e => handleSelectChange("timeOfDay", e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Times</option>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
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
