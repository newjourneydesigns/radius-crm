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
}

export default function CircleLeaderCard({ 
  leader, 
  isAdmin, 
  onToggleEventSummary, 
  onOpenContactModal 
}: CircleLeaderCardProps) {
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
        <div className="flex space-x-2">
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
        </div>
      </div>
    </div>
  );
}
