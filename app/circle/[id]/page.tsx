'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase, CircleLeader, Note } from '../../../lib/supabase';

export default function CircleLeaderProfilePage() {
  const params = useParams();
  const leaderId = parseInt(params.id as string);
  
  const [leader, setLeader] = useState<CircleLeader | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    // Load leader data from API
    const loadLeaderData = async () => {
      try {
        // Try to load from Supabase first
        const { data: leaderData, error: leaderError } = await supabase
          .from('circle_leaders')
          .select('*')
          .eq('id', leaderId)
          .single();

        if (leaderData && !leaderError) {
          setLeader(leaderData);
        } else {
          // Fallback to mock data if not found
          setLeader({
            id: leaderId,
            name: 'John Smith',
            email: 'john.smith@email.com',
            phone: '(555) 123-4567',
            campus: 'Downtown',
            acpd: 'Jane Doe',
            status: 'active',
            day: 'Tuesday',
            time: '19:00',
            frequency: 'Weekly',
            circle_type: "Men's Circle",
            event_summary_received: true,
            ccb_profile_link: 'https://example.com/profile'
          });
        }

        // Load notes
        const { data: notesData, error: notesError } = await supabase
          .from('notes')
          .select('*')
          .eq('circle_leader_id', leaderId)
          .order('created_at', { ascending: false });

        if (notesData && !notesError) {
          setNotes(notesData);
        } else {
          // Fallback to mock notes
          setNotes([
            {
              id: 1,
              circle_leader_id: leaderId,
              content: 'Great meeting last week. Good participation from the group.',
              created_at: '2024-01-15T10:30:00Z',
              created_by: 'Admin'
            },
            {
              id: 2,
              circle_leader_id: leaderId,
              content: 'Need to follow up on attendance next week.',
              created_at: '2024-01-20T14:15:00Z',
              created_by: 'Jane Doe'
            }
          ]);
        }
      } catch (error) {
        console.error('Error loading leader data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLeaderData();
  }, [leaderId]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    setIsSavingNote(true);
    try {
      // Save note via API
      const { data, error } = await supabase
        .from('notes')
        .insert([
          {
            circle_leader_id: leaderId,
            content: newNote,
            created_by: 'Current User' // TODO: Get from auth context
          }
        ])
        .select()
        .single();

      if (data && !error) {
        setNotes(prev => [data, ...prev]);
      } else {
        // Fallback to local state update
        const note: Note = {
          id: Date.now(),
          circle_leader_id: leaderId,
          content: newNote,
          created_at: new Date().toISOString(),
          created_by: 'Current User'
        };
        setNotes(prev => [note, ...prev]);
      }

      setNewNote('');
    } catch (error) {
      console.error('Error saving note:', error);
    } finally {
      setIsSavingNote(false);
    }
  };

  // Quick Action Handlers
  const handleSendEmail = () => {
    if (!leader?.email) {
      alert('No email address available for this leader.');
      return;
    }
    
    const subject = `Circle Leader Communication - ${leader.name}`;
    const firstName = leader.name.split(' ')[0];
    const body = `Hi ${firstName}!`;
    const mailtoUrl = `mailto:${leader.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    window.open(mailtoUrl, '_blank');
  };

  const handleSendSMS = () => {
    if (!leader?.phone) {
      alert('No phone number available for this leader.');
      return;
    }
    
    // Clean phone number (remove formatting)
    const cleanPhone = leader.phone.replace(/\D/g, '');
    const firstName = leader.name.split(' ')[0];
    const message = `Hi ${firstName}!`;
    const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(message)}`;
    
    window.open(smsUrl, '_blank');
  };

  const handleScheduleMeeting = () => {
    if (!leader?.email) {
      alert('No email address available for this leader.');
      return;
    }
    
    // Create a calendar event URL (Google Calendar format)
    const title = `Meeting with ${leader.name}`;
    const details = `Circle Leader meeting with ${leader.name}\nCircle Type: ${leader.circle_type || 'Not specified'}\nCampus: ${leader.campus || 'Not specified'}`;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7); // Schedule for next week
    startDate.setHours(10, 0, 0, 0); // 10 AM
    
    const endDate = new Date(startDate);
    endDate.setHours(11, 0, 0, 0); // 1 hour meeting
    
    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };
    
    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${formatDate(startDate)}/${formatDate(endDate)}&details=${encodeURIComponent(details)}&add=${encodeURIComponent(leader.email)}`;
    
    window.open(calendarUrl, '_blank');
  };

  const handleRemoveLeader = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('circle_leaders')
        .delete()
        .eq('id', leaderId);

      if (!error) {
        // Add a note about the removal
        await supabase
          .from('notes')
          .insert([
            {
              circle_leader_id: leaderId,
              content: `Circle Leader ${leader?.name} was removed from the system.`,
              created_by: 'System'
            }
          ]);

        // Redirect to dashboard
        window.location.href = '/dashboard';
      } else {
        console.error('Error removing leader:', error);
        alert('Failed to remove leader. Please try again.');
      }
    } catch (error) {
      console.error('Error removing leader:', error);
      alert('Failed to remove leader. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-8"></div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="space-y-4">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!leader) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Leader Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">The requested Circle Leader could not be found.</p>
          <a href="/dashboard" className="text-blue-600 dark:text-blue-400 hover:underline">
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <button
              onClick={() => window.history.back()}
              className="mr-4 p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{leader.name}</h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Circle Leader Profile
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Profile Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Basic Information</h2>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  {isEditing ? 'Cancel' : 'Edit'}
                </button>
              </div>
              <div className="p-6">
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{leader.email || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{leader.phone || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Campus</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{leader.campus || 'Not specified'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">ACPD</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{leader.acpd || 'Not assigned'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
                    <dd className="mt-1">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        leader.status === 'active' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                      }`}>
                        {leader.status || 'Unknown'}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Circle Type</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{leader.circle_type || 'Not specified'}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Meeting Information */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Meeting Information</h2>
              </div>
              <div className="p-6">
                <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Day</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{leader.day || 'Not scheduled'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Time</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{leader.time || 'Not scheduled'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Frequency</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{leader.frequency || 'Not specified'}</dd>
                  </div>
                </dl>

                {leader.ccb_profile_link && (
                  <div className="mt-6 flex space-x-3">
                    <a
                      href={leader.ccb_profile_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                    >
                      CCB Profile
                      <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Event Summary Status */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Event Summary</h2>
              </div>
              <div className="p-6">
                <div className="flex items-center">
                  {leader.event_summary_received ? (
                    <div className="flex items-center text-green-600 dark:text-green-400">
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm font-medium">Received</span>
                    </div>
                  ) : (
                    <div className="flex items-center text-red-600 dark:text-red-400">
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm font-medium">Not Received</span>
                    </div>
                  )}
                </div>
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
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Send Email
                  {!leader?.email && <span className="ml-auto text-xs text-gray-400">(No email)</span>}
                </button>
                <button 
                  onClick={handleSendSMS}
                  disabled={!leader?.phone}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Send SMS
                  {!leader?.phone && <span className="ml-auto text-xs text-gray-400">(No phone)</span>}
                </button>
                <button 
                  onClick={handleScheduleMeeting}
                  disabled={!leader?.email}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Schedule Meeting
                  {!leader?.email && <span className="ml-auto text-xs text-gray-400">(No email)</span>}
                </button>
                
                {/* Delete Confirmation */}
                {showDeleteConfirm ? (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                    <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                      Are you sure you want to remove this leader? This action cannot be undone.
                    </p>
                    <div className="flex space-x-2">
                      <button
                        onClick={handleRemoveLeader}
                        disabled={isDeleting}
                        className="px-3 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDeleting ? 'Removing...' : 'Yes, Remove'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isDeleting}
                        className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={handleRemoveLeader}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors flex items-center"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Remove Leader
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Notes Section */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Notes</h2>
          </div>
          <div className="p-6">
            {/* Add Note */}
            <div className="mb-6">
              <label htmlFor="newNote" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Add a note
              </label>
              <div className="flex space-x-3">
                <textarea
                  id="newNote"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={3}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your note here..."
                />
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || isSavingNote}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSavingNote ? 'Adding...' : 'Add Note'}
                </button>
              </div>
            </div>

            {/* Notes List */}
            <div className="space-y-4">
              {notes.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">No notes yet.</p>
              ) : (
                notes.map(note => (
                  <div key={note.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <p className="text-gray-900 dark:text-white">{note.content}</p>
                    <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      By {note.created_by} on {formatDateTime(note.created_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
