'use client';

import { useState, useEffect, useMemo } from 'react';
import FilterPanel from '../../components/dashboard/FilterPanel';
import CircleLeaderCard from '../../components/dashboard/CircleLeaderCard';
import TodayCircles from '../../components/dashboard/TodayCircles';
import ContactModal from '../../components/dashboard/ContactModal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import AlertModal from '../../components/ui/AlertModal';
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

export default function DashboardPage() {
  const { filters, updateFilters, clearAllFilters } = useDashboardFilters();
  const { 
    circleLeaders, 
    isLoading, 
    error, 
    loadCircleLeaders,
    toggleEventSummary, 
    resetEventSummaryCheckboxes,
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
      filtered = filtered.filter(leader => 
        filters.status.includes(leader.status || '')
      );
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

  // Extract unique values for filter options
  const filterOptions = useMemo(() => {
    const campuses = Array.from(new Set(circleLeaders.map(l => l.campus).filter(Boolean)));
    const acpds = Array.from(new Set(circleLeaders.map(l => l.acpd).filter(Boolean)));
    const statuses = Array.from(new Set(circleLeaders.map(l => l.status).filter(Boolean)));
    const circleTypes = Array.from(new Set(circleLeaders.map(l => l.circle_type).filter(Boolean)));
    const meetingDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    return { campuses, acpds, statuses, circleTypes, meetingDays };
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
          campuses={filterOptions.campuses}
          acpds={filterOptions.acpds}
          statuses={filterOptions.statuses}
          circleTypes={filterOptions.circleTypes}
          meetingDays={filterOptions.meetingDays}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4"></div>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {filteredLeaders.map(leader => (
                <CircleLeaderCard
                  key={leader.id}
                  leader={leader}
                  onToggleEventSummary={handleToggleEventSummary}
                  onOpenContactModal={openContactModal}
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
  );
}
