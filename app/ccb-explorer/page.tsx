'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../components/ProtectedRoute';
import EventSummaryFollowUpModal from '../../components/modals/EventSummaryFollowUpModal';
import CircleSummaryModal from '../../components/modals/CircleSummaryModal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface EventData {
  eventId: string;
  title: string;
  date: string;
  link: string;
  notes: string | null;
  prayerRequests: string | null;
  topic: string | null;
  headCount: number | null;
  didNotMeet: boolean;
  attendees: Array<{
    id?: string;
    name?: string;
    status?: string;
  }>;
}

export default function CCBExplorerPage() {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventData[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleFetchData = async () => {
    if (!startDate || !groupName) {
      setError('Please enter a start date and group name');
      return;
    }

    // Default end date to start date if not set (single day)
    const effectiveEnd = endDate || startDate;

    // Validate range
    if (effectiveEnd < startDate) {
      setError('End date must be on or after start date');
      return;
    }

    // Build list of dates in range
    const dates: string[] = [];
    const current = new Date(startDate + 'T00:00:00');
    const last = new Date(effectiveEnd + 'T00:00:00');
    while (current <= last) {
      dates.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }

    // Safety cap
    if (dates.length > 90) {
      setError('Date range too large. Please select 90 days or fewer.');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError(null);
    setEvents([]);
    setHasSearched(true);
    setProgress(`Fetching day 1 of ${dates.length}...`);

    const allEvents: EventData[] = [];
    const errors: string[] = [];

    try {
      for (let i = 0; i < dates.length; i++) {
        if (abortController.signal.aborted) return;

        setProgress(`Fetching day ${i + 1} of ${dates.length}...`);

        try {
          const response = await fetch('/api/ccb/event-attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dates[i], groupName }),
            signal: abortController.signal,
          });

          const result = await response.json().catch(() => ({} as any));

          if (!response.ok) {
            const parts = [result?.error || 'Failed to fetch data'];
            if (result?.hint) parts.push(result.hint);
            errors.push(`${dates[i]}: ${parts.join(' ')}`);
            continue;
          }

          if (result.data?.length) {
            allEvents.push(...result.data);
            // Update results incrementally
            setEvents([...allEvents]);
          }
        } catch (dayErr: any) {
          if (dayErr.name === 'AbortError') return;
          errors.push(`${dates[i]}: ${dayErr.message}`);
        }
      }

      setEvents(allEvents);

      if (errors.length > 0 && allEvents.length === 0) {
        setError(`Failed for all dates:\n${errors.join('\n')}`);
      } else if (errors.length > 0) {
        setError(`Some dates had errors: ${errors.join('; ')}`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'An error occurred while fetching data');
    } finally {
      if (abortController === abortControllerRef.current) {
        setLoading(false);
        setProgress('');
        abortControllerRef.current = null;
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleFetchData();
    }
  };

  const handleCopyAll = async () => {
    if (events.length === 0) return;

    const text = events.map((event) => {
      const lines: string[] = [];
      lines.push(event.title);

      if (event.date) {
        try {
          const d = new Date(event.date + 'T00:00:00');
          if (!isNaN(d.getTime())) {
            lines.push(d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
          } else {
            lines.push(`Date: ${event.date}`);
          }
        } catch {
          lines.push(`Date: ${event.date}`);
        }
      }

      lines.push(`Event ID: ${event.eventId}`);
      if (event.didNotMeet) lines.push('⚠️ Meeting did not occur');
      if (event.headCount !== null) lines.push(`Head Count: ${event.headCount}`);
      if (event.attendees.length > 0) lines.push(`Attendees Recorded: ${event.attendees.length}`);
      if (event.topic) lines.push(`\nTopic:\n${event.topic}`);
      if (event.notes) lines.push(`\nNotes:\n${event.notes}`);
      if (event.prayerRequests) lines.push(`\nPrayer Requests:\n${event.prayerRequests}`);

      if (event.attendees.length > 0) {
        const names = event.attendees.map((a) => {
          let n = a.name || 'Unknown';
          if (a.status && a.status !== 'Present') n += ` (${a.status})`;
          return n;
        });
        lines.push(`\nAttendees:\n${names.join(', ')}`);
      }

      return lines.join('\n');
    }).join('\n\n---\n\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSummarize = async () => {
    if (events.length === 0) return;
    setSummaryText(null);
    setSummaryError(null);
    setIsSummarizing(true);
    setSummaryModalOpen(true);

    try {
      const response = await fetch('/api/ccb/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events,
          startDate,
          endDate: endDate || startDate,
          groupName,
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        setSummaryError(result.error || 'Failed to generate summary. Please try again.');
      } else {
        setSummaryText(result.summary);
      }
    } catch (err: any) {
      setSummaryError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleOpenFollowUpModal = (event: EventData) => {
    setSelectedEvent(event);
    setShowFollowUpModal(true);
    setSaveSuccess(null);
  };

  const handleSaveFollowUp = async (message: string) => {
    if (!selectedEvent || !user?.id) {
      throw new Error('User must be authenticated');
    }

    try {
      // Find the circle leader by matching the event title to leader name
      // The event title typically contains the leader name
      const { data: leaders, error: searchError } = await supabase
        .from('circle_leaders')
        .select('id, name')
        .ilike('name', `%${selectedEvent.title}%`)
        .limit(5);

      if (searchError) throw searchError;

      // If we can't find an exact match, try a more flexible search
      let matchedLeader = leaders && leaders.length > 0 ? leaders[0] : null;

      if (!matchedLeader) {
        // Try extracting just the first part of the name before any parentheses
        const baseName = selectedEvent.title.split('(')[0].trim();
        const { data: leaders2, error: searchError2 } = await supabase
          .from('circle_leaders')
          .select('id, name')
          .ilike('name', `%${baseName}%`)
          .limit(5);

        if (searchError2) throw searchError2;
        matchedLeader = leaders2 && leaders2.length > 0 ? leaders2[0] : null;
      }

      if (!matchedLeader) {
        throw new Error(`Could not find circle leader matching "${selectedEvent.title}". Please ensure the leader exists in the system.`);
      }

      // Save the note to the circle leader's profile
      const { error: noteError } = await supabase
        .from('notes')
        .insert({
          circle_leader_id: matchedLeader.id,
          content: message,
          created_by: user.id
        });

      if (noteError) throw noteError;

      // Show success message
      setSaveSuccess(`Follow-up saved to ${matchedLeader.name}'s profile`);
      setTimeout(() => setSaveSuccess(null), 5000);
    } catch (error: any) {
      console.error('Error saving follow-up:', error);
      throw error;
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center space-x-3 mb-4">
              <Link
                href="/dashboard"
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                CCB Event Explorer
              </h1>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Search CCB events by date range and group name to view attendance, notes, topics, and prayer requests.
            </p>
          </div>

          {/* Search Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 sm:p-6 mb-6">
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    // Auto-set end date if empty or before new start
                    if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                  }}
                  onKeyPress={handleKeyPress}
                  style={{ maxWidth: '100%', minWidth: 0 }}
                  className="w-full px-4 py-3 border border-gray-300/30 dark:border-gray-600/30 rounded-xl shadow-sm bg-white/50 dark:bg-gray-700/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 backdrop-blur-sm transition-all duration-200"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End Date <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  onKeyPress={handleKeyPress}
                  style={{ maxWidth: '100%', minWidth: 0 }}
                  className="w-full px-4 py-3 border border-gray-300/30 dark:border-gray-600/30 rounded-xl shadow-sm bg-white/50 dark:bg-gray-700/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 backdrop-blur-sm transition-all duration-200"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="e.g., LVT | S1"
                  className="w-full px-4 py-3 border border-gray-300/30 dark:border-gray-600/30 rounded-xl shadow-sm bg-white/50 dark:bg-gray-700/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 backdrop-blur-sm transition-all duration-200"
                  disabled={loading}
                />
              </div>
            </div>

            <button
              onClick={handleFetchData}
              disabled={loading || !startDate || !groupName}
              className="w-full px-4 py-3 bg-blue-600/90 hover:bg-blue-600 text-white rounded-xl font-medium text-sm tracking-tight transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {progress || 'Fetching Data...'}
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Fetch Data
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {/* Success */}
          {saveSuccess && (
            <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {saveSuccess}
            </div>
          )}

          {/* Empty State */}
          {hasSearched && !loading && events.length === 0 && !error && (
            <div className="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 rounded-lg flex items-center gap-2 mb-4">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              No events found for this date range and group
            </div>
          )}

          {/* Results */}
          {events.length > 0 && (
            <div className="space-y-4">
              {/* Copy All Button */}
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {events.length} event{events.length !== 1 ? 's' : ''} found
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSummarize}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 bg-purple-600 hover:bg-purple-700 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    Analyze
                  </button>
                <button
                  onClick={handleCopyAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                >
                  {copied ? (
                    <>
                      <svg className="h-3.5 w-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy All
                    </>
                  )}
                </button>
                </div>
              </div>

              {/* Event Cards */}
              {events.map((event, index) => (
                <div
                  key={`${event.eventId}-${index}`}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
                >
                  {/* Event Header */}
                  <div className="bg-blue-600 dark:bg-blue-700 px-4 py-3">
                    <h3 className="text-base font-semibold text-white">
                      {event.title}
                    </h3>
                    <div className="text-sm text-blue-100 mt-1">
                      {(() => {
                        try {
                          const dateStr = event.date;
                          if (!dateStr) return 'Date not available';
                          const d = new Date(dateStr + 'T00:00:00');
                          if (isNaN(d.getTime())) return `Date: ${dateStr}`;
                          return d.toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          });
                        } catch {
                          return `Date: ${event.date || 'Unknown'}`;
                        }
                      })()}{' '}
                      • Event ID: {event.eventId}
                    </div>
                  </div>

                  {/* Event Content */}
                  <div className="p-4 space-y-3">
                    {event.didNotMeet && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/30 rounded-lg px-3 py-2">
                        <p className="text-sm text-yellow-800 dark:text-yellow-300 font-medium">
                          ⚠️ Meeting did not occur
                        </p>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                      {event.headCount !== null && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          {event.headCount} {event.headCount === 1 ? 'person' : 'people'}
                        </span>
                      )}
                      {event.attendees.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                          {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''} recorded
                        </span>
                      )}
                    </div>

                    {/* Topic */}
                    {event.topic && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Topic</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                          {event.topic}
                        </p>
                      </div>
                    )}

                    {/* Notes */}
                    {event.notes && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 whitespace-pre-wrap">
                          {event.notes}
                        </p>
                      </div>
                    )}

                    {/* Prayer Requests */}
                    {event.prayerRequests && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prayer Requests</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 whitespace-pre-wrap">
                          {event.prayerRequests}
                        </p>
                      </div>
                    )}

                    {/* Attendees */}
                    {event.attendees.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Attendees ({event.attendees.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {event.attendees.map((attendee, idx) => (
                            <span
                              key={attendee.id || idx}
                              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100/10 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200/20 dark:border-blue-800/30"
                            >
                              {attendee.name}
                              {attendee.status && attendee.status !== 'Present' && (
                                <span className="ml-1 text-gray-500 dark:text-gray-400">
                                  ({attendee.status})
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty State within Event */}
                    {!event.topic && !event.notes && !event.prayerRequests && event.attendees.length === 0 && !event.didNotMeet && (
                      <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 italic">
                        No additional details recorded for this event
                      </div>
                    )}

                    {/* Event Summary Follow Up Button */}
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => handleOpenFollowUpModal(event)}
                        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Event Summary Follow Up
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Event Summary Follow Up Modal */}
      {selectedEvent && (
        <EventSummaryFollowUpModal
          isOpen={showFollowUpModal}
          onClose={() => {
            setShowFollowUpModal(false);
            setSelectedEvent(null);
          }}
          leaderName={selectedEvent.title}
          eventTitle={selectedEvent.title}
          eventDate={selectedEvent.date}
          onSave={handleSaveFollowUp}
        />
      )}

      {/* Circle Summary Modal */}
      <CircleSummaryModal
        isOpen={summaryModalOpen}
        onClose={() => setSummaryModalOpen(false)}
        summary={summaryText}
        isLoading={isSummarizing}
        error={summaryError}
        startDate={startDate}
        endDate={endDate || startDate}
        groupName={groupName}
        eventCount={events.length}
      />
    </ProtectedRoute>
  );
}
