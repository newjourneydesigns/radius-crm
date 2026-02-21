import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
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

const TrashIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

  const modalContent = (
    <div 
      className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-200/20 dark:border-gray-700/50 transform transition-all animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          zIndex: 1000000,
          margin: 'auto'
        }}
      >
        <div className="p-4 sm:p-6">
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

  return typeof document !== 'undefined' ? ReactDOM.createPortal(modalContent, document.body) : null;
};

interface CompleteVisitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (note: string, celebrations?: string, observations?: string, nextStep?: string) => void;
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
  const [celebrations, setCelebrations] = useState('');
  const [observations, setObservations] = useState('');
  const [nextStep, setNextStep] = useState('');

  useEffect(() => {
    if (isOpen) {
      setVisitNote('');
      setCelebrations('');
      setObservations('');
      setNextStep('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete(visitNote.trim(), celebrations.trim() || undefined, observations.trim() || undefined, nextStep.trim() || undefined);
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-200/20 dark:border-gray-700/50 transform transition-all animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          zIndex: 1000000,
          margin: 'auto'
        }}
      >
        <div className="p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Record Circle Visit</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Visit Date: {new Date(visitDate).toLocaleDateString()}
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              General Notes
            </label>
            <textarea
              value={visitNote}
              onChange={(e) => setVisitNote(e.target.value)}
              rows={3}
              placeholder="Overall notes about the visit..."
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Optional Questions
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Celebrations: What are you celebrating about this leader and/or their Circle?
                </label>
                <textarea
                  value={celebrations}
                  onChange={(e) => setCelebrations(e.target.value)}
                  rows={2}
                  placeholder="What wins or positive developments did you observe?"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Observations: What did you see, hear, or experience?
                </label>
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  rows={2}
                  placeholder="What stood out to you during the visit?"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  My next step to disciple this leader is...
                </label>
                <textarea
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  rows={2}
                  placeholder="What action will you take to help develop this leader?"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
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
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 touch-manipulation"
            >
              {isLoading ? 'Recording...' : 'Record Visit'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? ReactDOM.createPortal(modalContent, document.body) : null;
};

const CircleVisitsSection: React.FC<CircleVisitsSectionProps> = ({ leaderId, leaderName }) => {
  const {
    loadLeaderVisitHistory,
    getNextScheduledVisit,
    scheduleVisit,
    completeVisit,
    cancelVisit,
    deleteVisit,
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

  const handleCompleteVisit = async (note: string, celebrations?: string, observations?: string, nextStep?: string) => {
    if (!visitToComplete) return;
    
    try {
      await completeVisit(visitToComplete.id, 'current_user', note, celebrations, observations, nextStep); // TODO: Get actual user
      
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

  const handleDeleteVisit = async (visitId: string, visitDate: string) => {
    const confirmed = confirm(`Are you sure you want to delete this visit scheduled for ${formatDate(visitDate)}? This action cannot be undone.`);
    if (confirmed) {
      try {
        await deleteVisit(visitId);
        
        // Reload data
        const [historyData, nextVisitData] = await Promise.all([
          loadLeaderVisitHistory(leaderId),
          getNextScheduledVisit(leaderId)
        ]);
        setVisits(historyData);
        setNextVisit(nextVisitData);
      } catch (err) {
        console.error('Error deleting visit:', err);
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

  // Show recent visits (last 5), excluding the next scheduled visit if it's already shown above
  const recentVisits = visits
    .filter(visit => !nextVisit || visit.id !== nextVisit.id) // Exclude the next visit
    .sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Circle Visits</h3>
        <button
          onClick={() => setShowScheduleModal(true)}
          className="flex items-center space-x-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
        >
          <PlusIcon className="h-4 w-4" />
          <span>Schedule Visit</span>
        </button>
      </div>

      {/* External Links */}
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href="https://form.jotform.com/230576051412144"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>JotForm - Circle Visit Form</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        <a
          href="https://docs.google.com/spreadsheets/d/1PWorX0udibjgbskLU6lOQ5T8oS6AWGyCW-9x76CUbxs/edit#gid=1262105001"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>View Submissions (Google Sheets)</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {/* Next Scheduled Visit */}
      {nextVisit && (
        <div className={`border rounded-lg p-4 ${
          isVisitToday(nextVisit.visit_date) ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20' :
          isVisitOverdue(nextVisit.visit_date) ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
        }`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
            <div className="min-w-0">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Next Scheduled Visit</h4>
              <div className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <CalendarIcon className="h-4 w-4 flex-shrink-0" />
                  <span>{formatDate(nextVisit.visit_date)}</span>
                  {isVisitToday(nextVisit.visit_date) && (
                    <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs font-medium">
                      Today
                    </span>
                  )}
                  {isVisitOverdue(nextVisit.visit_date) && (
                    <span className="bg-red-600 text-white px-2 py-0.5 rounded text-xs font-medium">
                      Overdue
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Scheduled by {nextVisit.scheduled_by}</div>
              </div>
              {nextVisit.previsit_note && (
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 italic">
                  "{nextVisit.previsit_note}"
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  setVisitToComplete(nextVisit);
                  setShowCompleteModal(true);
                }}
                className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700 transition-colors"
              >
                <CheckIcon className="h-4 w-4" />
                <span>Complete</span>
              </button>
              <button
                onClick={() => handleCancelVisit(nextVisit.id)}
                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm px-2 py-1.5 border border-red-200 dark:border-red-800 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteVisit(nextVisit.id, nextVisit.visit_date)}
                className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1.5"
                title="Delete visit"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visit History */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900 dark:text-white">Recent Visits</h4>
        
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        ) : recentVisits.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
            <CalendarIcon className="h-8 w-8 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
            <p>No visits recorded yet</p>
            <p className="text-sm">Schedule a visit to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentVisits.map((visit) => (
              <div key={visit.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start mb-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                      <CalendarIcon className="h-4 w-4 flex-shrink-0" />
                      <span>{formatDate(visit.visit_date)}</span>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeColor(visit.status)}`}>
                      {visit.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 self-start">
                    {visit.status === 'scheduled' && (
                      <button
                        onClick={() => handleCancelVisit(visit.id)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-xs px-2 py-1 border border-red-200 dark:border-red-800 rounded"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteVisit(visit.id, visit.visit_date)}
                      className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1"
                      title="Delete visit"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                {visit.status === 'completed' && (
                  <div className="mt-3 space-y-2">
                    {visit.completed_by && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Completed by {visit.completed_by}
                        {visit.completed_at && (
                          <span className="ml-2">
                            on {new Date(visit.completed_at).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    )}
                    
                    {visit.celebrations && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-2">
                        <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300 mb-1">🎉 Celebrations</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{visit.celebrations}</p>
                      </div>
                    )}
                    
                    {visit.observations && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-2">
                        <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">👁️ Observations</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{visit.observations}</p>
                      </div>
                    )}
                    
                    {visit.next_step && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-2">
                        <p className="text-xs font-semibold text-green-800 dark:text-green-300 mb-1">➡️ Next Step</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{visit.next_step}</p>
                      </div>
                    )}
                  </div>
                )}
                
                {visit.status === 'canceled' && visit.cancel_reason && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-2 italic">
                    Canceled: {visit.cancel_reason}
                  </p>
                )}
                
                {visit.previsit_note && visit.status === 'scheduled' && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 italic">
                    "{visit.previsit_note}"
                  </p>
                )}
              </div>
            ))}
            
            {visits.length > 5 && (
              <button className="w-full text-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm py-2">
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
