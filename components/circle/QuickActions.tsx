/**
 * Quick Actions Component for Circle Leader Profile
 * Provides quick communication and follow-up actions
 */

import React, { useCallback, useMemo } from 'react';
import { CircleLeader } from '../../lib/supabase';
import { getFollowUpStatus, formatDateForDisplay } from '../../lib/dateUtils';

interface QuickActionsProps {
  leader: CircleLeader;
  isUpdatingEventSummary: boolean;
  isUpdatingFollowUp: boolean;
  onToggleEventSummary: () => Promise<boolean>;
  onToggleFollowUp: () => Promise<boolean>;
  onUpdateFollowUpDate: (date: string) => Promise<boolean>;
  onShowAlert: (alert: {
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }) => void;
  onShowLogConnectionModal: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = React.memo(({
  leader,
  isUpdatingEventSummary,
  isUpdatingFollowUp,
  onToggleEventSummary,
  onToggleFollowUp,
  onUpdateFollowUpDate,
  onShowAlert,
  onShowLogConnectionModal
}) => {
  // Memoized follow-up status
  const followUpStatus = useMemo(() => {
    return getFollowUpStatus(leader.follow_up_date);
  }, [leader.follow_up_date]);

  // Communication handlers
  const handleSendEmail = useCallback(() => {
    if (!leader?.email) {
      onShowAlert({
        isOpen: true,
        type: 'warning',
        title: 'No Email Address',
        message: 'No email address available for this leader.'
      });
      return;
    }
    
    const subject = `Circle Leader Communication - ${leader.name}`;
    const firstName = leader.name.split(' ')[0];
    const body = `Hi ${firstName}!`;
    const mailtoUrl = `mailto:${leader.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    window.open(mailtoUrl, '_blank');
  }, [leader, onShowAlert]);

  const handleSendSMS = useCallback(() => {
    if (!leader?.phone) {
      onShowAlert({
        isOpen: true,
        type: 'warning',
        title: 'No Phone Number',
        message: 'No phone number available for this leader.'
      });
      return;
    }
    
    // Clean phone number (remove formatting)
    const cleanPhone = leader.phone.replace(/\D/g, '');
    const firstName = leader.name.split(' ')[0];
    const message = `Hi ${firstName}!`;
    const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(message)}`;
    
    window.open(smsUrl, '_blank');
  }, [leader, onShowAlert]);

  const handleCallLeader = useCallback(() => {
    if (!leader?.phone) {
      onShowAlert({
        isOpen: true,
        type: 'warning',
        title: 'No Phone Number',
        message: 'No phone number available for this leader.'
      });
      return;
    }
    
    // Clean phone number (remove formatting)
    const cleanPhone = leader.phone.replace(/\D/g, '');
    const telUrl = `tel:${cleanPhone}`;
    
    window.open(telUrl, '_self');
  }, [leader, onShowAlert]);

  // Follow-up date change handler
  const handleFollowUpDateChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    await onUpdateFollowUpDate(newDate);
  }, [onUpdateFollowUpDate]);

  return (
    <div className="space-y-6">
      {/* Event Summary Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Event Summary</h2>
        </div>
        <div className="p-6">
          <button
            onClick={onToggleEventSummary}
            disabled={isUpdatingEventSummary}
            className="flex items-center w-full text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md p-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {leader.event_summary_received ? (
              <div className="flex items-center text-green-600 dark:text-green-400">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium">
                  {isUpdatingEventSummary ? 'Updating...' : 'Received'}
                </span>
              </div>
            ) : (
              <div className="flex items-center text-red-600 dark:text-red-400">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium">
                  {isUpdatingEventSummary ? 'Updating...' : 'Not Received'}
                </span>
              </div>
            )}
            <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
              Edit
            </span>
          </button>
        </div>
      </div>

      {/* Follow Up Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Follow Up</h2>
        </div>
        <div className="p-6 space-y-4">
          {/* Follow Up Toggle */}
          <button
            onClick={onToggleFollowUp}
            disabled={isUpdatingFollowUp}
            className="flex items-center w-full text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md p-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {leader.follow_up_required ? (
              <div className="flex items-center text-orange-600 dark:text-orange-400">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium">
                  {isUpdatingFollowUp ? 'Updating...' : 'Follow-Up Required'}
                </span>
              </div>
            ) : (
              <div className="flex items-center text-gray-600 dark:text-gray-400">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium">
                  {isUpdatingFollowUp ? 'Updating...' : 'No Follow-Up Needed'}
                </span>
              </div>
            )}
          </button>

          {/* Follow Up Date - Only show when follow-up is required */}
          {leader.follow_up_required && (
            <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
              <label htmlFor="followUpDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Follow-up Date
              </label>
              <input
                id="followUpDate"
                type="date"
                value={leader.follow_up_date || ''}
                onChange={handleFollowUpDateChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {leader.follow_up_date && (
                <div className={`mt-2 text-sm ${
                  followUpStatus.isOverdue 
                    ? 'text-red-600 dark:text-red-400 font-medium' 
                    : followUpStatus.isApproaching
                    ? 'text-yellow-600 dark:text-yellow-400 font-medium'
                    : 'text-green-600 dark:text-green-400'
                }`}>
                  <div className="flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {followUpStatus.isOverdue && 'Overdue'}
                    {followUpStatus.isApproaching && !followUpStatus.isOverdue && 'Due Soon'}
                    {!followUpStatus.isOverdue && !followUpStatus.isApproaching && 'Scheduled'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Quick Actions</h2>
        </div>
        <div className="p-6 space-y-3">
          <button 
            onClick={handleSendEmail}
            disabled={!leader?.email}
            className="w-full flex items-center justify-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Send Email
            {!leader?.email && <span className="ml-auto text-xs opacity-60">(No email)</span>}
          </button>
          <button 
            onClick={handleSendSMS}
            disabled={!leader?.phone}
            className="w-full flex items-center justify-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Send SMS
            {!leader?.phone && <span className="ml-auto text-xs opacity-60">(No phone)</span>}
          </button>
          <button 
            onClick={handleCallLeader}
            disabled={!leader?.phone}
            className="w-full flex items-center justify-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Call Leader
            {!leader?.phone && <span className="ml-auto text-xs opacity-60">(No phone)</span>}
          </button>
          <button 
            onClick={onShowLogConnectionModal}
            className="w-full flex items-center justify-center px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors font-medium text-sm"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Log Connection
          </button>
        </div>
      </div>
    </div>
  );
});

QuickActions.displayName = 'QuickActions';
