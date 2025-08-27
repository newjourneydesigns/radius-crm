'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

interface FollowUpLeader {
  id: number;
  name: string;
  campus: string;
  status: string;
  follow_up_date: string | null;
  last_note: {
    content: string;
    created_at: string;
  } | null;
}

interface FollowUpTableProps {
  selectedCampuses: string[];
  onAddNote?: (leaderId: number, name: string) => void;
  onClearFollowUp?: (leaderId: number, name: string) => void;
  refreshKey?: number;
}

const STATUS_MAP = {
  'active': { label: 'Active', color: 'text-green-600 dark:text-green-400' },
  'invited': { label: 'Invited', color: 'text-blue-600 dark:text-blue-400' },
  'pipeline': { label: 'Pipeline', color: 'text-indigo-600 dark:text-indigo-400' },
  'paused': { label: 'Paused', color: 'text-yellow-600 dark:text-yellow-400' },
  'off-boarding': { label: 'Off-boarding', color: 'text-red-600 dark:text-red-400' }
} as const;

export default function FollowUpTable({ 
  selectedCampuses, 
  onAddNote, 
  onClearFollowUp,
  refreshKey 
}: FollowUpTableProps) {
  const [followUpLeaders, setFollowUpLeaders] = useState<FollowUpLeader[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'follow_up_date' | 'last_note_date'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isVisible, setIsVisible] = useState(() => {
    try {
      const saved = localStorage.getItem('followUpTableVisible');
      return saved !== 'false';
    } catch {
      return true;
    }
  });

  const loadFollowUpLeaders = useCallback(async () => {
    if (!selectedCampuses || selectedCampuses.length === 0) {
      setFollowUpLeaders([]);
      return;
    }

    // Validate campus inputs
    const validCampuses = selectedCampuses.filter(campus => 
      typeof campus === 'string' && campus.trim().length > 0
    );
    
    if (validCampuses.length === 0) {
      setFollowUpLeaders([]);
      return;
    }

    setIsLoading(true);
    try {
      // Load circle leaders with follow-up status from selected campuses
      const { data: leaders, error: leadersError } = await supabase
        .from('circle_leaders')
        .select('id, name, campus, status, follow_up_date')
        .eq('follow_up_required', true)
        .in('campus', validCampuses)
        .order('name');

      if (leadersError) {
        console.error('Error loading follow-up leaders:', leadersError);
        setFollowUpLeaders([]);
        return;
      }

      if (!leaders || leaders.length === 0) {
        setFollowUpLeaders([]);
        return;
      }

      // Validate leader IDs before querying notes
      const validLeaderIds = leaders
        .filter(leader => leader.id && typeof leader.id === 'number')
        .map(leader => leader.id);

      if (validLeaderIds.length === 0) {
        setFollowUpLeaders(leaders.map(leader => ({
          ...leader,
          last_note: null
        })));
        return;
      }

      // Get the latest note for each leader
      const { data: notes, error: notesError } = await supabase
        .from('notes')
        .select('circle_leader_id, content, created_at')
        .in('circle_leader_id', validLeaderIds)
        .order('created_at', { ascending: false });

      if (notesError) {
        console.error('Error loading notes for follow-up leaders:', notesError);
      }

      // Combine leaders with their latest notes
      const leadersWithNotes = leaders.map(leader => {
        const latestNote = notes?.find(note => note.circle_leader_id === leader.id) || null;
        return {
          id: leader.id,
          name: leader.name || 'Unknown',
          campus: leader.campus || 'Unknown',
          status: leader.status || 'unknown',
          follow_up_date: leader.follow_up_date,
          last_note: latestNote ? {
            content: latestNote.content || '',
            created_at: latestNote.created_at
          } : null
        };
      });

      setFollowUpLeaders(leadersWithNotes);
    } catch (error) {
      console.error('Error loading follow-up data:', error);
      setFollowUpLeaders([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCampuses]);

  // Load data when campuses change or refresh is triggered
  useEffect(() => {
    loadFollowUpLeaders();
  }, [selectedCampuses, refreshKey, loadFollowUpLeaders]);

  const toggleVisibility = () => {
    const newVisible = !isVisible;
    setIsVisible(newVisible);
    localStorage.setItem('followUpTableVisible', newVisible.toString());
  };

  // Sorting functions
  const handleSort = (field: 'name' | 'follow_up_date' | 'last_note_date') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedFollowUpLeaders = useMemo(() => {
    return [...followUpLeaders].sort((a, b) => {
      let aValue: string | Date | null = null;
      let bValue: string | Date | null = null;

      switch (sortField) {
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'follow_up_date':
          aValue = a.follow_up_date ? new Date(a.follow_up_date) : null;
          bValue = b.follow_up_date ? new Date(b.follow_up_date) : null;
          break;
        case 'last_note_date':
          aValue = a.last_note?.created_at ? new Date(a.last_note.created_at) : null;
          bValue = b.last_note?.created_at ? new Date(b.last_note.created_at) : null;
          break;
      }

      // Handle null values
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return sortDirection === 'asc' ? 1 : -1;
      if (bValue === null) return sortDirection === 'asc' ? -1 : 1;

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [followUpLeaders, sortField, sortDirection]);

  const getStatusInfo = (status: string) => {
    return STATUS_MAP[status as keyof typeof STATUS_MAP] || { 
      label: status.charAt(0).toUpperCase() + status.slice(1), 
      color: 'text-gray-600 dark:text-gray-400' 
    };
  };

  const formatDateDisplay = (dateString: string | null): string => {
    if (!dateString) return 'No date set';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const isFollowUpDateOverdue = (dateString: string | null): boolean => {
    if (!dateString) return false;
    try {
      const followUpDate = new Date(dateString);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return followUpDate < today;
    } catch {
      return false;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900 rounded-md flex items-center justify-center mr-3">
              <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Follow Up Required</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedCampuses.length === 0 
                  ? 'Select a campus to view follow-up leaders'
                  : isVisible 
                    ? `Circle Leaders requiring follow-up (${followUpLeaders.length})`
                    : `${followUpLeaders.length} Circle Leader${followUpLeaders.length !== 1 ? 's' : ''} requiring follow-up`
                }
              </p>
            </div>
          </div>
          <button
            onClick={toggleVisibility}
            className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {isVisible ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {isVisible && (
        <div className="p-6">
          {selectedCampuses.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400 dark:text-gray-500 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                </svg>
              </div>
              <p className="text-gray-500 dark:text-gray-400">Select a campus in the filters above to view follow-up leaders</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
              <span className="ml-2 text-gray-600 dark:text-gray-400">Loading follow-up data...</span>
            </div>
          ) : followUpLeaders.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-green-400 dark:text-green-500 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <p className="text-gray-500 dark:text-gray-400">No follow-up required for leaders in selected campus(es)</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-hidden border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th 
                          onClick={() => handleSort('name')}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        >
                          <div className="flex items-center">
                            Circle Leader
                            {sortField === 'name' && (
                              <svg 
                                className={`w-4 h-4 ml-1 transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                              </svg>
                            )}
                          </div>
                        </th>
                        <th 
                          onClick={() => handleSort('follow_up_date')}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        >
                          <div className="flex items-center">
                            Follow Up Date
                            {sortField === 'follow_up_date' && (
                              <svg 
                                className={`w-4 h-4 ml-1 transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                              </svg>
                            )}
                          </div>
                        </th>
                        <th 
                          onClick={() => handleSort('last_note_date')}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        >
                          <div className="flex items-center">
                            Last Note
                            {sortField === 'last_note_date' && (
                              <svg 
                                className={`w-4 h-4 ml-1 transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                              </svg>
                            )}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                      {sortedFollowUpLeaders.map((leader) => (
                        <tr key={leader.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium">
                                <Link
                                  href={`/circle/${leader.id}`}
                                  className="text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer text-left font-semibold"
                                >
                                  {leader.name}
                                </Link>
                              </div>
                              <div className={`text-sm ${getStatusInfo(leader.status).color}`}>
                                {getStatusInfo(leader.status).label}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {formatDateDisplay(leader.follow_up_date)}
                            </div>
                            {leader.follow_up_date && (
                              <div className={`text-xs ${
                                isFollowUpDateOverdue(leader.follow_up_date)
                                  ? 'text-red-500 dark:text-red-400' 
                                  : 'text-green-500 dark:text-green-400'
                              }`}>
                                {isFollowUpDateOverdue(leader.follow_up_date) ? 'Overdue' : 'Upcoming'}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {leader.last_note ? (
                              <div>
                                <div className="text-sm text-gray-900 dark:text-white mb-1 line-clamp-2">
                                  {leader.last_note.content.substring(0, 100)}
                                  {leader.last_note.content.length > 100 && '...'}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatDateDisplay(leader.last_note.created_at)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-gray-500">No notes</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex space-x-2">
                              {onAddNote && (
                                <button
                                  onClick={() => onAddNote(leader.id, leader.name)}
                                  className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                                  title="Add Note"
                                >
                                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  Note
                                </button>
                              )}
                              
                              {onClearFollowUp && (
                                <button
                                  onClick={() => onClearFollowUp(leader.id, leader.name)}
                                  className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors"
                                  title="Clear Follow-Up"
                                >
                                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  Clear
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="sm:hidden space-y-4">
                {sortedFollowUpLeaders.map((leader) => (
                  <div key={leader.id} className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 shadow-sm">
                    {/* Header - Leader Name and Status */}
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <Link
                          href={`/circle/${leader.id}`}
                          className="text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer text-left text-lg font-semibold"
                        >
                          {leader.name}
                        </Link>
                        <div className={`text-sm ${getStatusInfo(leader.status).color} mt-1`}>
                          {getStatusInfo(leader.status).label}
                        </div>
                      </div>
                    </div>

                    {/* Follow Up Date */}
                    <div className="mb-3">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                        Follow Up Date
                      </div>
                      <div className="text-sm text-gray-900 dark:text-white">
                        {formatDateDisplay(leader.follow_up_date)}
                      </div>
                      {leader.follow_up_date && (
                        <div className={`text-xs ${
                          isFollowUpDateOverdue(leader.follow_up_date)
                            ? 'text-red-500 dark:text-red-400' 
                            : 'text-green-500 dark:text-green-400'
                        }`}>
                          {isFollowUpDateOverdue(leader.follow_up_date) ? 'Overdue' : 'Upcoming'}
                        </div>
                      )}
                    </div>

                    {/* Last Note */}
                    <div className="mb-3">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                        Last Note
                      </div>
                      {leader.last_note ? (
                        <div>
                          <div className="text-sm text-gray-900 dark:text-white mb-1">
                            {leader.last_note.content.substring(0, 150)}
                            {leader.last_note.content.length > 150 && '...'}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDateDisplay(leader.last_note.created_at)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 dark:text-gray-500">No notes</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex space-x-2">
                      {onAddNote && (
                        <button
                          onClick={() => onAddNote(leader.id, leader.name)}
                          className="flex-1 inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                          title="Add Note"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Add Note
                        </button>
                      )}
                      
                      {onClearFollowUp && (
                        <button
                          onClick={() => onClearFollowUp(leader.id, leader.name)}
                          className="flex-1 inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors"
                          title="Clear Follow-Up"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Clear Follow-Up
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
