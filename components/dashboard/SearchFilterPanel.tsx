"use client";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

const MEETING_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_OPTIONS = ["AM", "PM"];

/** Fixed-position geometry for the portalled day menu. */
interface DayMenuPosition {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

const MENU_MARGIN = 8;
const MENU_GAP = 4;
const MENU_MIN_WIDTH = 208;
/** Tall enough for the reset row plus all seven days without an inner scrollbar. */
const MENU_MAX_HEIGHT = 360;

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
  const [dayMenuPosition, setDayMenuPosition] = useState<DayMenuPosition | null>(null);
  const dayFieldRef = useRef<HTMLDivElement>(null);
  const dayTriggerRef = useRef<HTMLDivElement>(null);
  const dayMenuRef = useRef<HTMLDivElement>(null);

  const selectedDayCount = filters.meetingDay?.length ?? 0;

  // The menu is portalled to <body> so no ancestor stacking context or overflow
  // can clip it, which means its position has to be measured off the trigger.
  const positionDayMenu = useCallback(() => {
    const trigger = dayTriggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const width = Math.min(
      Math.max(rect.width, MENU_MIN_WIDTH),
      viewportWidth - MENU_MARGIN * 2
    );
    const left = Math.min(
      Math.max(MENU_MARGIN, rect.left),
      Math.max(MENU_MARGIN, viewportWidth - width - MENU_MARGIN)
    );

    const spaceBelow = viewportHeight - rect.bottom - MENU_GAP - MENU_MARGIN;
    const spaceAbove = rect.top - MENU_GAP - MENU_MARGIN;
    const flipUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    const available = flipUp ? spaceAbove : spaceBelow;

    setDayMenuPosition({
      left,
      width,
      maxHeight: Math.max(160, Math.min(MENU_MAX_HEIGHT, available)),
      ...(flipUp
        ? { bottom: viewportHeight - rect.top + MENU_GAP }
        : { top: rect.bottom + MENU_GAP }),
    });
  }, []);

  // Measure before opening so the menu never renders at a stale anchor, and never
  // ends up open-but-unpositioned. Both updates batch into one render.
  const toggleDayDropdown = useCallback(() => {
    if (showDayDropdown) {
      setShowDayDropdown(false);
      return;
    }
    positionDayMenu();
    setShowDayDropdown(true);
  }, [showDayDropdown, positionDayMenu]);

  // Keep the menu glued to the field while it's open.
  useEffect(() => {
    if (!showDayDropdown) return;

    positionDayMenu();
    window.addEventListener('resize', positionDayMenu);
    window.addEventListener('scroll', positionDayMenu, true);
    return () => {
      window.removeEventListener('resize', positionDayMenu);
      window.removeEventListener('scroll', positionDayMenu, true);
    };
    // selectedDayCount changes the field height as chips wrap, so re-anchor.
  }, [showDayDropdown, selectedDayCount, positionDayMenu]);

  // Dismiss on outside press or Escape. The menu lives outside the field in the
  // DOM, so both subtrees have to count as "inside".
  useEffect(() => {
    if (!showDayDropdown) return;

    const handleOutsidePress = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (dayFieldRef.current?.contains(target)) return;
      if (dayMenuRef.current?.contains(target)) return;
      setShowDayDropdown(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowDayDropdown(false);
    };

    document.addEventListener('mousedown', handleOutsidePress);
    document.addEventListener('touchstart', handleOutsidePress);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsidePress);
      document.removeEventListener('touchstart', handleOutsidePress);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showDayDropdown]);

  // Generate unique options from actual data
  const uniqueCampuses = useMemo(() => {
    const campuses = Array.from(new Set(allLeaders.map(leader => leader.campus).filter(Boolean))) as string[];
    return campuses.sort();
  }, [allLeaders]);

  const EXCLUDED_CIRCLE_TYPES = new Set(['[object Object]', 'Admin', 'Circle', "YA | Couple's"]);
  const uniqueCircleTypes = useMemo(() => {
    const types = Array.from(new Set(
      allLeaders.map(leader => leader.circle_type).filter(
        v => Boolean(v) && typeof v === 'string' && !EXCLUDED_CIRCLE_TYPES.has(v)
      )
    )) as string[];
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg mb-8 p-6 relative z-20">
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
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-vc-500 focus:border-vc-500"
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
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-vc-500 focus:border-vc-500"
          >
            <option value="">All Types</option>
            {uniqueCircleTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Meeting Day Filter - Multiselect */}
        <div ref={dayFieldRef}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Day
          </label>
          <div className="relative">
            <div ref={dayTriggerRef}
                 role="button"
                 tabIndex={0}
                 aria-haspopup="listbox"
                 aria-expanded={showDayDropdown}
                 aria-label="Filter by day"
                 onClick={toggleDayDropdown}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' || e.key === ' ') {
                     e.preventDefault();
                     toggleDayDropdown();
                   }
                 }}
                 className="block w-full pl-3 pr-9 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-vc-500/40 min-h-[38px] cursor-pointer">
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
              <svg
                className={`h-5 w-5 text-gray-400 transition-transform duration-150 ${showDayDropdown ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          {showDayDropdown && dayMenuPosition && typeof document !== 'undefined' &&
            // Opaque hex background, not bg-white: globals.css forces every
            // .bg-white element to translucent glass, which lets whatever sits
            // under the menu bleed through. Matches the Status/ACPD menus.
            createPortal(
              <div
                ref={dayMenuRef}
                role="listbox"
                aria-multiselectable
                aria-label="Meeting days"
                style={{
                  position: 'fixed',
                  left: dayMenuPosition.left,
                  top: dayMenuPosition.top,
                  bottom: dayMenuPosition.bottom,
                  width: dayMenuPosition.width,
                  maxHeight: dayMenuPosition.maxHeight,
                }}
                className="z-[10050] overflow-y-auto overscroll-contain rounded-xl border border-white/[0.08] bg-[#1a1c22] shadow-2xl shadow-black/50 ring-1 ring-black/20"
              >
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, meetingDay: [] })}
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      filters.meetingDay.length === 0
                        ? 'bg-vc-500/10 text-vc-300'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    Clear all days
                  </button>
                  <div className="my-1 border-t border-white/[0.06]" />
                  {MEETING_DAYS.map(day => (
                    <label
                      key={day}
                      className="flex cursor-pointer items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      <input
                        type="checkbox"
                        checked={filters.meetingDay.includes(day)}
                        onChange={() => handleDayFilterChange(day)}
                        className="h-4 w-4 shrink-0 rounded border-white/20 accent-vc-500"
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>,
              document.body
            )}
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
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-vc-500 focus:border-vc-500"
          >
            <option value="">All Times</option>
            {TIME_OPTIONS.map(time => (
              <option key={time} value={time}>{time}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Clear Filters Button */}
      <div className="flex justify-between items-center pt-2">
        <button
          onClick={onClearAllFilters}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-300 dark:border-gray-600 hover:border-red-300 dark:hover:border-red-500/50 rounded-md transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Clear All Filters
        </button>
        <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {totalLeaders} {totalLeaders === 1 ? 'circle' : 'circles'}
        </div>
      </div>
    </div>
  );
}
