'use client';

import { useState, useEffect, useMemo } from 'react';
import FilterPanel from '../../components/dashboard/FilterPanel';
import CircleLeaderCard from '../../components/dashboard/CircleLeaderCard';
import CircleStatusBar from '../../components/dashboard/CircleStatusBar';
import TodayCircles from '../../components/dashboard/TodayCircles';
import ContactModal from '../../components/dashboard/ContactModal';
import EventSummaryProgress from '../../components/dashboard/EventSummaryProgress';
import ConnectionsProgress from '../../components/dashboard/ConnectionsProgress';
import LogConnectionModal from '../../components/dashboard/LogConnectionModal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import AlertModal from '../../components/ui/AlertModal';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useDashboardFilters } from '../../hooks/useDashboardFilters';
import { useCircleLeaders } from '../../hooks/useCircleLeaders';
import { CircleLeader } from '../../lib/supabase';

interface ContactModalData {
  isOpen: boolean;
  leaderId: number;
  name: string;
  email: string;
  phone: string;
}

interface LogConnectionModalData {
  isOpen: boolean;
  leaderId: number;
  name: string;
}

export default function DashboardPage() {
  const { filters, updateFilters, clearAllFilters } = useDashboardFilters();
  const { 
    circleLeaders, 
    isLoading, 
    error, 
    loadCircleLeaders,
    toggleEventSummary, 
    resetEventSummaryCheckboxes,
    toggleFollowUp,
    updateStatus,
    bulkUpdateStatus
  } = useCircleLeaders();

  const clearFilters = () => {
    updateFilters({
      search: '',
      campus: [],
      acpd: [],
      status: [],
      meetingDay: [],
      circleType: [],
      eventSummary: 'all'
    });
  };

  const [contactModal, setContactModal] = useState<ContactModalData>({
    isOpen: false,
    leaderId: 0,
    name: '',
    email: '',
    phone: ''
  });

  const [logConnectionModal, setLogConnectionModal] = useState<LogConnectionModalData>({
    isOpen: false,
    leaderId: 0,
    name: ''
  });

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAlert, setShowAlert] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });

  // Filter circle leaders based on current filters
  const filteredLeaders = useMemo(() => {
    let filtered = [...circleLeaders];

    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(leader => 
        leader.name?.toLowerCase().includes(search)
      );
    }

    // Campus filter
    if (filters.campus.length > 0) {
      filtered = filtered.filter(leader => 
        filters.campus.includes(leader.campus || '')
      );
    }

    // ACPD filter
    if (filters.acpd.length > 0) {
      filtered = filtered.filter(leader => 
        filters.acpd.includes(leader.acpd || '')
      );
    }

    // Status filter
    if (filters.status.length > 0) {
      filtered = filtered.filter(leader => {
        // Check if regular status is selected
        const statusMatch = filters.status.includes(leader.status || '');
        // Check if follow-up is selected and leader has follow-up required
        const followUpMatch = filters.status.includes('follow-up') && leader.follow_up_required;
        
        return statusMatch || followUpMatch;
      });
    }

    // Meeting Day filter
    if (filters.meetingDay.length > 0) {
      filtered = filtered.filter(leader => 
        filters.meetingDay.includes(leader.day || '')
      );
    }

    // Circle Type filter
    if (filters.circleType.length > 0) {
      filtered = filtered.filter(leader => 
        filters.circleType.includes(leader.circle_type || '')
      );
    }

    // Event Summary filter
    if (filters.eventSummary === 'received') {
      filtered = filtered.filter(leader => leader.event_summary_received === true);
    } else if (filters.eventSummary === 'not_received') {
      filtered = filtered.filter(leader => leader.event_summary_received !== true);
    }

    // Sort by name
    filtered.sort((a, b) => {
      const aName = a.name || '';
      const bName = b.name || '';
      return aName.localeCompare(bName);
    });

    return filtered;
  }, [circleLeaders, filters]);

  // Calculate today's circles
  const todayCircles = useMemo(() => {
    const today = new Date();
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayName = daysOfWeek[today.getDay()].toLowerCase();
    
    return filteredLeaders.filter(leader => {
      if (!leader.day || !leader.frequency) return false;
      
      const meetingDay = leader.day.toLowerCase();
      if (meetingDay !== todayName) return false;
      
      // For now, show all leaders that meet today regardless of frequency
      // In a real implementation, you'd calculate based on actual meeting schedule
      return true;
    });
  }, [filteredLeaders]);

  // Calculate event summary progress
  const eventSummaryProgress = useMemo(() => {
    const total = filteredLeaders.length;
    const received = filteredLeaders.filter(leader => leader.event_summary_received === true).length;
    const percentage = total > 0 ? Math.round((received / total) * 100) : 0;
    
    return {
      total,
      received,
      percentage
    };
  }, [filteredLeaders]);

  // Calculate status distribution for the status bar
  const statusData = useMemo(() => {
    const statusCounts = {
      'Invited': 0,
      'Pipeline': 0,
      'Active': 0,
      'Follow-Up': 0,
      'Paused': 0,
      'Off-Boarding': 0
    };

    // Count statuses from all circle leaders (not just filtered)
    circleLeaders.forEach(leader => {
      const status = leader.status;
      
      if (status === 'invited') statusCounts['Invited']++;
      else if (status === 'pipeline') statusCounts['Pipeline']++;
      else if (status === 'active') statusCounts['Active']++;
      else if (status === 'paused') statusCounts['Paused']++;
      else if (status === 'off-boarding') statusCounts['Off-Boarding']++;
      
      // Add to Follow-Up if follow_up_required is true
      if (leader.follow_up_required) {
        statusCounts['Follow-Up']++;
      }
    });

    // Convert to the format expected by CircleStatusBar
    return [
      { status: 'Invited' as const, count: statusCounts['Invited'], color: 'bg-blue-500' },
      { status: 'Pipeline' as const, count: statusCounts['Pipeline'], color: 'bg-indigo-500' },
      { status: 'Active' as const, count: statusCounts['Active'], color: 'bg-green-500' },
      { status: 'Follow-Up' as const, count: statusCounts['Follow-Up'], color: 'bg-orange-500' },
      { status: 'Paused' as const, count: statusCounts['Paused'], color: 'bg-yellow-500' },
      { status: 'Off-Boarding' as const, count: statusCounts['Off-Boarding'], color: 'bg-red-500' }
    ];
  }, [circleLeaders]);

  // Load data on component mount
  useEffect(() => {
    loadCircleLeaders();
  }, [loadCircleLeaders]);

  // Event handlers
  const handleToggleEventSummary = async (leaderId: number, isChecked: boolean) => {
    try {
      await toggleEventSummary(leaderId, isChecked);
      // Refresh the data
      loadCircleLeaders();
    } catch (error) {
      console.error('Error toggling event summary:', error);
    }
  };  const handleResetCheckboxes = async () => {
    setShowResetConfirm(true);
  };

  const confirmResetCheckboxes = async () => {
    const leaderIds = filteredLeaders.map(leader => leader.id);
    await resetEventSummaryCheckboxes(leaderIds);
    setShowResetConfirm(false);
  };

  const handleBulkUpdateStatus = async (status: string) => {
    try {
      const leaderIds = filteredLeaders.map(leader => leader.id);
      await bulkUpdateStatus(leaderIds, status);
      // Refresh the data
      loadCircleLeaders();
    } catch (error) {
      console.error('Error bulk updating status:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update status. Please try again.'
      });
    }
  };

  const handleUpdateStatus = async (leaderId: number, newStatus: string) => {
    try {
      await updateStatus(leaderId, newStatus);
      loadCircleLeaders();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleStatusBarClick = (status: string) => {
    // Map display status to filter values
    const statusMap: Record<string, string[]> = {
      'Invited': ['invited'],
      'Pipeline': ['pipeline'],
      'Active': ['active'],
      'Follow-Up': ['follow-up'],
      'Paused': ['paused'],
      'Off-Boarding': ['off-boarding']
    };

    const filterValues = statusMap[status] || [];
    
    updateFilters({
      ...filters,
      status: filterValues
    });
  };

  const openContactModal = (leaderId: number, name: string, email: string, phone: string) => {
    setContactModal({
      isOpen: true,
      leaderId,
      name,
      email,
      phone
    });
  };

  const closeContactModal = () => {
    setContactModal({
      isOpen: false,
      leaderId: 0,
      name: '',
      email: '',
      phone: ''
    });
  };

  const openLogConnectionModal = (leaderId: number, name: string) => {
    setLogConnectionModal({
      isOpen: true,
      leaderId,
      name
    });
  };

  const closeLogConnectionModal = () => {
    setLogConnectionModal({
      isOpen: false,
      leaderId: 0,
      name: ''
    });
  };

  const handleConnectionLogged = () => {
    // Refresh the data to update connections progress
    loadCircleLeaders();
  };

  // For now, assume user is admin - in a real app, you'd get this from your auth context
  const isAdmin = true;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="rounded-md bg-red-50 p-4">
            <h3 className="text-sm font-medium text-red-800">Error loading dashboard</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div className="mt-4">
              <button
                onClick={() => loadCircleLeaders()}
                className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Manage and track your Circle Leaders
          </p>
        </div>

        {/* Filters */}
        <FilterPanel 
          filters={filters}
          onFiltersChange={updateFilters}
          onClearAllFilters={clearAllFilters}
          onBulkUpdateStatus={handleBulkUpdateStatus}
          onResetCheckboxes={handleResetCheckboxes}
          totalLeaders={filteredLeaders.length}
          receivedCount={eventSummaryProgress.received}
        />

        {/* Status Bar */}
        <div className="mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="mb-4">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Status Overview</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Click on a segment to filter by status</p>
            </div>
            <CircleStatusBar
              data={statusData}
              total={circleLeaders.length}
              onStatusClick={handleStatusBarClick}
            />
          </div>
        </div>

        {/* Event Summary Progress */}
        <EventSummaryProgress
          receivedCount={eventSummaryProgress.received}
          totalCount={eventSummaryProgress.total}
          onResetCheckboxes={handleResetCheckboxes}
        />

        {/* Connections Progress */}
        <ConnectionsProgress
          filteredLeaderIds={filteredLeaders.map(leader => leader.id)}
          totalFilteredLeaders={filteredLeaders.length}
        />

        {/* Today's Circles */}
        <TodayCircles 
          todayCircles={todayCircles}
          onOpenContactModal={openContactModal}
        />

        {/* Circle Leaders Grid */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Circle Leaders
            </h2>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {filteredLeaders.length} of {circleLeaders.length} leaders
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
              {filteredLeaders.map(leader => (
                <CircleLeaderCard
                  key={leader.id}
                  leader={leader}
                  onToggleEventSummary={handleToggleEventSummary}
                  onOpenContactModal={openContactModal}
                  onLogConnection={openLogConnectionModal}
                  onUpdateStatus={handleUpdateStatus}
                  onToggleFollowUp={toggleFollowUp}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contact Modal */}
      <ContactModal 
        isOpen={contactModal.isOpen}
        name={contactModal.name}
        email={contactModal.email}
        phone={contactModal.phone}
        onClose={closeContactModal}
      />

      {/* Log Connection Modal */}
      <LogConnectionModal
        isOpen={logConnectionModal.isOpen}
        onClose={closeLogConnectionModal}
        circleLeaderId={logConnectionModal.leaderId}
        circleLeaderName={logConnectionModal.name}
        onConnectionLogged={handleConnectionLogged}
      />

      {/* Reset Confirmation Modal */}
      <ConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={confirmResetCheckboxes}
        title="Reset Event Summary Status"
        message={`This will reset the Event Summary status to "Not Received" for all ${filteredLeaders.length} currently visible Circle Leaders. Are you sure?`}
        confirmText="Reset All"
        cancelText="Cancel"
        type="warning"
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert.isOpen}
        onClose={() => setShowAlert({ ...showAlert, isOpen: false })}
        type={showAlert.type}
        title={showAlert.title}
        message={showAlert.message}
      />
      </div>
    </ProtectedRoute>
  );
}
