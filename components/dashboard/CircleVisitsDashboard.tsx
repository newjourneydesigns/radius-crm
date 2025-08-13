import React, { useState, useEffect } from 'react';
import { useCircleVisits } from '../../hooks/useCircleVisits';
import { CircleVisit } from '../../lib/supabase';

// Simple SVG Icons
const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const MapPinIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

interface CircleVisitsDashboardProps {
  campusFilter?: string[];
  acpdFilter?: string[];
  onScheduleVisit?: (leaderId: number) => void;
}

const CircleVisitsDashboard: React.FC<CircleVisitsDashboardProps> = ({
  campusFilter = [],
  acpdFilter = [],
  onScheduleVisit
}) => {
  const { loadUpcomingVisits, rescheduleVisit, cancelVisit, isLoading, error } = useCircleVisits();
  const [visits, setVisits] = useState<CircleVisit[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>(['scheduled']);
  const [sortBy, setSortBy] = useState<'date' | 'leader' | 'campus'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Load visits when filters change
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await loadUpcomingVisits({
          campus: campusFilter.length > 0 ? campusFilter : undefined,
          acpd: acpdFilter.length > 0 ? acpdFilter : undefined
        });
        setVisits(data);
      } catch (err) {
        console.error('Error loading visits:', err);
      }
    };

    loadData();
  }, [campusFilter, acpdFilter, loadUpcomingVisits]);

  // Filter and sort visits
  const filteredAndSortedVisits = visits
    .filter(visit => selectedStatus.includes(visit.status))
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.visit_date).getTime() - new Date(b.visit_date).getTime();
          break;
        case 'leader':
          comparison = (a.circle_leader?.name || '').localeCompare(b.circle_leader?.name || '');
          break;
        case 'campus':
          comparison = (a.circle_leader?.campus || '').localeCompare(b.circle_leader?.campus || '');
          break;
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });

  const handleReschedule = async (visitId: string, newDate: string) => {
    try {
      await rescheduleVisit(visitId, newDate);
      // Reload visits
      const data = await loadUpcomingVisits({
        campus: campusFilter.length > 0 ? campusFilter : undefined,
        acpd: acpdFilter.length > 0 ? acpdFilter : undefined
      });
      setVisits(data);
    } catch (err) {
      console.error('Error rescheduling visit:', err);
    }
  };

  const handleCancel = async (visitId: string, reason: string) => {
    try {
      await cancelVisit(visitId, 'current_user', reason); // TODO: Get actual user
      // Reload visits
      const data = await loadUpcomingVisits({
        campus: campusFilter.length > 0 ? campusFilter : undefined,
        acpd: acpdFilter.length > 0 ? acpdFilter : undefined
      });
      setVisits(data);
    } catch (err) {
      console.error('Error canceling visit:', err);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'canceled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const isVisitToday = (dateString: string) => {
    const today = new Date().toDateString();
    const visitDate = new Date(dateString).toDateString();
    return today === visitDate;
  };

  const isVisitOverdue = (dateString: string) => {
    const today = new Date();
    const visitDate = new Date(dateString);
    return visitDate < today && visitDate.toDateString() !== today.toDateString();
  };

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded mb-4"></div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Circle Visits</h2>
        <div className="flex space-x-2">
          <button 
            onClick={() => onScheduleVisit?.(0)} // TODO: Implement schedule new visit modal
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Schedule Visit
          </button>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="flex flex-wrap gap-4 items-center bg-gray-50 p-4 rounded-lg">
        {/* Status Filter */}
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Status:</label>
          <select
            value={selectedStatus[0] || 'scheduled'}
            onChange={(e) => setSelectedStatus([e.target.value])}
            className="border border-gray-300 rounded-lg px-3 py-1 text-sm"
          >
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="canceled">Canceled</option>
          </select>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'leader' | 'campus')}
            className="border border-gray-300 rounded-lg px-3 py-1 text-sm"
          >
            <option value="date">Date</option>
            <option value="leader">Leader</option>
            <option value="campus">Campus</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        {/* Visit count */}
        <div className="ml-auto text-sm text-gray-600">
          {filteredAndSortedVisits.length} visit{filteredAndSortedVisits.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Visits Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {filteredAndSortedVisits.length === 0 ? (
          <div className="text-center py-12">
            <CalendarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No visits found</h3>
            <p className="text-gray-600">
              {selectedStatus.includes('scheduled') 
                ? 'No upcoming visits scheduled.' 
                : `No ${selectedStatus[0]} visits found.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Leader
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campus
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Scheduled By
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAndSortedVisits.map((visit) => (
                  <tr 
                    key={visit.id} 
                    className={`hover:bg-gray-50 ${
                      isVisitToday(visit.visit_date) ? 'bg-blue-50' : 
                      isVisitOverdue(visit.visit_date) && visit.status === 'scheduled' ? 'bg-red-50' : ''
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <CalendarIcon className="h-5 w-5 text-gray-400 mr-2" />
                        <div>
                          <div className={`text-sm font-medium ${
                            isVisitToday(visit.visit_date) ? 'text-blue-900' : 
                            isVisitOverdue(visit.visit_date) && visit.status === 'scheduled' ? 'text-red-900' : 'text-gray-900'
                          }`}>
                            {formatDate(visit.visit_date)}
                          </div>
                          {isVisitToday(visit.visit_date) && (
                            <div className="text-xs text-blue-600 font-medium">Today</div>
                          )}
                          {isVisitOverdue(visit.visit_date) && visit.status === 'scheduled' && (
                            <div className="text-xs text-red-600 font-medium">Overdue</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {visit.circle_leader?.name}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center">
                          <ClockIcon className="h-4 w-4 mr-1" />
                          {visit.circle_leader?.day} at {visit.circle_leader?.time}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <MapPinIcon className="h-4 w-4 text-gray-400 mr-1" />
                        <span className="text-sm text-gray-900">{visit.circle_leader?.campus}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(visit.status)}`}>
                        {visit.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {visit.scheduled_by}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        {visit.status === 'scheduled' && (
                          <>
                            <button 
                              onClick={() => {
                                const newDate = prompt('Enter new date (YYYY-MM-DD):', visit.visit_date);
                                if (newDate) handleReschedule(visit.id, newDate);
                              }}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Reschedule
                            </button>
                            <button 
                              onClick={() => {
                                const reason = prompt('Reason for cancellation:');
                                if (reason) handleCancel(visit.id, reason);
                              }}
                              className="text-red-600 hover:text-red-900"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        <button className="text-gray-600 hover:text-gray-900">
                          View Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CircleVisitsDashboard;
