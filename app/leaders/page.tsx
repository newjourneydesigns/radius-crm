'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '../../components/ProtectedRoute';
import FilterPanel from '../../components/dashboard/FilterPanel';
import CircleLeaderCard from '../../components/dashboard/CircleLeaderCard';
import ContactModal from '../../components/dashboard/ContactModal';
import LogConnectionModal from '../../components/dashboard/LogConnectionModal';
import AddNoteModal from '../../components/dashboard/AddNoteModal';
import ExportModal from '../../components/dashboard/ExportModal';
import { useDashboardFilters } from '../../hooks/useDashboardFilters';
import { useCircleLeaders } from '../../hooks/useCircleLeaders';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

export default function LeadersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  
  // Initialize filters
  const { filters, updateFilters, clearAllFilters, isInitialized } = useDashboardFilters();
  
  // Get circle leaders data
  const {
    circleLeaders,
    isLoading,
    loadCircleLeaders,
    toggleEventSummary,
    updateStatus,
    toggleFollowUp,
    invalidateCache
  } = useCircleLeaders();

  // Additional state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [exportModal, setExportModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Modal states
  const [contactModal, setContactModal] = useState({ isOpen: false, leaderId: 0, name: '', email: '', phone: '' });
  const [logConnectionModal, setLogConnectionModal] = useState({ isOpen: false, leaderId: 0, name: '' });
  const [addNoteModal, setAddNoteModal] = useState({ isOpen: false, leaderId: 0, name: '', clearFollowUp: false });

  // Reference data states
  const [directors, setDirectors] = useState<{ id: number; name: string; }[]>([]);
  const [campuses, setCampuses] = useState<{ id: number; value: string; }[]>([]);
  const [statuses, setStatuses] = useState<{ id: number; value: string; }[]>([]);
  const [circleTypes, setCircleTypes] = useState<{ id: number; value: string; }[]>([]);
  const [frequencies, setFrequencies] = useState<{ id: number; value: string; }[]>([]);
  const [referenceDataLoading, setReferenceDataLoading] = useState(true);
  const [connectedLeaderIds, setConnectedLeaderIds] = useState(new Set<number>());

  // Load filters from URL on mount
  useEffect(() => {
    if (searchParams && isInitialized) {
      const urlFilters = {
        campus: searchParams.getAll('campus'),
        acpd: searchParams.getAll('acpd'),
        status: searchParams.getAll('status'),
        meetingDay: searchParams.getAll('meetingDay'),
        circleType: searchParams.getAll('circleType'),
        eventSummary: searchParams.get('eventSummary') || 'all',
        connected: searchParams.get('connected') || 'all',
        timeOfDay: searchParams.get('timeOfDay') || 'all'
      };

      // Only update if there are actual filters in URL
      const hasFilters = Object.values(urlFilters).some(value => 
        Array.isArray(value) ? value.length > 0 : value !== 'all'
      );

      if (hasFilters) {
        updateFilters(urlFilters);
      }
    }
  }, [searchParams, isInitialized, updateFilters]);

  // Update URL when filters change
  useEffect(() => {
    if (isInitialized) {
      const params = new URLSearchParams();
      
      filters.campus.forEach(campus => params.append('campus', campus));
      filters.acpd.forEach(acpd => params.append('acpd', acpd));
      filters.status.forEach(status => params.append('status', status));
      filters.meetingDay.forEach(day => params.append('meetingDay', day));
      filters.circleType.forEach(type => params.append('circleType', type));
      
      if (filters.eventSummary !== 'all') params.set('eventSummary', filters.eventSummary);
      if (filters.connected !== 'all') params.set('connected', filters.connected);
      if (filters.timeOfDay !== 'all') params.set('timeOfDay', filters.timeOfDay);
      
      const newUrl = params.toString() ? `/leaders?${params.toString()}` : '/leaders';
      router.replace(newUrl, { scroll: false });
    }
  }, [filters, router, isInitialized]);

  // Check user role from AuthContext
  useEffect(() => {
    if (user?.role) {
      setIsAdmin(user.role === 'ACPD');
    }
  }, [user]);

  // Load reference data
  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const response = await fetch('/api/reference-data');
        if (!response.ok) throw new Error('Failed to fetch reference data');
        
        const data = await response.json();
        
        setDirectors(data.directors || []);
        setCampuses(data.campuses || []);
        setStatuses(data.statuses || []);
        setCircleTypes(data.circleTypes || []);
        setFrequencies(data.frequencies || []);

        // Load connections for connected filter
        const { data: connectionsData, error: connectionsError } = await supabase
          .from('connections')
          .select('circle_leader_id');
          
        if (!connectionsError && connectionsData) {
          const connectedIds = new Set(connectionsData.map(c => c.circle_leader_id));
          setConnectedLeaderIds(connectedIds);
        }

      } catch (error) {
        console.error('Error loading reference data:', error);
      } finally {
        setReferenceDataLoading(false);
      }
    };

    loadReferenceData();
  }, []);

  // Load circle leaders when filters change
  useEffect(() => {
    if (isInitialized) {
      console.log('🔄 Leaders: Filters changed, loading leaders with filters:', filters);
      
      const filtersToApply = {
        campus: filters.campus,
        acpd: filters.acpd,
        status: filters.status.filter(s => s !== 'follow-up'), // Handle follow-up client-side
        meetingDay: filters.meetingDay,
        circleType: filters.circleType,
        eventSummary: filters.eventSummary
        // Note: connected and timeOfDay are handled client-side
      };
      
      console.log('🎯 Leaders: Applying server-side filters:', filtersToApply);
      loadCircleLeaders(filtersToApply);
    }
  }, [filters, isInitialized, loadCircleLeaders]);

  // Apply client-side filtering (similar to dashboard)
  const filteredLeaders = useMemo(() => {
    let filtered = [...circleLeaders];

    // Follow-up status filter (client-side only)
    if (filters.status.length > 0 && filters.status.includes('follow-up')) {
      // If only follow-up is selected, show only follow-up required
      if (filters.status.length === 1 && filters.status[0] === 'follow-up') {
        filtered = filtered.filter(leader => leader.follow_up_required);
      } else {
        // If follow-up is mixed with other statuses, include follow-up required leaders
        filtered = filtered.filter(leader => {
          const statusMatch = filters.status.some(status => 
            status !== 'follow-up' && status === leader.status
          );
          const followUpMatch = leader.follow_up_required;
          return statusMatch || followUpMatch;
        });
      }
    }

    // Connected filter (client-side - requires connections data)
    if (filters.connected === 'connected') {
      filtered = filtered.filter(leader => connectedLeaderIds.has(leader.id));
    } else if (filters.connected === 'not_connected') {
      filtered = filtered.filter(leader => !connectedLeaderIds.has(leader.id));
    }

    // Time of Day filter (client-side - complex parsing)
    if (filters.timeOfDay === 'am' || filters.timeOfDay === 'pm') {
      filtered = filtered.filter(leader => {
        if (!leader.time) return false;
        
        // First try to parse 12-hour format with AM/PM (e.g., "7:00 PM", "10:30 AM")
        const ampmMatch = leader.time.match(/(\d{1,2}):?(\d{0,2})\s*(AM|PM)/i);
        if (ampmMatch) {
          const period = ampmMatch[3].toUpperCase();
          return filters.timeOfDay === 'am' ? period === 'AM' : period === 'PM';
        }
        
        // Try to parse 24-hour format (e.g., "19:00", "18:30", "07:30")
        const time24Match = leader.time.match(/^(\d{1,2}):(\d{2})$/);
        if (time24Match) {
          const hour = parseInt(time24Match[1], 10);
          // 0-11 hours = AM, 12-23 hours = PM
          if (filters.timeOfDay === 'am') {
            return hour >= 0 && hour < 12;
          } else {
            return hour >= 12 && hour <= 23;
          }
        }
        
        return false;
      });
    }

    // Sort by name (always client-side)
    filtered.sort((a, b) => {
      const aName = a.name || '';
      const bName = b.name || '';
      return aName.localeCompare(bName);
    });

    return filtered;
  }, [circleLeaders, filters, connectedLeaderIds]);

  // Pagination calculations
  const totalPages = itemsPerPage === -1 ? 1 : Math.ceil(filteredLeaders.length / itemsPerPage);
  const startIndex = itemsPerPage === -1 ? 0 : (currentPage - 1) * itemsPerPage;
  const endIndex = itemsPerPage === -1 ? filteredLeaders.length : startIndex + itemsPerPage;
  const paginatedLeaders = itemsPerPage === -1 ? filteredLeaders : filteredLeaders.slice(startIndex, endIndex);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Modal handlers
  const openContactModal = (leaderId: number, name: string, email: string, phone: string) => {
    setContactModal({ isOpen: true, leaderId, name, email, phone });
  };

  const closeContactModal = () => {
    setContactModal({ isOpen: false, leaderId: 0, name: '', email: '', phone: '' });
  };

  const openLogConnectionModal = (leaderId: number, name: string) => {
    setLogConnectionModal({ isOpen: true, leaderId, name });
  };

  const closeLogConnectionModal = () => {
    setLogConnectionModal({ isOpen: false, leaderId: 0, name: '' });
  };

  const openAddNoteModal = (leaderId: number, name: string, clearFollowUp: boolean = false) => {
    setAddNoteModal({ isOpen: true, leaderId, name, clearFollowUp });
  };

  const closeAddNoteModal = () => {
    setAddNoteModal({ isOpen: false, leaderId: 0, name: '', clearFollowUp: false });
  };

  const handleFiltersChange = (newFilters: any) => {
    updateFilters(newFilters);
  };

  const handleToggleEventSummary = async (leaderId: number) => {
    const leader = circleLeaders.find(l => l.id === leaderId);
    if (leader) {
      await toggleEventSummary(leaderId, !leader.event_summary_received);
    }
  };

  const handleUpdateStatus = async (leaderId: number, newStatus: string) => {
    await updateStatus(leaderId, newStatus);
  };

  const handleClearFollowUp = async (leaderId: number) => {
    await toggleFollowUp(leaderId, false);
  };

  const handleToggleFollowUp = async (leaderId: number) => {
    const leader = circleLeaders.find(l => l.id === leaderId);
    if (leader) {
      await toggleFollowUp(leaderId, !leader.follow_up_required);
    }
  };

  const handleConnectionLogged = () => {
    invalidateCache();
    closeLogConnectionModal();
  };

  const handleNoteAdded = () => {
    invalidateCache();
    closeAddNoteModal();
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center space-x-3">
                <Link 
                  href="/dashboard" 
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Circle Leaders</h1>
              </div>
              <div className="mt-4 sm:mt-0 flex space-x-3">
                <button
                  onClick={() => setExportModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export
                </button>
              </div>
            </div>
          </div>

          {/* Active Filter Tags */}
          {(filters.campus.length > 0 || filters.acpd.length > 0 || filters.status.length > 0 || 
            filters.meetingDay.length > 0 || filters.circleType.length > 0 || 
            filters.eventSummary !== 'all' || filters.connected !== 'all' || filters.timeOfDay !== 'all') && (
            <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex items-center flex-wrap gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Active Filters:</span>
                
                {/* Campus Tags */}
                {filters.campus.filter(campus => campus && campus !== 'all' && campus !== '__ALL_CAMPUSES__').map(campus => (
                  <span key={`campus-${campus}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Campus: {campus}
                    <button
                      onClick={() => updateFilters({...filters, campus: filters.campus.filter(c => c !== campus)})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-blue-400 hover:bg-blue-200 hover:text-blue-600 dark:hover:bg-blue-800"
                    >
                      <span className="sr-only">Remove {campus} filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                ))}
                
                {/* Clear All Button */}
                <button
                  onClick={clearAllFilters}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 ml-2"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="mb-6">
            {referenceDataLoading ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <p className="text-gray-600 dark:text-gray-400">Loading filters...</p>
              </div>
            ) : (
              <FilterPanel 
                filters={filters}
                onFiltersChange={handleFiltersChange}
                onClearAllFilters={clearAllFilters}
                onBulkUpdateStatus={() => {}}
                onResetCheckboxes={() => {}}
                totalLeaders={filteredLeaders.length}
                receivedCount={0}
                onAddNote={openAddNoteModal}
                onClearFollowUp={handleClearFollowUp}
                refreshKey={0}
                directors={directors}
                campuses={campuses}
                statuses={statuses}
                circleTypes={circleTypes}
                frequencies={frequencies}
              />
            )}
          </div>

          {/* Circle Leaders Grid */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                All Circle Leaders
              </h2>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <label htmlFor="items-per-page" className="text-sm text-gray-600 dark:text-gray-400">
                    Show:
                  </label>
                  <select
                    id="items-per-page"
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={-1}>All</option>
                  </select>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {itemsPerPage === -1 ? (
                    `${filteredLeaders.length} of ${circleLeaders.length} leaders`
                  ) : (
                    `${startIndex + 1}-${Math.min(endIndex, filteredLeaders.length)} of ${filteredLeaders.length} leaders`
                  )}
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 animate-pulse">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 pr-6">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                      </div>
                      <div className="flex-1 px-6">
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                      </div>
                      <div className="flex space-x-2">
                        <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                        <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                        <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredLeaders.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <svg 
                  className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth="2" 
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  No Circle Leaders found
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Try adjusting your filters or search terms.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedLeaders.map(leader => (
                  <CircleLeaderCard
                    key={leader.id}
                    leader={leader}
                    onToggleEventSummary={handleToggleEventSummary}
                    onOpenContactModal={openContactModal}
                    onLogConnection={openLogConnectionModal}
                    onAddNote={openAddNoteModal}
                    onClearFollowUp={handleClearFollowUp}
                    onUpdateStatus={handleUpdateStatus}
                    onToggleFollowUp={handleToggleFollowUp}
                    isAdmin={isAdmin}
                    statuses={statuses}
                  />
                ))}
              </div>
            )}
            
            {/* Pagination Controls */}
            {itemsPerPage !== -1 && totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Previous
                  </button>
                  
                  {/* Page numbers */}
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-2 text-sm font-medium rounded-md ${
                            currentPage === pageNum
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modals */}
        <ContactModal 
          isOpen={contactModal.isOpen}
          name={contactModal.name}
          email={contactModal.email}
          phone={contactModal.phone}
          onClose={closeContactModal}
        />

        <LogConnectionModal
          isOpen={logConnectionModal.isOpen}
          onClose={closeLogConnectionModal}
          circleLeaderId={logConnectionModal.leaderId}
          circleLeaderName={logConnectionModal.name}
          onConnectionLogged={handleConnectionLogged}
        />

        <AddNoteModal
          isOpen={addNoteModal.isOpen}
          onClose={closeAddNoteModal}
          circleLeaderId={addNoteModal.leaderId}
          circleLeaderName={addNoteModal.name}
          clearFollowUp={addNoteModal.clearFollowUp}
          onNoteAdded={handleNoteAdded}
        />

        <ExportModal
          isOpen={exportModal}
          onClose={() => setExportModal(false)}
          leaders={filteredLeaders}
        />
      </div>
    </ProtectedRoute>
  );
}
