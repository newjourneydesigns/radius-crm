/**
 * Circle Leader Information Component
 * Displays and handles editing of basic circle leader information
 */

import React, { useState, useCallback, useMemo } from 'react';
import { CircleLeader } from '../../lib/supabase';
import { convertAMPMTo24Hour, formatTimeToAMPM } from '../../lib/timeUtilities';
import { STATUS_BADGE_COLORS, MEETING_DAYS, DEFAULT_LEADER_VALUES } from '../../lib/circleLeaderConstants';
import { validateUserInput } from '../../lib/validationUtils';

interface CircleInformationProps {
  leader: CircleLeader;
  isEditing: boolean;
  isSaving: boolean;
  error: string;
  campuses: Array<{id: number, value: string}>;
  directors: Array<{id: number, name: string}>;
  statuses: Array<{id: number, value: string}>;
  circleTypes: Array<{id: number, value: string}>;
  frequencies: Array<{id: number, value: string}>;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (leader: Partial<CircleLeader>) => Promise<boolean>;
  onDelete: () => void;
}

export const CircleInformation: React.FC<CircleInformationProps> = React.memo(({
  leader,
  isEditing,
  isSaving,
  error,
  campuses,
  directors,
  statuses,
  circleTypes,
  frequencies,
  onEdit,
  onCancel,
  onSave,
  onDelete
}) => {
  const [editedLeader, setEditedLeader] = useState<Partial<CircleLeader>>({});

  // Initialize edit form when editing starts
  React.useEffect(() => {
    if (isEditing) {
      setEditedLeader({
        name: leader.name,
        email: leader.email,
        phone: leader.phone,
        campus: leader.campus,
        acpd: leader.acpd,
        status: leader.status,
        day: leader.day,
        time: leader.time,
        frequency: leader.frequency,
        circle_type: leader.circle_type,
        follow_up_required: leader.follow_up_required,
        follow_up_date: leader.follow_up_date,
        ccb_profile_link: leader.ccb_profile_link
      });
    }
  }, [isEditing, leader]);

  // Memoized status badge color
  const statusBadgeColor = useMemo(() => {
    return STATUS_BADGE_COLORS[leader.status as keyof typeof STATUS_BADGE_COLORS] || 
           STATUS_BADGE_COLORS.default;
  }, [leader.status]);

  // Memoized status display text
  const statusDisplayText = useMemo(() => {
    if (leader.status === 'off-boarding') return 'Off-boarding';
    return leader.status ? leader.status.charAt(0).toUpperCase() + leader.status.slice(1) : 'Unknown';
  }, [leader.status]);

  // Handle field changes
  const handleFieldChange = useCallback((field: keyof CircleLeader, value: string | boolean) => {
    setEditedLeader(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  // Handle save action
  const handleSave = useCallback(async () => {
    const success = await onSave(editedLeader);
    if (success) {
      setEditedLeader({});
    }
  }, [editedLeader, onSave]);

  // Handle cancel action
  const handleCancel = useCallback(() => {
    setEditedLeader({});
    onCancel();
  }, [onCancel]);

  // Validation for save button
  const canSave = useMemo(() => {
    return validateUserInput(editedLeader.name, 'string') && !isSaving;
  }, [editedLeader.name, isSaving]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Circle Information</h2>
        <button
          onClick={isEditing ? handleCancel : onEdit}
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        >
          {isEditing ? 'Cancel' : 'Edit'}
        </button>
      </div>
      
      <div className="p-6">
        {error && (
          <div className="mb-4 flex items-center text-sm text-red-600 dark:text-red-400">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}
        
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Name Field */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</dt>
            <dd className="mt-1">
              {isEditing ? (
                <input
                  type="text"
                  value={editedLeader.name || ''}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                  className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter name"
                />
              ) : (
                <span className="text-sm text-gray-900 dark:text-white">{leader.name || 'Not provided'}</span>
              )}
            </dd>
          </div>

          {/* Email Field */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
            <dd className="mt-1">
              {isEditing ? (
                <input
                  type="email"
                  value={editedLeader.email || ''}
                  onChange={(e) => handleFieldChange('email', e.target.value)}
                  className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter email"
                />
              ) : (
                <span className="text-sm text-gray-900 dark:text-white">{leader.email || 'Not provided'}</span>
              )}
            </dd>
          </div>

          {/* Phone Field */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</dt>
            <dd className="mt-1">
              {isEditing ? (
                <input
                  type="tel"
                  value={editedLeader.phone || ''}
                  onChange={(e) => handleFieldChange('phone', e.target.value)}
                  className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter phone"
                />
              ) : (
                <span className="text-sm text-gray-900 dark:text-white">{leader.phone || 'Not provided'}</span>
              )}
            </dd>
          </div>

          {/* Campus Field */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Campus</dt>
            <dd className="mt-1">
              {isEditing ? (
                <select
                  value={editedLeader.campus || ''}
                  onChange={(e) => handleFieldChange('campus', e.target.value)}
                  className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Campus</option>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.value}>
                      {campus.value}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-gray-900 dark:text-white">{leader.campus || 'Not specified'}</span>
              )}
            </dd>
          </div>

          {/* Director Field */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Director</dt>
            <dd className="mt-1">
              {isEditing ? (
                <select
                  value={editedLeader.acpd || ''}
                  onChange={(e) => handleFieldChange('acpd', e.target.value)}
                  className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Director</option>
                  {directors.map((director) => (
                    <option key={director.id} value={director.name}>
                      {director.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-gray-900 dark:text-white">{leader.acpd || 'Not assigned'}</span>
              )}
            </dd>
          </div>

          {/* Status Field */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
            <dd className="mt-1">
              {isEditing ? (
                <select
                  value={editedLeader.status || 'active'}
                  onChange={(e) => handleFieldChange('status', e.target.value)}
                  className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {statuses.map((status) => (
                    <option key={status.id} value={status.value}>
                      {status.value.charAt(0).toUpperCase() + status.value.slice(1)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusBadgeColor}`}>
                  {statusDisplayText}
                </span>
              )}
            </dd>
          </div>

          {/* Circle Type Field */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Circle Type</dt>
            <dd className="mt-1">
              {isEditing ? (
                <select
                  value={editedLeader.circle_type || ''}
                  onChange={(e) => handleFieldChange('circle_type', e.target.value)}
                  className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Circle Type</option>
                  {circleTypes.map((type) => (
                    <option key={type.id} value={type.value}>
                      {type.value}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-gray-900 dark:text-white">{leader.circle_type || 'Not specified'}</span>
              )}
            </dd>
          </div>

          {/* Meeting Day Field */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Meeting Day</dt>
            <dd className="mt-1">
              {isEditing ? (
                <select
                  value={editedLeader.day || ''}
                  onChange={(e) => handleFieldChange('day', e.target.value)}
                  className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Day</option>
                  {MEETING_DAYS.map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-gray-900 dark:text-white">{leader.day || 'Not specified'}</span>
              )}
            </dd>
          </div>

          {/* Meeting Time Field */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Meeting Time</dt>
            <dd className="mt-1">
              {isEditing ? (
                <input
                  type="time"
                  value={leader.time?.includes('AM') || leader.time?.includes('PM') 
                    ? convertAMPMTo24Hour(leader.time) 
                    : editedLeader.time || ''}
                  onChange={(e) => handleFieldChange('time', e.target.value)}
                  className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              ) : (
                <span className="text-sm text-gray-900 dark:text-white">{formatTimeToAMPM(leader.time || '') || 'Not specified'}</span>
              )}
            </dd>
          </div>

          {/* Meeting Frequency Field */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Meeting Frequency</dt>
            <dd className="mt-1">
              {isEditing ? (
                <select
                  value={editedLeader.frequency || ''}
                  onChange={(e) => handleFieldChange('frequency', e.target.value)}
                  className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Frequency</option>
                  {frequencies.map((frequency) => (
                    <option key={frequency.id} value={frequency.value}>
                      {frequency.value}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-gray-900 dark:text-white">{leader.frequency || 'Not specified'}</span>
              )}
            </dd>
          </div>

          {/* CCB Profile Link Field */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">CCB Profile Link</dt>
            <dd className="mt-1">
              {isEditing ? (
                <input
                  type="url"
                  value={editedLeader.ccb_profile_link || ''}
                  onChange={(e) => handleFieldChange('ccb_profile_link', e.target.value)}
                  placeholder="https://example.ccbchurch.com/..."
                  className="w-full px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              ) : (
                <span className="text-sm text-gray-900 dark:text-white">
                  {leader.ccb_profile_link ? (
                    <a 
                      href={leader.ccb_profile_link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline"
                    >
                      View CCB Profile
                    </a>
                  ) : (
                    'Not specified'
                  )}
                </span>
              )}
            </dd>
          </div>
        </dl>
        
        {isEditing && (
          <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-3">
            <div className="flex space-x-3">
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? (
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </div>
                ) : 'Save Changes'}
              </button>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <div className="sm:ml-auto">
              <button
                onClick={onDelete}
                disabled={isSaving}
                className="px-4 py-2 border border-red-300 dark:border-red-600 rounded-md shadow-sm text-sm font-medium text-red-700 dark:text-red-400 bg-white dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 transition-colors"
              >
                <svg className="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H8a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Circle Leader
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

CircleInformation.displayName = 'CircleInformation';
