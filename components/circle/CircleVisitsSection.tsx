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

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const PlusIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

interface CircleVisitsSectionProps {
  leaderId: number;
  leaderName: string;
}

interface ScheduleVisitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (date: string, note: string) => void;
  isLoading: boolean;
}

const ScheduleVisitModal: React.FC<ScheduleVisitModalProps> = ({ 
  isOpen, 
  onClose, 
  onSchedule, 
  isLoading 
}) => {
  const [visitDate, setVisitDate] = useState('');
  const [previsitNote, setPrevisitNote] = useState('');

  // Set default date to tomorrow
  useEffect(() => {
    if (isOpen) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setVisitDate(tomorrow.toISOString().split('T')[0]);
      setPrevisitNote('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (visitDate) {
      onSchedule(visitDate, previsitNote);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-auto border border-gray-200/20 dark:border-gray-700/50 transform transition-all animate-in zoom-in-95 duration-200"
        style={{
          position: 'relative',
          zIndex: 100000
        }}
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Schedule Circle Visit</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Visit Date *
            </label>
            <input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pre-visit Notes
            </label>
            <textarea
              value={previsitNote}
              onChange={(e) => setPrevisitNote(e.target.value)}
              rows={3}
              placeholder="Any notes or reminders for this visit..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 touch-manipulation"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !visitDate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 touch-manipulation"
            >
              {isLoading ? 'Scheduling...' : 'Schedule Visit'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};

interface CompleteVisitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (note: string) => void;
  isLoading: boolean;
  visitDate: string;
}

const CompleteVisitModal: React.FC<CompleteVisitModalProps> = ({ 
  isOpen, 
  onClose, 
  onComplete, 
  isLoading,
  visitDate 
}) => {
  const [visitNote, setVisitNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setVisitNote('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (visitNote.trim()) {
      onComplete(visitNote.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-auto border border-gray-200/20 dark:border-gray-700/50 transform transition-all animate-in zoom-in-95 duration-200"
        style={{
          position: 'relative',
          zIndex: 100000
        }}
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Complete Circle Visit</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Visit Date: {new Date(visitDate).toLocaleDateString()}
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Visit Notes *
            </label>
            <textarea
              value={visitNote}
              onChange={(e) => setVisitNote(e.target.value)}
              rows={4}
              placeholder="What happened during this visit? (required)"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              These notes will be added to the leader's profile
            </p>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 touch-manipulation"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !visitNote.trim()}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 touch-manipulation"
            >
              {isLoading ? 'Completing...' : 'Complete Visit'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};

const CircleVisitsSection: React.FC<CircleVisitsSectionProps> = ({ leaderId, leaderName }) => {
  const {
    loadLeaderVisitHistory,
    getNextScheduledVisit,
    scheduleVisit,
    completeVisit,
    cancelVisit,
    isLoading,
    error
  } = useCircleVisits();

  const [visits, setVisits] = useState<CircleVisit[]>([]);
  const [nextVisit, setNextVisit] = useState<CircleVisit | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [visitToComplete, setVisitToComplete] = useState<CircleVisit | null>(null);

  // Load data when component mounts or leaderId changes
  useEffect(() => {
    const loadData = async () => {
      try {
        const [historyData, nextVisitData] = await Promise.all([
          loadLeaderVisitHistory(leaderId),
          getNextScheduledVisit(leaderId)
        ]);
        setVisits(historyData);
        setNextVisit(nextVisitData);
      } catch (err) {
        console.error('Error loading visit data:', err);
      }
    };

    if (leaderId) {
      loadData();
    }
  }, [leaderId, loadLeaderVisitHistory, getNextScheduledVisit]);

  const handleScheduleVisit = async (date: string, note: string) => {
    try {
      await scheduleVisit({
        leaderId,
        visitDate: date,
        scheduledBy: 'current_user', // TODO: Get actual user
        previsitNote: note || undefined
      });
      
      // Reload data
      const [historyData, nextVisitData] = await Promise.all([
        loadLeaderVisitHistory(leaderId),
        getNextScheduledVisit(leaderId)
      ]);
      setVisits(historyData);
      setNextVisit(nextVisitData);
      setShowScheduleModal(false);
    } catch (err) {
      console.error('Error scheduling visit:', err);
    }
  };

  const handleCompleteVisit = async (note: string) => {
    if (!visitToComplete) return;
    
    try {
      await completeVisit(visitToComplete.id, 'current_user', note); // TODO: Get actual user
      
      // Reload data
      const [historyData, nextVisitData] = await Promise.all([
        loadLeaderVisitHistory(leaderId),
        getNextScheduledVisit(leaderId)
      ]);
      setVisits(historyData);
      setNextVisit(nextVisitData);
      setShowCompleteModal(false);
      setVisitToComplete(null);
    } catch (err) {
      console.error('Error completing visit:', err);
    }
  };

  const handleCancelVisit = async (visitId: string) => {
    const reason = prompt('Reason for cancellation:');
    if (reason) {
      try {
        await cancelVisit(visitId, 'current_user', reason); // TODO: Get actual user
        
        // Reload data
        const [historyData, nextVisitData] = await Promise.all([
          loadLeaderVisitHistory(leaderId),
          getNextScheduledVisit(leaderId)
        ]);
        setVisits(historyData);
        setNextVisit(nextVisitData);
      } catch (err) {
        console.error('Error canceling visit:', err);
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
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

  // Show recent visits (last 5)
  const recentVisits = visits
    .sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Circle Visits</h3>
        <button
          onClick={() => setShowScheduleModal(true)}
          className="flex items-center space-x-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
        >
          <PlusIcon className="h-4 w-4" />
          <span>Schedule Visit</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {/* Next Scheduled Visit */}
      {nextVisit && (
        <div className={`border rounded-lg p-4 ${
          isVisitToday(nextVisit.visit_date) ? 'border-blue-300 bg-blue-50' :
          isVisitOverdue(nextVisit.visit_date) ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Next Scheduled Visit</h4>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <div className="flex items-center">
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  <span>{formatDate(nextVisit.visit_date)}</span>
                  {isVisitToday(nextVisit.visit_date) && (
                    <span className="ml-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium">
                      Today
                    </span>
                  )}
                  {isVisitOverdue(nextVisit.visit_date) && (
                    <span className="ml-2 bg-red-600 text-white px-2 py-1 rounded text-xs font-medium">
                      Overdue
                    </span>
                  )}
                </div>
                <div>Scheduled by {nextVisit.scheduled_by}</div>
              </div>
              {nextVisit.previsit_note && (
                <p className="mt-2 text-sm text-gray-700 italic">
                  "{nextVisit.previsit_note}"
                </p>
              )}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setVisitToComplete(nextVisit);
                  setShowCompleteModal(true);
                }}
                className="flex items-center space-x-1 bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
              >
                <CheckIcon className="h-4 w-4" />
                <span>Complete</span>
              </button>
              <button
                onClick={() => handleCancelVisit(nextVisit.id)}
                className="text-red-600 hover:text-red-800 text-sm px-2 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visit History */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Recent Visits</h4>
        
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        ) : recentVisits.length === 0 ? (
          <div className="text-center py-8 text-gray-500 border border-gray-200 rounded-lg">
            <CalendarIcon className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p>No visits recorded yet</p>
            <p className="text-sm">Schedule a visit to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentVisits.map((visit) => (
              <div key={visit.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center text-sm text-gray-600">
                        <CalendarIcon className="h-4 w-4 mr-1" />
                        <span>{formatDate(visit.visit_date)}</span>
                      </div>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(visit.status)}`}>
                        {visit.status}
                      </span>
                    </div>
                    
                    {visit.status === 'completed' && visit.completed_by && (
                      <p className="text-sm text-gray-600 mt-1">
                        Completed by {visit.completed_by}
                        {visit.completed_at && (
                          <span className="ml-2">
                            on {new Date(visit.completed_at).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    )}
                    
                    {visit.status === 'canceled' && visit.cancel_reason && (
                      <p className="text-sm text-red-600 mt-1 italic">
                        Canceled: {visit.cancel_reason}
                      </p>
                    )}
                    
                    {visit.previsit_note && (
                      <p className="text-sm text-gray-700 mt-1 italic">
                        "{visit.previsit_note}"
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {visits.length > 5 && (
              <button className="w-full text-center text-blue-600 hover:text-blue-800 text-sm py-2">
                View all {visits.length} visits
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <ScheduleVisitModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSchedule={handleScheduleVisit}
        isLoading={isLoading}
      />

      <CompleteVisitModal
        isOpen={showCompleteModal}
        onClose={() => {
          setShowCompleteModal(false);
          setVisitToComplete(null);
        }}
        onComplete={handleCompleteVisit}
        isLoading={isLoading}
        visitDate={visitToComplete?.visit_date || ''}
      />
    </div>
  );
};

export default CircleVisitsSection;
