"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useCircleLeaders } from "../../../hooks/useCircleLeaders";
import EventSummariesSimpleFilter from "./EventSummariesSimpleFilter";
import { STATUS_OPTIONS } from "../../../lib/circleLeaderConstants";
import { ReadonlyURLSearchParams } from 'next/navigation';

interface EventSummariesPanelProps {
  searchParams?: ReadonlyURLSearchParams | null;
}

export default function EventSummariesPanel({ searchParams }: EventSummariesPanelProps) {
  // Initialize filters from URL parameters
  const getInitialFilters = () => {
    const initialFilters = {
      campus: '',
      type: '',
      day: '',
      time: ''
    };

    if (searchParams) {
      // Parse campus filter
      const campusParam = searchParams.get('campus');
      if (campusParam) {
        try {
          const campusArray = JSON.parse(campusParam);
          initialFilters.campus = Array.isArray(campusArray) && campusArray.length > 0 ? campusArray[0] : '';
        } catch (e) {
          console.warn('Failed to parse campus parameter:', e);
        }
      }

      // Parse circle type filter
      const circleTypeParam = searchParams.get('circleType');
      if (circleTypeParam) {
        try {
          const circleTypeArray = JSON.parse(circleTypeParam);
          initialFilters.type = Array.isArray(circleTypeArray) && circleTypeArray.length > 0 ? circleTypeArray[0] : '';
        } catch (e) {
          console.warn('Failed to parse circleType parameter:', e);
        }
      }

      // Parse meeting day filter
      const meetingDayParam = searchParams.get('meetingDay');
      if (meetingDayParam) {
        try {
          const meetingDayArray = JSON.parse(meetingDayParam);
          initialFilters.day = Array.isArray(meetingDayArray) && meetingDayArray.length > 0 ? meetingDayArray[0] : '';
        } catch (e) {
          console.warn('Failed to parse meetingDay parameter:', e);
        }
      }

      // Parse time of day filter
      const timeOfDayParam = searchParams.get('timeOfDay');
      if (timeOfDayParam && timeOfDayParam !== 'all') {
        initialFilters.time = timeOfDayParam.toUpperCase();
      }
    }

    return initialFilters;
  };

  const [filters, setFilters] = useState(getInitialFilters);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<'name'|'campus'|'status'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const {
    circleLeaders,
    isLoading,
    loadCircleLeaders,
    toggleEventSummary,
    resetEventSummaryCheckboxes
  } = useCircleLeaders();

  useEffect(() => {
      // Convert single-select filters to arrays for useCircleLeaders
      const arrayFilters = {
        campus: filters.campus ? [filters.campus] : [],
        circleType: filters.type ? [filters.type] : [],
        meetingDay: filters.day ? [filters.day] : [],
        timeOfDay: filters.time || '',
      };
      loadCircleLeaders(arrayFilters);
    }, [filters, loadCircleLeaders]);

  // Sorting
  const sortedLeaders = [...circleLeaders].sort((a, b) => {
    const aVal = a[sortKey] ?? '';
    const bVal = b[sortKey] ?? '';
    if (aVal < bVal) return sortAsc ? -1 : 1;
    if (aVal > bVal) return sortAsc ? 1 : -1;
    return 0;
  });

  // Progress bar
  const completed = sortedLeaders.filter(l => l.event_summary_received).length;
  const percent = sortedLeaders.length ? Math.round((completed / sortedLeaders.length) * 100) : 0;

  // Unique campuses/types for filter dropdowns
  const campuses = Array.from(new Set(circleLeaders.map(l => l.campus).filter(Boolean))) as string[];
  const circleTypes = Array.from(new Set(circleLeaders.map(l => l.circle_type).filter(Boolean))) as string[];
  const availableDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const availableTimes = ['AM', 'PM'];

  // Reset only displayed
  const handleReset = () => {
    const ids = sortedLeaders.map(l => l.id);
    resetEventSummaryCheckboxes(ids);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 md:p-8 mb-8">
      <h2 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">Event Summaries Tracker</h2>
      {/* Progress Bar */}
      <div className="mb-4 md:mb-6">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-blue-700 dark:text-white">Completed: {completed} / {sortedLeaders.length}</span>
          <span className="text-sm text-gray-500">{percent}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 md:h-4 dark:bg-gray-700">
          <div className="bg-blue-600 h-3 md:h-4 rounded-full transition-all duration-300" style={{ width: `${percent}%` }}></div>
        </div>
      </div>
      {/* Filter Panel */}
      <EventSummariesSimpleFilter
        filters={filters}
        onFilterChange={(key, value) => setFilters(prev => ({ ...prev, [key]: value }))}
        onClearFilters={() => setFilters({ campus: '', type: '', day: '', time: '' })}
        circleLeaders={circleLeaders}
      />
      
      {/* Reset Button */}
      {completed > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors duration-200 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset All Event Summaries ({completed})
          </button>
        </div>
      )}
      
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-2 text-left cursor-pointer" onClick={() => { setSortKey('name'); setSortAsc(k => sortKey === 'name' ? !k : true); }}>Circle Leader</th>
              <th className="px-4 py-2 text-left cursor-pointer" onClick={() => { setSortKey('campus'); setSortAsc(k => sortKey === 'campus' ? !k : true); }}>Campus</th>
              <th className="px-4 py-2 text-left cursor-pointer" onClick={() => { setSortKey('status'); setSortAsc(k => sortKey === 'status' ? !k : true); }}>Status</th>
              <th className="px-4 py-2 text-left">CCB Link</th>
              <th className="px-4 py-2">Event Summary</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {sortedLeaders.map(l => {
              const statusObj = STATUS_OPTIONS.find(s => s.value === l.status);
              const badgeColor = statusObj?.color || 'text-gray-600';
              return (
                <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-2">
                    <Link href={`/circle/${l.id}`} className="text-blue-600 hover:underline dark:text-blue-400">{l.name}</Link>
                  </td>
                  <td className="px-4 py-2">{l.campus}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 dark:bg-gray-900 ${badgeColor}`}>{statusObj ? statusObj.label : l.status}</span>
                  </td>
                  <td className="px-4 py-2">
                    {l.ccb_profile_link ? (
                      <a href={l.ccb_profile_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">CCB</a>
                    ) : (
                      <span className="text-gray-400">No link</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!l.event_summary_received}
                      onChange={e => toggleEventSummary(l.id, e.target.checked)}
                      className="w-5 h-5 accent-blue-600"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {sortedLeaders.map(l => {
          const statusObj = STATUS_OPTIONS.find(s => s.value === l.status);
          const badgeColor = statusObj?.color || 'text-gray-600';
          return (
            <div key={l.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              {/* Main row: Circle Leader, CCB Link, Checkbox */}
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <Link 
                    href={`/circle/${l.id}`} 
                    className="text-blue-600 hover:underline dark:text-blue-400 font-medium text-base block truncate"
                  >
                    {l.name}
                  </Link>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {l.campus}
                  </div>
                </div>
                <div className="flex items-center space-x-4 flex-shrink-0 ml-4">
                  {l.ccb_profile_link ? (
                    <a 
                      href={l.ccb_profile_link} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-blue-600 hover:underline dark:text-blue-400 text-sm font-medium px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded"
                    >
                      CCB
                    </a>
                  ) : (
                    <span className="text-gray-400 text-xs">No link</span>
                  )}
                  <div className="flex flex-col items-center">
                    <input
                      type="checkbox"
                      checked={!!l.event_summary_received}
                      onChange={e => toggleEventSummary(l.id, e.target.checked)}
                      className="w-6 h-6 accent-blue-600"
                    />
                    <span className="text-xs text-gray-500 mt-1">Summary</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {isLoading && <div className="text-center py-4 text-blue-500">Loading...</div>}
    </div>
  );
}
