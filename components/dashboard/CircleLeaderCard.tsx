'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { CircleLeader } from '../../lib/supabase';
import FollowUpDateModal from './FollowUpDateModal';

// Constants
const STATUS_COLORS = {
  'invited': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
  'pipeline': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
  'active': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
  'paused': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
  'off-boarding': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
} as const;

const STATUS_OPTIONS = [
  { value: 'invited', label: 'Invited' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'off-boarding', label: 'Off-boarding' }
] as const;

const TIME_FORMAT_REGEX = /^(\d{1,2}):(\d{2})$/;
const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Utility Functions
const formatTimeToAMPM = (time: string | undefined | null): string => {
  if (!time || typeof time !== 'string') return '';
  
  // If already in AM/PM format, return as is
  if (time.includes('AM') || time.includes('PM')) {
    return time;
  }
  
  // Validate time format
  const match = time.match(TIME_FORMAT_REGEX);
  if (!match) return time;
  
  const [, hoursStr, minutes] = match;
  const hour24 = parseInt(hoursStr, 10);
  
  if (isNaN(hour24) || hour24 < 0 || hour24 > 23) return time;
  
  if (hour24 === 0) {
    return `12:${minutes} AM`;
  } else if (hour24 < 12) {
    return `${hour24}:${minutes} AM`;
  } else if (hour24 === 12) {
    return `12:${minutes} PM`;
  } else {
    return `${hour24 - 12}:${minutes} PM`;
  }
};

const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString || typeof dateString !== 'string') return '';
  
  try {
    // Validate date format
    const datePart = dateString.split('T')[0]; // Remove time part if present
    if (!DATE_FORMAT_REGEX.test(datePart)) return '';
    
    const [year, month, day] = datePart.split('-').map(Number);
    
    // Validate date components
    if (isNaN(year) || isNaN(month) || isNaN(day) || 
        year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
      return '';
    }
    
    const date = new Date(year, month - 1, day); // month is 0-indexed
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

const getFollowUpStatus = (dateString: string | undefined | null): { 
  isOverdue: boolean; 
  isApproaching: boolean; 
  daysUntil: number;
} => {
  if (!dateString || typeof dateString !== 'string') {
    return { isOverdue: false, isApproaching: false, daysUntil: 0 };
  }
  
  try {
    // Validate date format
    const datePart = dateString.split('T')[0]; // Remove time part if present
    if (!DATE_FORMAT_REGEX.test(datePart)) {
      return { isOverdue: false, isApproaching: false, daysUntil: 0 };
    }
    
    const [year, month, day] = datePart.split('-').map(Number);
    
    // Validate date components
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return { isOverdue: false, isApproaching: false, daysUntil: 0 };
    }
    
    const followUpDate = new Date(year, month - 1, day); // month is 0-indexed
    const today = new Date();
    
    // Reset time to compare just dates
    followUpDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    const diffTime = followUpDate.getTime() - today.getTime();
    const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      isOverdue: daysUntil < 0,
      isApproaching: daysUntil >= 0 && daysUntil <= 3, // Approaching if within 3 days
      daysUntil
    };
  } catch (error) {
    console.error('Error calculating follow-up status:', error);
    return { isOverdue: false, isApproaching: false, daysUntil: 0 };
  }
};

const validateLeaderData = (leader: CircleLeader): boolean => {
  return leader && typeof leader.id === 'number' && leader.id > 0;
};

const stripHtmlTags = (html: string): string => {
  return html.replace(/<[^>]*>/g, '');
};

// Type Definitions
interface CircleLeaderCardProps {
  leader: CircleLeader;
  isAdmin: boolean;
  onToggleEventSummary: (leaderId: number, isChecked: boolean) => void;
  onOpenContactModal: (leaderId: number, name: string, email: string, phone: string) => void;
  onLogConnection?: (leaderId: number, name: string) => void;
  onAddNote?: (leaderId: number, name: string) => void;
  onUpdateStatus?: (leaderId: number, newStatus: string, followUpDate?: string) => void;
  onToggleFollowUp?: (leaderId: number, isRequired: boolean) => void;
  onUpdateFollowUpDate?: (leaderId: number, followUpDate: string) => void;
  onClearFollowUp?: (leaderId: number, name: string) => void;
}

