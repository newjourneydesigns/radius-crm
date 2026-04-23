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

  const selectClass = "block w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors";
  const checkboxClass = "h-4 w-4 text-indigo-500 focus:ring-indigo-500 border-slate-600 rounded bg-slate-700";
  const labelClass = "text-xs font-medium text-slate-500 uppercase tracking-wide mb-2";

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass mb-4">
      <div className={`px-4 py-3 ${open ? 'border-b border-slate-700' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-white">Filters</span>
            {hasActiveFilters && (
              <span className="text-xs text-slate-400">{activeFilterCount} active</span>
            )}
            <span className="text-xs text-slate-500">{totalLeaders} circles</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasActiveFilters && (
              <button
                onClick={onClearAllFilters}
                className="px-2.5 py-1 text-xs font-medium text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
              >
                Clear
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
              className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white border border-slate-600 rounded-lg hover:bg-slate-700 transition-colors"
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
              <div className={labelClass}>Campus</div>
              <div className="space-y-2 max-h-48 overflow-auto pr-1">
                {campuses.map(c => (
                  <label key={c.id} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.campus.includes(c.value)}
                      onChange={(e) => onFiltersChange({ ...filters, campus: toggleArrayValue(filters.campus, c.value, e.target.checked) })}
                      className={checkboxClass}
                    />
                    <span className="text-sm text-slate-300">{c.value}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* ACPD */}
            <div>
              <div className={labelClass}>ACPD</div>
              <div className="space-y-2 max-h-48 overflow-auto pr-1">
                {directors.map(d => (
                  <label key={d.id} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.acpd.includes(d.name)}
                      onChange={(e) => onFiltersChange({ ...filters, acpd: toggleArrayValue(filters.acpd, d.name, e.target.checked) })}
                      className={checkboxClass}
                    />
                    <span className="text-sm text-slate-300">{d.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <div className={labelClass}>Status</div>
              <div className="space-y-2 max-h-48 overflow-auto pr-1">
                {statuses.map(s => (
                  <label key={s.id} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.status.includes(s.value)}
                      onChange={(e) => onFiltersChange({ ...filters, status: toggleArrayValue(filters.status, s.value, e.target.checked) })}
                      className={checkboxClass}
                    />
                    <span className="text-sm text-slate-300">{s.value}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Meeting Day */}
            <div>
              <div className={labelClass}>Meeting Day</div>
              <div className="space-y-2">
                {MEETING_DAYS.map(day => (
                  <label key={day} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.meetingDay.includes(day)}
                      onChange={(e) => onFiltersChange({ ...filters, meetingDay: toggleArrayValue(filters.meetingDay, day, e.target.checked) })}
                      className={checkboxClass}
                    />
                    <span className="text-sm text-slate-300">{day}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Circle Type */}
            <div>
              <div className={labelClass}>Circle Type</div>
              <div className="space-y-2">
                {circleTypes.map(t => (
                  <label key={t.id} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.circleType.includes(t.value)}
                      onChange={(e) => onFiltersChange({ ...filters, circleType: toggleArrayValue(filters.circleType, t.value, e.target.checked) })}
                      className={checkboxClass}
                    />
                    <span className="text-sm text-slate-300">{t.value}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Frequency */}
            <div>
              <div className={labelClass}>Frequency</div>
              <div className="space-y-2 max-h-48 overflow-auto pr-1">
                {frequencies.map(f => (
                  <label key={f.id} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.frequency.includes(f.value)}
                      onChange={(e) => onFiltersChange({ ...filters, frequency: toggleArrayValue(filters.frequency, f.value, e.target.checked) })}
                      className={checkboxClass}
                    />
                    <span className="text-sm text-slate-300">{f.value}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div>
              <div className={labelClass}>Other</div>

              <label className="block text-sm text-slate-400 mb-1">Event Summary</label>
              <select
                value={filters.eventSummary}
                onChange={(e) => onFiltersChange({ ...filters, eventSummary: e.target.value })}
                className={`mb-3 ${selectClass}`}
              >
                <option value="all">All</option>
                <option value="not_received">No</option>
                <option value="received">Yes</option>
                <option value="did_not_meet">Didn&apos;t Meet</option>
                <option value="skipped">Skip</option>
              </select>

              <label className="block text-sm text-slate-400 mb-1">Connected</label>
              <select
                value={filters.connected}
                onChange={(e) => onFiltersChange({ ...filters, connected: e.target.value })}
                className={`mb-3 ${selectClass}`}
              >
                <option value="all">All</option>
                <option value="connected">This Month</option>
                <option value="not_connected">Not This Month</option>
              </select>

              <label className="block text-sm text-slate-400 mb-1">Time of Day</label>
              <select
                value={filters.timeOfDay}
                onChange={(e) => onFiltersChange({ ...filters, timeOfDay: e.target.value })}
                className={selectClass}
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
