'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { CircleLeader } from '../../lib/supabase';
import { formatTimeToAMPM } from '../../lib/timeUtils';
import DashboardFilterAdapter from '../../components/dashboard/DashboardFilterAdapter';
import ExportModal from '../../components/dashboard/ExportModal';
import InviteToCircleModal from '../../components/modals/InviteToCircleModal';
import { useAuth } from '../../contexts/AuthContext';

interface CircleSearchResult {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  campus: string;
  day: string;
  time: string;
  circle_type: string;
  status?: string;
  ccb_group_id?: string;
  leader_type?: string;
  frequency?: string;
  location?: string;
  acpd?: string;
}

type CircleLeadersSearchQuery = {
  select: (columns: string) => {
    order: (column: string) => Promise<{ data: CircleSearchResult[] | null; error: unknown }>;
  };
};

const ROSTER_COUNT_PAGE_SIZE = 1000;

const DAY_ORDER: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

interface DashboardFilters {
  campus: string[];
  acpd?: string[];
  status?: string[];
  meetingDay: string[];
  circleType: string[];
  eventSummary?: string;
  connected?: string;
  timeOfDay: string;
  searchTerm?: string;
  leaderType?: string;
}

const loadRosterCounts = async () => {
  const counts: Record<number, number> = {};
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('circle_roster_cache')
      .select('circle_leader_id')
      .range(from, from + ROSTER_COUNT_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const rows = data || [];
    rows.forEach((r: { circle_leader_id: number | null }) => {
      if (typeof r.circle_leader_id !== 'number') return;
      counts[r.circle_leader_id] = (counts[r.circle_leader_id] || 0) + 1;
    });

    if (rows.length < ROSTER_COUNT_PAGE_SIZE) {
      break;
    }

    from += ROSTER_COUNT_PAGE_SIZE;
  }

  return counts;
};

