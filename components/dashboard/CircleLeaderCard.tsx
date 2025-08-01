'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CircleLeader } from '../../lib/supabase';

// Helper function to format time to AM/PM
const formatTimeToAMPM = (time: string | undefined | null): string => {
  if (!time) return '';
  
  // If already in AM/PM format, return as is
  if (time.includes('AM') || time.includes('PM')) {
    return time;
  }
  
  // Convert 24-hour format to 12-hour format
  const [hours, minutes] = time.split(':');
  const hour24 = parseInt(hours);
  
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

interface CircleLeaderCardProps {
  leader: CircleLeader;
  isAdmin: boolean;
  onToggleEventSummary: (leaderId: number, isChecked: boolean) => void;
  onOpenContactModal: (leaderId: number, name: string, email: string, phone: string) => void;
  onLogConnection?: (leaderId: number, name: string) => void;
  onDelete?: (leaderId: number) => Promise<void>;
}

export default function CircleLeaderCard({ 
  leader, 
  isAdmin, 
  onToggleEventSummary, 
  onOpenContactModal,
  onLogConnection,
  onDelete
}: CircleLeaderCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const statusColors = {
    'invited': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
    'pipeline': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
    'follow-up': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
    'active': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
    'paused': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
    'off-boarding': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
  };

  const handleEventSummaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onToggleEventSummary(leader.id, e.target.checked);
  };

  const handleContactClick = () => {
    onOpenContactModal(leader.id, leader.name, leader.email || '', leader.phone || '');
  };

  const handleLogConnection = () => {
    onLogConnection?.(leader.id, leader.name);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    
    setIsDeleting(true);
    try {
      await onDelete(leader.id);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Error deleting circle leader:', error);
      // You might want to show an error message to the user here
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              {leader.name || 'Unknown'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {[
                leader.circle_type || '', 
                leader.day || '', 
                formatTimeToAMPM(leader.time), 
                leader.frequency || ''
              ].filter(Boolean).join(' → ') || 'Schedule not specified'}
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="mb-4">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[leader.status as keyof typeof statusColors] || statusColors['paused']}`}>
            {leader.status === 'off-boarding' ? 'Off-boarding' 
             : leader.status === 'follow-up' ? 'Follow Up'
             : leader.status ? leader.status.charAt(0).toUpperCase() + leader.status.slice(1)
             : 'Unknown'}
          </span>
        </div>

        {/* Contact Information */}
        {(leader.email || leader.phone) && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contact</p>
            <div className="flex space-x-2">
              <button 
                onClick={handleContactClick}
                className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-3 py-1 rounded hover:bg-blue-200 dark:hover:bg-blue-800 flex items-center"
              >
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
                </svg>
                Contact
              </button>
            </div>
          </div>
        )}

        {/* Last Note */}
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Last Note</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {leader.last_note ? (
              <span className="block truncate">
                {leader.last_note.content?.replace(/<[^>]*>/g, '').substring(0, 100)}
                {leader.last_note.content?.length > 100 ? '...' : ''}
              </span>
            ) : (
              'No notes yet'
            )}
          </p>
        </div>

        {/* Event Summary Checkbox */}
        <div className="mb-4">
          <div className="flex items-center">
            <input 
              type="checkbox" 
              id={`eventSummary_${leader.id}`}
              checked={leader.event_summary_received || false}
              onChange={handleEventSummaryChange}
              className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
            />
            <label htmlFor={`eventSummary_${leader.id}`} className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Event Summary
            </label>
          </div>
        </div>

        {/* Links */}
        <div className="flex space-x-2 mb-4">
          {leader.ccb_profile_link && (
            <a 
              href={leader.ccb_profile_link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              CCB Profile
              <svg className="ml-1 w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Link 
            href={`/circle/${leader.id}`}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            View Profile
          </Link>
          <Link 
            href={`/circle/${leader.id}#notes`}
            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Add Note
          </Link>
          {onLogConnection && (
            <button
              onClick={handleLogConnection}
              className="inline-flex items-center px-3 py-2 border border-green-300 dark:border-green-600 rounded-md shadow-sm text-sm font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Log Connection
            </button>
          )}
          {onDelete && isAdmin && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center px-3 py-2 border border-red-300 dark:border-red-600 rounded-md shadow-sm text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Delete Circle Leader
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to delete <span className="font-semibold">{leader.name}</span>? 
              This action cannot be undone and will also delete all associated notes.
            </p>
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
