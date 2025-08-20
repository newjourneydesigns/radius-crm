'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import DashboardFilterAdapter from '../../components/dashboard/DashboardFilterAdapter';

interface CircleSearchResult {
  id: number;
  name: string;
  campus: string;
  day: string;
  time: string;
  circle_type: string;
}

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
}

export default function SearchPage() {
  // State for circle data
  const [circles, setCircles] = useState<CircleSearchResult[]>([]);
  const [filteredCircles, setFilteredCircles] = useState<CircleSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  // State for filters - using dashboard filter structure
  const [filters, setFilters] = useState<DashboardFilters>({
    campus: [],
    meetingDay: [],
    circleType: [],
    timeOfDay: 'all',
    searchTerm: ''
  });

  // State for sorting
  const [sortConfig, setSortConfig] = useState<{
    key: keyof CircleSearchResult | null;
    direction: 'asc' | 'desc';
  }>({
    key: 'name',
    direction: 'asc'
  });

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
        const { data: allData, error: allError } = await supabase
          .from('circle_leaders')
          .select('id, name, campus, day, time, circle_type, status')
          .order('name');

        if (allError) {
          throw allError;
        }

        // Filter for circles excluding archived ones
        const visibleCircles = allData?.filter(circle => 
          circle.status !== 'archive'
        ) || [];

        setCircles(visibleCircles);
        setFilteredCircles(visibleCircles);
      } catch (error) {
        console.error('Error loading circles:', error);
        setError('Failed to load circles. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadCircles();
  }, [isClient]);

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

    // Apply circle type filter
    if (filters.circleType && filters.circleType.length > 0) {
      filtered = filtered.filter(circle => filters.circleType.includes(circle.circle_type));
    }

    // Apply meeting day filter
    if (filters.meetingDay && filters.meetingDay.length > 0) {
      filtered = filtered.filter(circle => filters.meetingDay.includes(circle.day));
    }

    // Apply time of day filter
    if (filters.timeOfDay && filters.timeOfDay !== 'all') {
      filtered = filtered.filter(circle => {
        if (!circle.time) return false;
        
        const formattedTime = formatTime(circle.time);
        return formattedTime.toLowerCase().includes(filters.timeOfDay.toLowerCase());
      });
    }

    // Apply sorting
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    setFilteredCircles(filtered);
  }, [circles, filters, sortConfig]);

  // Handle filter changes (using dashboard filter structure)
  const handleFiltersChange = (newFilters: Partial<DashboardFilters>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters
    }));
  };

  // Handle sorting
  const handleSort = (key: keyof CircleSearchResult) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setFilters({
      campus: [],
      meetingDay: [],
      circleType: [],
      timeOfDay: 'all',
      searchTerm: ''
    });
  };

  // Format time display - convert 24hr to 12hr AM/PM format
  const formatTime = (time: string | null | undefined): string => {
    if (!time) return '';
    
    // If already in AM/PM format, return as is
    if (time.toLowerCase().includes('am') || time.toLowerCase().includes('pm')) {
      return time;
    }
    
    // Handle 24-hour format (HH:MM)
    const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      
      // Convert to 12-hour format
      if (hours === 0) {
        hours = 12; // 00:xx becomes 12:xx AM
      } else if (hours > 12) {
        hours = hours - 12; // 13:xx becomes 1:xx PM
      }
      
      return `${hours}:${minutes} ${ampm}`;
    }
    
    // If format is not recognized, return as is
    return time;
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Find a Circle
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Search for active circles in your area
            </p>
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

        {/* Results */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Contact
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredCircles.map((circle) => (
                    <tr key={circle.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {circle.name || 'Unknown'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {circle.campus || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {circle.day || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {formatTime(circle.time) || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {circle.circle_type || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        <span className="text-gray-500 dark:text-gray-400">Contact leader directly</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