export default function SearchPage() {
  const { isAuthenticated } = useAuth();
  const signedIn = isAuthenticated();
  const normalizeStatus = (status: string | null | undefined) => (status || '').trim().toLowerCase();

  // localStorage key for persisting filters
  const STORAGE_KEY = 'radius-find-circle-filters';
  const SORT_STORAGE_KEY = 'radius-find-circle-sort';

  // State for circle data
  const [circles, setCircles] = useState<CircleSearchResult[]>([]);
  const [filteredCircles, setFilteredCircles] = useState<CircleSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [rosterCounts, setRosterCounts] = useState<Record<number, number>>({});

  // State for filters - using dashboard filter structure
  // Initialise from localStorage when available
  const [filters, setFilters] = useState<DashboardFilters>(() => {
    const defaults = { campus: [], acpd: [], status: ['Active'], meetingDay: [], circleType: [], timeOfDay: 'all', searchTerm: '', leaderType: 'all' };
    if (typeof window === 'undefined') return defaults;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...defaults, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return defaults;
  });

  // State for export modal
  const [exportModal, setExportModal] = useState(false);
  const [inviteCircle, setInviteCircle] = useState<CircleSearchResult | null>(null);

  // State for sorting
  const [sortConfig, setSortConfig] = useState<{
    key: keyof CircleSearchResult | 'roster' | null;
    direction: 'asc' | 'desc';
  }>(() => {
    if (typeof window === 'undefined') return { key: 'day', direction: 'asc' };
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return { key: 'day', direction: 'asc' };
  });

  // Persist filters to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
  }, [filters]);

  // Persist sort config to localStorage whenever it changes
  useEffect(() => {
    try { localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sortConfig)); } catch { /* ignore */ }
  }, [sortConfig]);

  // Ensure client-side hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Load active circles
  useEffect(() => {
    if (!isClient) return;
    
    const loadCircles = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const selectFields = signedIn
          ? 'id, name, email, phone, campus, day, time, circle_type, status, ccb_group_id, leader_type, frequency, location, acpd'
          : 'id, name, campus, day, time, circle_type, status, ccb_group_id, leader_type, frequency, location, acpd';

        const leadersQuery = supabase.from('circle_leaders') as unknown as CircleLeadersSearchQuery;

        const { data: allDataRaw, error: allError } = await leadersQuery
          .select(selectFields)
          .order('name');

        if (allError) {
          throw allError;
        }

        const allData = allDataRaw || [];

        // Public visitors only see active circles. Signed-in RADIUS users can filter by status.
        const activeCircles = allData.filter(circle => normalizeStatus(circle.status) === 'active');
        const visibleCircles = signedIn ? allData : activeCircles;

        setCircles(visibleCircles);
        setFilteredCircles(visibleCircles);

        // Fetch roster counts from cache in pages so counts are not capped by the default API limit.
        setRosterCounts(await loadRosterCounts());
      } catch (error) {
        console.error('Error loading circles:', error);
        setError('Failed to load circles. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadCircles();
  }, [isClient, signedIn]);

  // Apply filters and search
  useEffect(() => {
    let filtered = circles;

    // Apply search term
    if (filters.searchTerm && filters.searchTerm.trim()) {
      filtered = filtered.filter(circle =>
        circle.name.toLowerCase().includes(filters.searchTerm!.toLowerCase()) ||
        circle.campus.toLowerCase().includes(filters.searchTerm!.toLowerCase()) ||
        circle.circle_type.toLowerCase().includes(filters.searchTerm!.toLowerCase())
      );
    }

    // Apply campus filter
    if (filters.campus && filters.campus.length > 0) {
      filtered = filtered.filter(circle => filters.campus.includes(circle.campus));
    }

    // Apply status filter for signed-in RADIUS users only. Public visitors are already limited to Active circles.
    if (signedIn && filters.status && filters.status.length > 0) {
      const selectedStatusSet = new Set(filters.status.map((status) => normalizeStatus(status)));
      filtered = filtered.filter(circle => selectedStatusSet.has(normalizeStatus(circle.status)));
    }

    // Apply circle type filter
    if (filters.circleType && filters.circleType.length > 0) {
      filtered = filtered.filter(circle => filters.circleType.includes(circle.circle_type));
    }

    // Apply meeting day filter
    if (filters.meetingDay && filters.meetingDay.length > 0) {
      filtered = filtered.filter(circle => filters.meetingDay.includes(circle.day));
    }

    // Apply ACPD filter
    if (filters.acpd && filters.acpd.length > 0) {
      const selectedAcpdSet = new Set(filters.acpd.map((a) => a.trim().toLowerCase()));
      filtered = filtered.filter(circle => selectedAcpdSet.has((circle.acpd || '').trim().toLowerCase()));
    }

    // Apply leader type filter
    if (filters.leaderType && filters.leaderType !== 'all') {
      filtered = filtered.filter(circle => (circle.leader_type || 'circle') === filters.leaderType);
    }

    // Apply time of day filter
    if (filters.timeOfDay && filters.timeOfDay !== 'all') {
      filtered = filtered.filter(circle => {
        if (!circle.time) return false;
        
        const formattedTime = formatTimeToAMPM(circle.time);
        return formattedTime.toLowerCase().includes(filters.timeOfDay.toLowerCase());
      });
    }

    // Apply sorting
    if (sortConfig.key) {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      filtered.sort((a, b) => {
        if (sortConfig.key === 'day') {
          const aRank = DAY_ORDER[(a.day || '').trim().toLowerCase()] ?? 99;
          const bRank = DAY_ORDER[(b.day || '').trim().toLowerCase()] ?? 99;
          if (aRank !== bRank) return (aRank - bRank) * dir;
          // Secondary sort by name for stable grouping within a day
          return a.name.localeCompare(b.name);
        }
        if (sortConfig.key === 'roster') {
          const aCount = rosterCounts[a.id] ?? -1;
          const bCount = rosterCounts[b.id] ?? -1;
          if (aCount !== bCount) return (aCount - bCount) * dir;
          return a.name.localeCompare(b.name);
        }
        const aValue = a[sortConfig.key as keyof CircleSearchResult] ?? '';
        const bValue = b[sortConfig.key as keyof CircleSearchResult] ?? '';
        if (aValue < bValue) return -1 * dir;
        if (aValue > bValue) return 1 * dir;
        return 0;
      });
    }

    setFilteredCircles(filtered);
  }, [circles, filters, signedIn, sortConfig, rosterCounts]);

  // Handle filter changes (using dashboard filter structure)
  const handleFiltersChange = (newFilters: Partial<DashboardFilters>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters
    }));
  };

  // Handle sorting
  const handleSort = (key: keyof CircleSearchResult | 'roster') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Clear all filters
  const clearAllFilters = () => {
    const defaults: DashboardFilters = {
      campus: [],
      acpd: [],
      status: ['Active'],
      meetingDay: [],
      circleType: [],
      timeOfDay: 'all',
      searchTerm: '',
      leaderType: 'all'
    };
    setFilters(defaults);
    setSortConfig({ key: 'day', direction: 'asc' });
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SORT_STORAGE_KEY);
    } catch { /* ignore */ }
  };

  const statusOptions = useMemo(() => {
    const statuses = circles
      .map((circle) => circle.status)
      .filter((status): status is string => Boolean(status && status.trim()))
      .map((status) => status.trim());
    return Array.from(new Set(statuses)).sort((a, b) => {
      if (a === 'Active') return -1;
      if (b === 'Active') return 1;
      return a.localeCompare(b);
    });
  }, [circles]);

  const selectedStatuses = filters.status || [];

  const handleStatusChange = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      status: value === 'all' ? [] : [value],
    }));
  };

  const acpdOptions = useMemo(() => {
    const names = circles
      .map((c) => c.acpd)
      .filter((v): v is string => Boolean(v && v.trim()))
      .map((v) => v.trim());
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [circles]);

  const selectedAcpd = filters.acpd || [];

  const handleAcpdChange = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      acpd: value === 'all' ? [] : [value],
    }));
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Error Loading Circles
                </h3>
                <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117]">
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Find a Circle
                </h1>
              </div>
              <button
                onClick={() => setExportModal(true)}
                className="btn-secondary inline-flex items-center px-4 py-2 rounded-lg text-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters using Dashboard Filter Component */}
        <DashboardFilterAdapter
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onClearAllFilters={clearAllFilters}
          totalLeaders={filteredCircles.length}
          allLeaders={circles}
        />

        {signedIn && (
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Status
              </label>
              <select
                id="status-filter"
                value={selectedStatuses[0] || 'all'}
                onChange={(event) => handleStatusChange(event.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white shadow-sm focus:border-vc-500 focus:outline-none focus:ring-2 focus:ring-vc-500/30"
              >
                <option value="all">All Statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="acpd-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                ACPD
              </label>
              <select
                id="acpd-filter"
                value={selectedAcpd[0] || 'all'}
                onChange={(event) => handleAcpdChange(event.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white shadow-sm focus:border-vc-500 focus:outline-none focus:ring-2 focus:ring-vc-500/30"
              >
                <option value="all">All ACPDs</option>
                {acpdOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Leader Type Filter */}
        <div className="flex items-center gap-2 mb-4">
          {(['all', 'circle', 'host_team'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilters(prev => ({ ...prev, leaderType: type }))}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                (filters.leaderType || 'all') === type
                  ? type === 'host_team'
                    ? 'bg-violet-600 text-white'
                    : 'bg-vc-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {type === 'all' ? 'All Leaders' : type === 'circle' ? 'Circles' : 'Teams'}
            </button>
          ))}
        </div>

        {/* Circle Count + Roster Total */}
        {!isLoading && (
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {filteredCircles.length === circles.length ? (
                <span>
                  <span className="font-semibold text-gray-900 dark:text-white">{circles.length}</span> circle{circles.length !== 1 ? 's' : ''}
                </span>
              ) : (
                <span>
                  Showing <span className="font-semibold text-gray-900 dark:text-white">{filteredCircles.length}</span> of <span className="font-semibold text-gray-900 dark:text-white">{circles.length}</span> circle{circles.length !== 1 ? 's' : ''}
                </span>
              )}
              {(() => {
                if (!signedIn) return null;
                const totalRoster = filteredCircles.reduce((sum, c) => sum + (rosterCounts[c.id] || 0), 0);
                return totalRoster > 0 ? (
                  <span className="ml-3 text-gray-400 dark:text-gray-500">
                    · <span className="font-semibold text-gray-900 dark:text-white">{totalRoster}</span> total roster member{totalRoster !== 1 ? 's' : ''}
                  </span>
                ) : null;
              })()}
            </p>
          </div>
        )}

        {/* Results */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-visible">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-vc-500"></div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading circles...</p>
            </div>
          ) : filteredCircles.length === 0 ? (
            <div className="p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No circles found</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Try adjusting your search criteria or filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th 
                      scope="col" 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Circle Leader</span>
                        {sortConfig.key === 'name' && (
                          <span className="text-blue-500">
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => handleSort('circle_type')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Type</span>
                        {sortConfig.key === 'circle_type' && (
                          <span className="text-blue-500">
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => handleSort('day')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Day</span>
                        {sortConfig.key === 'day' && (
                          <span className="text-blue-500">
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => handleSort('time')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Time</span>
                        {sortConfig.key === 'time' && (
                          <span className="text-blue-500">
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => handleSort('location')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Location</span>
                        {sortConfig.key === 'location' && (
                          <span className="text-blue-500">
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => handleSort('campus')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Campus</span>
                        {sortConfig.key === 'campus' && (
                          <span className="text-blue-500">
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>

                    {signedIn && (
                      <th
                        scope="col"
                        className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200"
                        onClick={() => handleSort('roster')}
                      >
                        <div className="flex items-center justify-center space-x-1">
                          <span>Roster</span>
                          {sortConfig.key === 'roster' && (
                            <span className="text-gray-400">
                              {sortConfig.direction === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                    )}

                    {signedIn && (
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                      >
                        <span className="sr-only">Actions</span>
                      </th>
                    )}

                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredCircles.map((circle) => (
                    <tr key={circle.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          href={`/circle/${circle.id}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                        >
                          {circle.name || 'Unknown'}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {circle.circle_type || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {circle.day || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {formatTimeToAMPM(circle.time) || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {circle.location || <span className="text-gray-400 dark:text-gray-500">—</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {circle.campus || '-'}
                        </div>
                      </td>

                      {signedIn && (
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {typeof rosterCounts[circle.id] === 'number' ? (
                          <Link
                            href={`/circle/${circle.id}/roster`}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-slate-300 bg-zinc-700/50 hover:bg-zinc-700 rounded-full transition-colors"
                          >
                            {rosterCounts[circle.id]}
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">-</span>
                        )}
                      </td>
                      )}

                      {signedIn && (
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => setInviteCircle(circle)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-900/30 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 rounded-md transition-colors"
                            title="Invite a new person to this circle"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                            Invite
                          </button>
                        </td>
                      )}

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={exportModal}
        onClose={() => setExportModal(false)}
        leaders={filteredCircles as unknown as CircleLeader[]}
      />

      {/* Invite to Circle Modal */}
      {inviteCircle && (
        <InviteToCircleModal
          isOpen={!!inviteCircle}
          onClose={() => setInviteCircle(null)}
          circle={{
            leaderName: inviteCircle.name,
            campus: inviteCircle.campus,
            day: inviteCircle.day,
            time: inviteCircle.time,
            frequency: inviteCircle.frequency,
            location: inviteCircle.location,
            acpdName: inviteCircle.acpd,
          }}
          onSend={async (_personName, phone, _email, message) => {
            if (phone) {
              const cleanPhone = phone.replace(/\D/g, '');
              const encodedMessage = encodeURIComponent(message);
              window.location.href = `sms:${cleanPhone}&body=${encodedMessage}`;
            } else {
              await navigator.clipboard.writeText(message);
            }
          }}
        />
      )}
    </div>
  );
}
