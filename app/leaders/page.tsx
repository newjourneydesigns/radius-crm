'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '../../components/ProtectedRoute';
import FilterPanel from '../../components/dashboard/FilterPanel';
import CircleLeaderCard from '../../components/dashboard/CircleLeaderCard';
import ContactModal from '../../components/dashboard/ContactModal';
import LogConnectionModal from '../../components/dashboard/LogConnectionModal';
import AddNoteModal from '../../components/dashboard/AddNoteModal';
import ExportModal from '../../components/dashboard/ExportModal';
import FollowUpTable from '../../components/dashboard/FollowUpTable';
import { useLeaderFilters } from '../../hooks/useLeaderFilters';
import { useCircleLeaders } from '../../hooks/useCircleLeaders';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { ensureDefaultFrequencies } from '../../lib/frequencyUtils';

// Separate component that uses useSearchParams
function LeadersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  
  // Initialize filters
  const { filters, updateFilters, clearAllFilters, isInitialized } = useLeaderFilters();
  
  // Get circle leaders data
  const {
    circleLeaders,
    isLoading,
    loadCircleLeaders,
    setEventSummaryState,
    updateStatus,
    toggleFollowUp,
    resetEventSummaryCheckboxes,
    invalidateCache
  } = useCircleLeaders();

  // Additional state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [exportModal, setExportModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [followUpRefreshKey, setFollowUpRefreshKey] = useState(0);
  
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
        frequency: searchParams.getAll('frequency'),
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
      filters.frequency.forEach(freq => params.append('frequency', freq));
      
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
        setReferenceDataLoading(true);
        console.log('Loading reference data...');
        const response = await fetch('/api/reference-data/');
        console.log('Reference data response status:', response.status);
        if (!response.ok) throw new Error('Failed to fetch reference data');
        
        const data = await response.json();
        console.log('Reference data loaded:', {
          directors: data.directors?.length || 0,
          campuses: data.campuses?.length || 0,
          statuses: data.statuses?.length || 0,
          circleTypes: data.circleTypes?.length || 0,
          frequencies: data.frequencies?.length || 0
        });
        
        setDirectors(data.directors || []);
        setCampuses(data.campuses || []);
        
        // Fallback statuses if API doesn't return them
        const statusesData = data.statuses && data.statuses.length > 0 
          ? data.statuses 
          : [
            { id: 1, value: 'active' },
            { id: 2, value: 'follow-up' },
            { id: 3, value: 'invited' },
            { id: 4, value: 'pipeline' },
            { id: 5, value: 'on-boarding' },
            { id: 6, value: 'paused' },
            { id: 7, value: 'off-boarding' },
            { id: 8, value: 'archive' }
          ];
        console.log('Setting statuses:', statusesData);
        setStatuses(statusesData);
        
        setCircleTypes(data.circleTypes || []);
        setFrequencies(ensureDefaultFrequencies(data.frequencies || []));

      } catch (error) {
        console.error('Error loading reference data:', error);
        // Fallback data when API fails
        setStatuses([
          { id: 1, value: 'active' },
          { id: 2, value: 'follow-up' },
          { id: 3, value: 'invited' },
          { id: 4, value: 'pipeline' },
          { id: 5, value: 'on-boarding' },
          { id: 6, value: 'paused' },
          { id: 7, value: 'off-boarding' },
          { id: 8, value: 'archive' }
        ]);
        
        // Set default frequencies as fallback
        setFrequencies(ensureDefaultFrequencies([]));

        // Also derive campuses/directors/circleTypes from actual circle_leaders data
        // (keeps filter options usable even if the API route is unavailable)
        try {
          const { data: actualData, error: actualError } = await supabase
            .from('circle_leaders')
            .select('campus, acpd, circle_type')
            .order('campus');

          if (!actualError && actualData) {
            const uniqueCampuses = Array.from(new Set(actualData.map(i => i.campus).filter(Boolean) as string[])).sort();
            const uniqueDirectors = Array.from(new Set(actualData.map(i => i.acpd).filter(Boolean) as string[])).sort();
            const uniqueCircleTypes = Array.from(new Set(actualData.map(i => i.circle_type).filter(Boolean) as string[])).sort();

            setCampuses(uniqueCampuses.map((value, idx) => ({ id: 1000 + idx, value })));
            setDirectors(uniqueDirectors.map((name, idx) => ({ id: 1000 + idx, name })));
            setCircleTypes(uniqueCircleTypes.map((value, idx) => ({ id: 1000 + idx, value })));
          }
        } catch (e) {
          console.error('Error deriving filter options from circle_leaders:', e);
        }
      } finally {
        setReferenceDataLoading(false);
      }
    };

    loadReferenceData();
  }, []);

  // Load connections for connected filter (separate effect so it runs even if reference data fails)
  useEffect(() => {
    const loadConnections = async () => {
      try {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const startDate = firstDayOfMonth.toISOString().split('T')[0];
        const endDate = lastDayOfMonth.toISOString().split('T')[0];
        
        const { data: connectionsData, error: connectionsError } = await supabase
          .from('connections')
          .select('circle_leader_id')
          .gte('date_of_connection', startDate)
          .lte('date_of_connection', endDate);
          
        if (!connectionsError && connectionsData) {
          const connectedIds = new Set(connectionsData.map(c => c.circle_leader_id));
          setConnectedLeaderIds(connectedIds);
        } else if (connectionsError) {
          console.error('Error loading connections:', connectionsError);
        }
      } catch (error) {
        console.error('🔍 Error in loadConnections:', error);
      }
    };

    loadConnections();
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
        frequency: filters.frequency,
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

  // Create dashboard URL with current campus filters
  const getDashboardUrl = () => {
    const url = '/dashboard';
    if (filters.campus.length === 0) {
      console.log('🔗 [Leaders] getDashboardUrl: No campus filters, returning:', url);
      return url;
    }
    
    const searchParams = new URLSearchParams();
    filters.campus.forEach(campus => {
      searchParams.append('campus', campus);
    });
    
    const fullUrl = `${url}?${searchParams.toString()}`;
    console.log('🔗 [Leaders] getDashboardUrl: Campus filters found, returning:', fullUrl);
    console.log('🔗 [Leaders] Current filters.campus:', filters.campus);
    return fullUrl;
  };

  const handleFiltersChange = (newFilters: any) => {
    updateFilters(newFilters);
  };

  const handleSetEventSummaryState = async (leaderId: number, state: 'received' | 'not_received' | 'skipped') => {
    await setEventSummaryState(leaderId, state);
  };

  const handleUpdateStatus = async (leaderId: number, newStatus: string, followUpDate?: string) => {
    await updateStatus(leaderId, newStatus, followUpDate);
    setFollowUpRefreshKey(prev => prev + 1); // Refresh FollowUpTable
    
    // Preserve current filters when reloading
    const filtersToApply = {
      campus: filters.campus,
      acpd: filters.acpd,
      status: filters.status.filter(s => s !== 'follow-up'), // Handle follow-up client-side
      meetingDay: filters.meetingDay,
      circleType: filters.circleType,
      eventSummary: filters.eventSummary
    };
    loadCircleLeaders(filtersToApply);
  };

  const handleUpdateFollowUpDate = async (leaderId: number, followUpDate: string) => {
    try {
      await updateStatus(leaderId, 'follow-up', followUpDate);
      setFollowUpRefreshKey(prev => prev + 1); // Refresh FollowUpTable
      
      // Preserve current filters when reloading
      const filtersToApply = {
        campus: filters.campus,
        acpd: filters.acpd,
        status: filters.status.filter(s => s !== 'follow-up'), // Handle follow-up client-side
        meetingDay: filters.meetingDay,
        circleType: filters.circleType,
        eventSummary: filters.eventSummary
      };
      loadCircleLeaders(filtersToApply);
    } catch (error) {
      console.error('Error updating follow-up date:', error);
    }
  };

  const handleClearFollowUp = async (leaderId: number) => {
    await toggleFollowUp(leaderId, false);
    setFollowUpRefreshKey(prev => prev + 1); // Refresh FollowUpTable
    
    // Preserve current filters when reloading
    const filtersToApply = {
      campus: filters.campus,
      acpd: filters.acpd,
      status: filters.status.filter(s => s !== 'follow-up'), // Handle follow-up client-side
      meetingDay: filters.meetingDay,
      circleType: filters.circleType,
      eventSummary: filters.eventSummary
    };
    loadCircleLeaders(filtersToApply);
  };

  const handleToggleFollowUp = async (leaderId: number) => {
    const leader = circleLeaders.find(l => l.id === leaderId);
    if (leader) {
      await toggleFollowUp(leaderId, !leader.follow_up_required);
      setFollowUpRefreshKey(prev => prev + 1); // Refresh FollowUpTable
      
      // Preserve current filters when reloading
      const filtersToApply = {
        campus: filters.campus,
        acpd: filters.acpd,
        status: filters.status.filter(s => s !== 'follow-up'), // Handle follow-up client-side
        meetingDay: filters.meetingDay,
        circleType: filters.circleType,
        eventSummary: filters.eventSummary
      };
      loadCircleLeaders(filtersToApply);
    }
  };

  const handleConnectionLogged = async () => {
    invalidateCache();
    
    // Reload connections data to update the connected filter (current month only)
    try {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const startDate = firstDayOfMonth.toISOString().split('T')[0];
      const endDate = lastDayOfMonth.toISOString().split('T')[0];
      
      const { data: connectionsData, error: connectionsError } = await supabase
        .from('connections')
        .select('circle_leader_id')
        .gte('date_of_connection', startDate)
        .lte('date_of_connection', endDate);
        
      if (!connectionsError && connectionsData) {
        const connectedIds = new Set(connectionsData.map(c => c.circle_leader_id));
        setConnectedLeaderIds(connectedIds);
      }
    } catch (error) {
      console.error('Error reloading connections:', error);
    }
    
    // Preserve current filters when reloading
    const filtersToApply = {
      campus: filters.campus,
      acpd: filters.acpd,
      status: filters.status.filter(s => s !== 'follow-up'), // Handle follow-up client-side
      meetingDay: filters.meetingDay,
      circleType: filters.circleType,
      eventSummary: filters.eventSummary
    };
    loadCircleLeaders(filtersToApply);
    closeLogConnectionModal();
  };

  const handleNoteAdded = () => {
    invalidateCache();
    setFollowUpRefreshKey(prev => prev + 1); // Refresh FollowUpTable
    
    // Preserve current filters when reloading
    const filtersToApply = {
      campus: filters.campus,
      acpd: filters.acpd,
      status: filters.status.filter(s => s !== 'follow-up'), // Handle follow-up client-side
      meetingDay: filters.meetingDay,
      circleType: filters.circleType,
      eventSummary: filters.eventSummary
    };
    loadCircleLeaders(filtersToApply);
    closeAddNoteModal();
  };

  const handleResetEventSummaries = async () => {
    try {
      // Get all currently filtered leader IDs
      const leaderIds = filteredLeaders.map(leader => leader.id);
      if (leaderIds.length === 0) {
        return;
      }
      
      await resetEventSummaryCheckboxes(leaderIds);
    } catch (error) {
      console.error('Error resetting event summaries:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center space-x-3">
                <Link 
                  href={getDashboardUrl()} 
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

          {/* Sticky Active Filter Tags */}
          {(filters.campus.length > 0 || filters.acpd.length > 0 || filters.status.length > 0 || 
            filters.meetingDay.length > 0 || filters.circleType.length > 0 || 
            filters.eventSummary !== 'all' || filters.connected !== 'all' || filters.timeOfDay !== 'all') && (
            <div className="sticky top-0 z-[999] bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 -mx-3 sm:-mx-4 lg:-mx-8 px-3 sm:px-4 lg:px-8 py-3 mb-6">
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

                {/* ACPD Tags */}
                {filters.acpd.map(acpd => (
                  <span key={`acpd-${acpd}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100/80 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200 backdrop-blur-sm">
                    ACPD: {acpd}
                    <button
                      onClick={() => updateFilters({...filters, acpd: filters.acpd.filter(a => a !== acpd)})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-blue-400 hover:bg-blue-200/80 hover:text-blue-600 dark:hover:bg-blue-800/50"
                    >
                      <span className="sr-only">Remove {acpd} filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                ))}

                {/* Status Tags */}
                {filters.status.map(status => (
                  <span key={`status-${status}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Status: {status}
                    <button
                      onClick={() => updateFilters({...filters, status: filters.status.filter(s => s !== status)})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-green-400 hover:bg-green-200 hover:text-green-600 dark:hover:bg-green-800"
                    >
                      <span className="sr-only">Remove {status} filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                ))}

                {/* Meeting Day Tags */}
                {filters.meetingDay.map(day => (
                  <span key={`meetingDay-${day}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                    Meeting Day: {day}
                    <button
                      onClick={() => updateFilters({...filters, meetingDay: filters.meetingDay.filter(d => d !== day)})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-indigo-400 hover:bg-indigo-200 hover:text-indigo-600 dark:hover:bg-indigo-800"
                    >
                      <span className="sr-only">Remove {day} filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                ))}

                {/* Circle Type Tags */}
                {filters.circleType.map(type => (
                  <span key={`circleType-${type}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200">
                    Circle Type: {type}
                    <button
                      onClick={() => updateFilters({...filters, circleType: filters.circleType.filter(t => t !== type)})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-pink-400 hover:bg-pink-200 hover:text-pink-600 dark:hover:bg-pink-800"
                    >
                      <span className="sr-only">Remove {type} filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                ))}

                {/* Frequency Tags */}
                {filters.frequency.map(freq => (
                  <span key={`frequency-${freq}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200">
                    Frequency: {freq}
                    <button
                      onClick={() => updateFilters({...filters, frequency: filters.frequency.filter(f => f !== freq)})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-fuchsia-400 hover:bg-fuchsia-200 hover:text-fuchsia-600 dark:hover:bg-fuchsia-800"
                    >
                      <span className="sr-only">Remove {freq} filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                ))}

                {/* Event Summary Tag */}
                {filters.eventSummary !== 'all' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                    Event Summary: {filters.eventSummary === 'received' ? 'Received' : 'Not Received'}
                    <button
                      onClick={() => updateFilters({...filters, eventSummary: 'all'})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-yellow-400 hover:bg-yellow-200 hover:text-yellow-600 dark:hover:bg-yellow-800"
                    >
                      <span className="sr-only">Remove event summary filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                )}

                {/* Connected Tag */}
                {filters.connected !== 'all' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">
                    Connected: {filters.connected === 'connected' ? 'This Month' : 'Not This Month'}
                    <button
                      onClick={() => updateFilters({...filters, connected: 'all'})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-teal-400 hover:bg-teal-200 hover:text-teal-600 dark:hover:bg-teal-800"
                    >
                      <span className="sr-only">Remove connected filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                )}

                {/* Time of Day Tag */}
                {filters.timeOfDay !== 'all' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200">
                    Time of Day: {filters.timeOfDay}
                    <button
                      onClick={() => updateFilters({...filters, timeOfDay: 'all'})}
                      className="ml-1.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-cyan-400 hover:bg-cyan-200 hover:text-cyan-600 dark:hover:bg-cyan-800"
                    >
                      <span className="sr-only">Remove time of day filter</span>
                      <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                        <path strokeLinecap="round" strokeWidth="1.5" d="m1 1 6 6m0-6-6 6" />
                      </svg>
                    </button>
                  </span>
                )}
                
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
                <p className="text-xs text-gray-500 mt-2">Debug: referenceDataLoading = {String(referenceDataLoading)}</p>
              </div>
            ) : (
              <FilterPanel 
                filters={filters}
                onFiltersChange={handleFiltersChange}
                onClearAllFilters={clearAllFilters}
                onBulkUpdateStatus={() => {}}
                onResetCheckboxes={() => {}}
                onResetEventSummaries={handleResetEventSummaries}
                totalLeaders={filteredLeaders.length}
                receivedCount={0}
                onAddNote={openAddNoteModal}
                onClearFollowUp={handleClearFollowUp}
                refreshKey={0}
                showFollowUpSection={false}
                directors={directors}
                campuses={campuses}
                statuses={statuses}
                circleTypes={circleTypes}
                frequencies={frequencies}
              />
            )}
          </div>

          {/* Follow Up Section */}
          <div className="mb-6">
            <FollowUpTable
              selectedCampuses={filters.campus}
              onAddNote={(leaderId, name) => openAddNoteModal(leaderId, name)}
              onClearFollowUp={handleClearFollowUp}
              refreshKey={followUpRefreshKey}
            />
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
                    onSetEventSummaryState={handleSetEventSummaryState}
                    onOpenContactModal={openContactModal}
                    onLogConnection={openLogConnectionModal}
                    onAddNote={openAddNoteModal}
                    onClearFollowUp={handleClearFollowUp}
                    onUpdateStatus={handleUpdateStatus}
                    onUpdateFollowUpDate={handleUpdateFollowUpDate}
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
    );
  }

// Main component with Suspense boundary
export default function LeadersPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      }>
        <LeadersContent />
      </Suspense>
    </ProtectedRoute>
  );
}
