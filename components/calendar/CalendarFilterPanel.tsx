'use client';

import { useEffect, useMemo, useState } from 'react';

const MEETING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

type Filters = {
  campus: string[];
  acpd: string[];
  status: string[];
  meetingDay: string[];
  circleType: string[];
  frequency: string[];
  eventSummary: string;
  connected: string;
  timeOfDay: string;
};

type Props = {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  onClearAllFilters: () => void;
  totalLeaders: number;
  directors: Array<{ id: number; name: string }>;
  campuses: Array<{ id: number; value: string }>;
  statuses: Array<{ id: number; value: string }>;
  circleTypes: Array<{ id: number; value: string }>;
  frequencies: Array<{ id: number; value: string }>;
};

const toggleArrayValue = (arr: string[], value: string, checked: boolean) => {
  if (checked) return arr.includes(value) ? arr : [...arr, value];
  return arr.filter(v => v !== value);
};

export default function CalendarFilterPanel({
  filters,
  onFiltersChange,
  onClearAllFilters,
  totalLeaders,
  directors,
  campuses,
  statuses,
  circleTypes,
  frequencies,
}: Props) {
  const [open, setOpen] = useState(false);

  // Default collapsed; persist user preference.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('calendarFiltersVisible');
    if (saved === null) return;
    setOpen(saved === 'true');
  }, []);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.campus.length > 0 ||
      filters.acpd.length > 0 ||
      filters.status.length > 0 ||
      filters.meetingDay.length > 0 ||
      filters.circleType.length > 0 ||
      filters.frequency.length > 0 ||
      filters.eventSummary !== 'all' ||
      filters.connected !== 'all' ||
      filters.timeOfDay !== 'all'
    );
  }, [filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    count += filters.campus.length;
    count += filters.acpd.length;
    count += filters.status.length;
    count += filters.meetingDay.length;
    count += filters.circleType.length;
    count += filters.frequency.length;
    if (filters.eventSummary !== 'all') count += 1;
    if (filters.connected !== 'all') count += 1;
    if (filters.timeOfDay !== 'all') count += 1;
    return count;
  }, [filters]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 2v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Event Tracker Filters</h2>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                {totalLeaders} circles
                {hasActiveFilters ? ` • ${activeFilterCount} active` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={onClearAllFilters}
                className="px-3 py-1 text-sm font-medium text-red-600 dark:text-red-300 hover:text-red-700 dark:hover:text-red-200 border border-red-300 dark:border-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Clear All
              </button>
            )}
            <button
              onClick={() => {
                setOpen(v => {
                  const next = !v;
                  window.localStorage.setItem('calendarFiltersVisible', next.toString());
                  return next;
                });
              }}
              className="px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {open ? 'Hide' : 'Filters'}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Campus */}
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Campus</div>
              <div className="space-y-2 max-h-48 overflow-auto pr-1">
                {campuses.map(c => (
                  <label key={c.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={filters.campus.includes(c.value)}
                      onChange={(e) =>
                        onFiltersChange({
                          ...filters,
                          campus: toggleArrayValue(filters.campus, c.value, e.target.checked),
                        })
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{c.value}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* ACPD */}
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ACPD</div>
              <div className="space-y-2 max-h-48 overflow-auto pr-1">
                {directors.map(d => (
                  <label key={d.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={filters.acpd.includes(d.name)}
                      onChange={(e) =>
                        onFiltersChange({
                          ...filters,
                          acpd: toggleArrayValue(filters.acpd, d.name, e.target.checked),
                        })
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{d.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</div>
              <div className="space-y-2 max-h-48 overflow-auto pr-1">
                {statuses.map(s => (
                  <label key={s.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={filters.status.includes(s.value)}
                      onChange={(e) =>
                        onFiltersChange({
                          ...filters,
                          status: toggleArrayValue(filters.status, s.value, e.target.checked),
                        })
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{s.value}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Meeting Day */}
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Meeting Day</div>
              <div className="space-y-2">
                {MEETING_DAYS.map(day => (
                  <label key={day} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={filters.meetingDay.includes(day)}
                      onChange={(e) =>
                        onFiltersChange({
                          ...filters,
                          meetingDay: toggleArrayValue(filters.meetingDay, day, e.target.checked),
                        })
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{day}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Circle Type */}
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Circle Type</div>
              <div className="space-y-2">
                {circleTypes.map(t => (
                  <label key={t.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={filters.circleType.includes(t.value)}
                      onChange={(e) =>
                        onFiltersChange({
                          ...filters,
                          circleType: toggleArrayValue(filters.circleType, t.value, e.target.checked),
                        })
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{t.value}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Frequency */}
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Frequency</div>
              <div className="space-y-2 max-h-48 overflow-auto pr-1">
                {frequencies.map(f => (
                  <label key={f.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={filters.frequency.includes(f.value)}
                      onChange={(e) =>
                        onFiltersChange({
                          ...filters,
                          frequency: toggleArrayValue(filters.frequency, f.value, e.target.checked),
                        })
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{f.value}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Other</div>

              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Event Summary</label>
              <select
                value={filters.eventSummary}
                onChange={(e) => onFiltersChange({ ...filters, eventSummary: e.target.value })}
                className="mb-3 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All</option>
                <option value="received">Received</option>
                <option value="not_received">Not Received</option>
                <option value="skipped">Skipped</option>
              </select>

              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Connected</label>
              <select
                value={filters.connected}
                onChange={(e) => onFiltersChange({ ...filters, connected: e.target.value })}
                className="mb-3 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All</option>
                <option value="connected">This Month</option>
                <option value="not_connected">Not This Month</option>
              </select>

              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Time of Day</label>
              <select
                value={filters.timeOfDay}
                onChange={(e) => onFiltersChange({ ...filters, timeOfDay: e.target.value })}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All</option>
                <option value="am">AM</option>
                <option value="pm">PM</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
