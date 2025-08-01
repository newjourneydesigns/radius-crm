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
}

export default function CircleLeaderCard({ 
  leader, 
  isAdmin, 
  onToggleEventSummary, 
  onOpenContactModal,
  onLogConnection
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

  const handleLogConnection = () => {
    onLogConnection?.(leader.id, leader.name);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 border border-gray-100 dark:border-gray-700">
      <div className="p-6">
        {/* Header with Name and Status */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {leader.name || 'Unknown'}
            </h3>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[leader.status as keyof typeof statusColors] || statusColors['paused']}`}>
              {leader.status === 'off-boarding' ? 'Off-boarding' 
               : leader.status === 'follow-up' ? 'Follow Up'
               : leader.status ? leader.status.charAt(0).toUpperCase() + leader.status.slice(1)
               : 'Unknown'}
            </span>
          </div>
        </div>

        {/* Circle Information */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-4">
          <p className="text-gray-700 dark:text-gray-200 text-sm">
            {[
              leader.circle_type || '', 
              leader.day || '', 
              formatTimeToAMPM(leader.time), 
              leader.frequency || ''
            ].filter(Boolean).join(' • ') || 'Schedule not specified'}
          </p>
        </div>

        {/* Contact & CCB Profile */}
        <div className="grid grid-cols-1 gap-3 mb-4">
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
          
          {leader.ccb_profile_link && (
            <a 
              href={leader.ccb_profile_link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center justify-center px-4 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors text-sm font-medium"
            >
              CCB Profile
              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>

        {/* Last Note Preview */}
        <div className="mb-4">
          <div className="flex items-center text-gray-600 dark:text-gray-400 mb-2">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm font-medium">Last Note</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            {leader.last_note ? (
              <span className="block">
                {leader.last_note.content?.replace(/<[^>]*>/g, '').substring(0, 120)}
                {leader.last_note.content?.length > 120 ? '...' : ''}
              </span>
            ) : (
              <em>No notes yet</em>
            )}
          </p>
        </div>

        {/* Event Summary Checkbox */}
        <div className="mb-6">
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
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col space-y-3">
          <Link 
            href={`/circle/${leader.id}`}
            className="flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            View Profile
          </Link>
          
          <div className="grid grid-cols-2 gap-3">
            <Link 
              href={`/circle/${leader.id}#notes`}
              className="flex items-center justify-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-lg transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Add Note
            </Link>
            
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
          </div>
        </div>
      </div>
    </div>
  );
}