/**
 * Optimized CircleLeaderCard component with performance improvements and error handling
 * Features: Mobile/desktop responsive design, status management, follow-up functionality
 */
const CircleLeaderCard = memo(function CircleLeaderCard({ 
  leader, 
  isAdmin, 
  onToggleEventSummary, 
  onOpenContactModal,
  onLogConnection,
  onAddNote,
  onUpdateStatus,
  onToggleFollowUp,
  onUpdateFollowUpDate,
  onClearFollowUp
}: CircleLeaderCardProps) {
  // Validate leader data
  if (!validateLeaderData(leader)) {
    console.error('Invalid leader data:', leader);
    return null;
  }

  // Modal and UI state
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [editingFollowUpDate, setEditingFollowUpDate] = useState(false);

  // Memoized computed values
  const circleSchedule = useMemo(() => {
    const schedule = [
      leader.circle_type || '', 
      leader.day || '', 
      formatTimeToAMPM(leader.time), 
      leader.frequency || ''
    ].filter(Boolean).join(' • ');
    
    return schedule || 'Schedule not specified';
  }, [leader.circle_type, leader.day, leader.time, leader.frequency]);

  const followUpStatus = useMemo(() => 
    getFollowUpStatus(leader.follow_up_date), 
    [leader.follow_up_date]
  );

  const lastNotePreview = useMemo(() => {
    if (!leader.last_note?.content) return 'No notes yet';
    
    const stripped = stripHtmlTags(leader.last_note.content);
    return stripped.length > 150 ? `${stripped.substring(0, 150)}...` : stripped;
  }, [leader.last_note?.content]);

  const statusColor = useMemo(() => 
    STATUS_COLORS[leader.status as keyof typeof STATUS_COLORS] || STATUS_COLORS['paused'],
    [leader.status]
  );

  const statusLabel = useMemo(() => {
    if (leader.status === 'off-boarding') return 'Off-boarding';
    if (leader.status) return leader.status.charAt(0).toUpperCase() + leader.status.slice(1);
    return 'Unknown';
  }, [leader.status]);

  // Event handlers with validation
  const handleEventSummaryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!validateLeaderData(leader)) return;
    onToggleEventSummary(leader.id, e.target.checked);
  }, [leader, onToggleEventSummary]);

  const handleFollowUpChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!validateLeaderData(leader) || !onToggleFollowUp) return;
    onToggleFollowUp(leader.id, e.target.checked);
  }, [leader, onToggleFollowUp]);

  const handleContactClick = useCallback(() => {
    if (!validateLeaderData(leader)) return;
    onOpenContactModal(
      leader.id, 
      leader.name || 'Unknown', 
      leader.email || '', 
      leader.phone || ''
    );
  }, [leader, onOpenContactModal]);

  const handleLogConnection = useCallback(() => {
    if (!validateLeaderData(leader) || !onLogConnection) return;
    onLogConnection(leader.id, leader.name || 'Unknown');
  }, [leader, onLogConnection]);

  const handleAddNote = useCallback(() => {
    if (!validateLeaderData(leader) || !onAddNote) return;
    onAddNote(leader.id, leader.name || 'Unknown');
  }, [leader, onAddNote]);

  const handleClearFollowUp = useCallback(() => {
    if (!validateLeaderData(leader) || !onClearFollowUp) return;
    onClearFollowUp(leader.id, leader.name || 'Unknown');
  }, [leader, onClearFollowUp]);

  const handleStatusChange = useCallback((newStatus: string) => {
    if (!validateLeaderData(leader) || !onUpdateStatus) return;
    
    if (newStatus === 'follow-up') {
      // Show modal to collect follow-up date
      setPendingStatus(newStatus);
      setShowFollowUpModal(true);
    } else {
      // Update status immediately for non-follow-up statuses
      onUpdateStatus(leader.id, newStatus);
    }
    setShowStatusDropdown(false);
  }, [leader, onUpdateStatus]);

  const handleEditFollowUpDate = useCallback(() => {
    setEditingFollowUpDate(true);
    setShowFollowUpModal(true);
  }, []);

  const handleFollowUpDateConfirm = useCallback((followUpDate: string) => {
    if (!validateLeaderData(leader)) return;
    
    if (editingFollowUpDate && onUpdateFollowUpDate) {
      onUpdateFollowUpDate(leader.id, followUpDate);
      setEditingFollowUpDate(false);
    } else if (pendingStatus && onUpdateStatus) {
      onUpdateStatus(leader.id, pendingStatus, followUpDate);
      setPendingStatus(null);
    }
    setShowFollowUpModal(false);
  }, [leader, editingFollowUpDate, pendingStatus, onUpdateFollowUpDate, onUpdateStatus]);

  const handleFollowUpModalClose = useCallback(() => {
    setShowFollowUpModal(false);
    setPendingStatus(null);
    setEditingFollowUpDate(false);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showStatusDropdown) {
        setShowStatusDropdown(false);
      }
    };

    if (showStatusDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showStatusDropdown]);

  // Follow-up date status styling
  const followUpDateClassName = useMemo(() => {
    if (!leader.follow_up_date || leader.follow_up_date.trim() === '') {
      return 'text-gray-500 dark:text-gray-400';
    }
    
    if (followUpStatus.isOverdue) {
      return 'text-red-600 dark:text-red-400';
    } else if (followUpStatus.isApproaching) {
      return 'text-yellow-600 dark:text-yellow-400';
    } else {
      return 'text-orange-600 dark:text-orange-400';
    }
  }, [leader.follow_up_date, followUpStatus]);

  const followUpDateText = useMemo(() => {
    if (!leader.follow_up_date || leader.follow_up_date.trim() === '') {
      return 'Follow up: No date set';
    }
    
    const formattedDate = formatDate(leader.follow_up_date);
    if (!formattedDate) return 'Follow up: Invalid date';
    
    let suffix = '';
    if (followUpStatus.isOverdue) {
      suffix = ' (Overdue)';
    } else if (followUpStatus.isApproaching && !followUpStatus.isOverdue) {
      suffix = ' (Due Soon)';
    }
    
    return `Follow up: ${formattedDate}${suffix}`;
  }, [leader.follow_up_date, followUpStatus]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 border border-gray-100 dark:border-gray-700">
      <div className="p-4 sm:p-6">
        {/* Mobile Layout - Stacked */}
        <div className="block sm:hidden">
          {/* Header with Name and Status */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <Link 
                href={`/circle/${leader.id}`}
                className="block"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">
                  {leader.name || 'Unknown'}
                </h3>
              </Link>
              
              {/* Status moved under name */}
              <div className="flex flex-col space-y-2 mb-3">
                <div className="flex items-center space-x-2">
                  <div className="relative inline-block">
                    <button
                      onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-colors hover:opacity-80 ${statusColor}`}
                      aria-haspopup="true"
                      aria-expanded={showStatusDropdown}
                    >
                      {statusLabel}
                      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {showStatusDropdown && (
                      <div className="absolute top-full left-0 mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                        {STATUS_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => handleStatusChange(option.value)}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg transition-colors ${
                              leader.status === option.value 
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
                                : 'text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Separate Follow Up badge */}
                  {leader.follow_up_required && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-500 text-white">
                      Follow Up
                    </span>
                  )}
                </div>
                
                {/* Follow-up date under status */}
                {leader.follow_up_required && (
                  <div className={`flex items-center ${followUpDateClassName}`}>
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-medium">
                      {followUpDateText}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Circle Information */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-4">
            <p className="text-gray-700 dark:text-gray-200 text-sm">
              {circleSchedule}
            </p>
          </div>

          {/* Last Note Preview */}
          <div className="mb-4">
            <Link 
              href={`/circle/${leader.id}#notes`}
              className="flex items-center text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-2"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-medium">Notes</span>
            </Link>
            <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <em>{lastNotePreview}</em>
            </p>
          </div>

          {/* Action Buttons - Mobile */}
          <div className="flex flex-col space-y-2">
            <div className="grid grid-cols-1 gap-2">
              {onLogConnection && (
                <button
                  onClick={handleLogConnection}
                  className="flex items-center justify-center px-3 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors text-sm font-medium"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Log Connection
                </button>
              )}
              
              {onAddNote && (
                <button
                  onClick={handleAddNote}
                  className="flex items-center justify-center px-3 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors text-sm font-medium"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Add Note
                </button>
              )}
            </div>
            
            {/* Additional Buttons - Mobile */}
            <div className="grid grid-cols-1 gap-2">
              {(leader.email || leader.phone) && (
                <button 
                  onClick={handleContactClick}
                  className="flex items-center justify-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-sm font-medium"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
                  </svg>
                  Contact Info
                </button>
              )}
              
              {/* CCB Profile Link - Mobile */}
              {leader.ccb_profile_link && (
                <a 
                  href={leader.ccb_profile_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center px-4 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors text-sm font-medium"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View CCB Profile
                </a>
              )}
            </div>
          </div>

          {/* Checkboxes Section - Mobile */}
          <div className="mt-4 space-y-3">
            {/* Event Summary Checkbox */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  id={`eventSummary_${leader.id}`}
                  checked={leader.event_summary_received || false}
                  onChange={handleEventSummaryChange}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                />
                <label htmlFor={`eventSummary_${leader.id}`} className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Event Summary Received
                </label>
              </div>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                leader.event_summary_received 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}>
                {leader.event_summary_received ? '✓' : '○'}
              </span>
            </div>

            {/* Follow-Up Required Checkbox */}
            <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  id={`followUp_${leader.id}`}
                  checked={leader.follow_up_required || false}
                  onChange={handleFollowUpChange}
                  className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                />
                <label htmlFor={`followUp_${leader.id}`} className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Follow-Up
                </label>
              </div>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                leader.follow_up_required 
                  ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300' 
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}>
                {leader.follow_up_required ? '⚠' : '○'}
              </span>
            </div>

            {/* Follow-Up Date - Mobile */}
            {leader.follow_up_required && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg space-y-2">
                <button
                  onClick={handleEditFollowUpDate}
                  className="w-full text-left hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded-md p-2 transition-colors"
                >
                  <div className={`flex items-center justify-between ${followUpDateClassName}`}>
                    <div className="flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm font-medium">
                        {followUpDateText}
                      </span>
                    </div>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                </button>
                
                {/* Clear Follow-Up Button - Mobile */}
                {onClearFollowUp && (
                  <button
                    onClick={handleClearFollowUp}
                    className="w-full flex items-center justify-center px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors text-sm font-medium"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear Follow-Up
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Desktop/Tablet Layout - Horizontal */}
        <div className="hidden sm:block">
          <div className="flex items-start justify-between">
            {/* Left Section - Name, Status, Circle Info */}
            <div className="flex-1 min-w-0 pr-6">
              <Link 
                href={`/circle/${leader.id}`}
                className="block"
              >
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white truncate mb-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">
                  {leader.name || 'Unknown'}
                </h3>
              </Link>
              
              {/* Status under name */}
              <div className="flex items-center space-x-4 mb-2">
                <div className="flex items-center space-x-2">
                  <div className="relative inline-block">
                    <button
                      onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap transition-colors hover:opacity-80 ${statusColor}`}
                      aria-haspopup="true"
                      aria-expanded={showStatusDropdown}
                    >
                      {statusLabel}
                      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {showStatusDropdown && (
                      <div className="absolute top-full left-0 mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                        {STATUS_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => handleStatusChange(option.value)}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg transition-colors ${
                              leader.status === option.value 
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
                                : 'text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Separate Follow Up badge */}
                  {leader.follow_up_required && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-500 text-white whitespace-nowrap">
                      Follow Up
                    </span>
                  )}
                </div>
              </div>
              
              {/* Follow-up Date under status */}
              {leader.follow_up_required && (
                <div className="mb-2 space-y-1">
                  <button
                    onClick={handleEditFollowUpDate}
                    className="flex items-center hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-md p-1 -ml-1 transition-colors group"
                  >
                    <div className={`flex items-center ${followUpDateClassName}`}>
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm font-medium">
                        {followUpDateText}
                      </span>
                      <svg className="w-3 h-3 ml-1 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                  </button>
                  
                  {/* Clear Follow-Up Button - Desktop */}
                  {onClearFollowUp && (
                    <button
                      onClick={handleClearFollowUp}
                      className="flex items-center px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors text-xs font-medium -ml-1"
                    >
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear
                    </button>
                  )}
                </div>
              )}
              
              <div className="text-gray-700 dark:text-gray-200 text-sm mb-3">
                {circleSchedule}
              </div>
            </div>

            {/* Middle Section - Last Note */}
            <div className="flex-1 min-w-0 px-6">
              <Link 
                href={`/circle/${leader.id}#notes`}
                className="flex items-center text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-2"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-medium">Last Note</span>
              </Link>
              <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <em>{lastNotePreview}</em>
              </p>
            </div>

            {/* Right Section - Action Buttons and Checkboxes */}
            <div className="flex flex-col items-end flex-shrink-0 space-y-4">
              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                {onLogConnection && (
                  <button
                    onClick={handleLogConnection}
                    className="flex items-center px-3 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors text-sm font-medium whitespace-nowrap"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Log Connection
                  </button>
                )}
                
                {onAddNote && (
                  <button
                    onClick={handleAddNote}
                    className="flex items-center px-3 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors text-sm font-medium whitespace-nowrap"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Add Note
                  </button>
                )}
                
                {(leader.email || leader.phone) && (
                  <button 
                    onClick={handleContactClick}
                    className="flex items-center px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-sm font-medium whitespace-nowrap"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
                    </svg>
                    Contact
                  </button>
                )}
                
                {/* CCB Profile Link */}
                {leader.ccb_profile_link && (
                  <a 
                    href={leader.ccb_profile_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-3 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors text-sm font-medium whitespace-nowrap"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    CCB
                  </a>
                )}
              </div>

              {/* Checkboxes Section - Desktop */}
              <div className="space-y-2 min-w-0">
                {/* Event Summary Checkbox */}
                <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg min-w-[240px]">
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      id={`eventSummary_${leader.id}_desktop`}
                      checked={leader.event_summary_received || false}
                      onChange={handleEventSummaryChange}
                      className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                    />
                    <label htmlFor={`eventSummary_${leader.id}_desktop`} className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Event Summary Received
                    </label>
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    leader.event_summary_received 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {leader.event_summary_received ? '✓' : '○'}
                  </span>
                </div>

                {/* Follow-Up Required Checkbox */}
                <div className="flex items-center justify-between p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg min-w-[240px]">
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      id={`followUp_${leader.id}_desktop`}
                      checked={leader.follow_up_required || false}
                      onChange={handleFollowUpChange}
                      className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                    />
                    <label htmlFor={`followUp_${leader.id}_desktop`} className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Follow-Up
                    </label>
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    leader.follow_up_required 
                      ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300' 
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {leader.follow_up_required ? '⚠' : '○'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Follow-Up Date Modal */}
      <FollowUpDateModal
        isOpen={showFollowUpModal}
        onClose={handleFollowUpModalClose}
        onConfirm={handleFollowUpDateConfirm}
        leaderName={leader.name || 'Unknown'}
        existingDate={editingFollowUpDate ? leader.follow_up_date : undefined}
        isEditing={editingFollowUpDate}
      />
    </div>
  );
});

export default CircleLeaderCard;
