'use client';

import React, { useState, useRef, useEffect } from 'react';
import Modal from '../ui/Modal';

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

interface EventExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string;
  initialGroupName?: string;
  ccbProfileLink?: string | null;
}

export default function EventExplorerModal({
  isOpen,
  onClose,
  initialDate = '',
  initialGroupName = '',
  ccbProfileLink = null,
}: EventExplorerModalProps) {
  const [date, setDate] = useState(initialDate);
  const [groupName, setGroupName] = useState(initialGroupName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventData[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Update state when modal opens with new initial values
  useEffect(() => {
    if (isOpen) {
      setDate(initialDate);
      setGroupName(initialGroupName);
      setError(null);
      setEvents([]);
      setHasSearched(false);
    }
  }, [isOpen, initialDate, initialGroupName]);

  // Cancel any pending requests when modal closes
  useEffect(() => {
    if (!isOpen && abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
    }
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleFetchData = async () => {
    if (!date || !groupName) {
      setError('Please enter both date and group name');
      return;
    }

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError(null);
    setEvents([]);
    setHasSearched(true);

    try {
      const response = await fetch('/api/ccb/event-attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date, groupName }),
        signal: abortController.signal,
      });

      const result = await response.json().catch(() => ({} as any));

      if (!response.ok) {
        const parts = [result?.error || 'Failed to fetch data'];
        if (typeof result?.upstreamStatus === 'number') parts.push(`HTTP ${result.upstreamStatus}`);
        if (result?.hint) parts.push(result.hint);
        if (result?.code) parts.push(`(${result.code})`);
        if (result?.requestId) parts.push(`Request: ${result.requestId}`);
        throw new Error(parts.filter(Boolean).join(' '));
      }

      setEvents(result.data || []);
    } catch (err: any) {
      // Don't show error if request was aborted
      if (err.name === 'AbortError') {
        console.log('Request was cancelled');
        return;
      }
      setError(err.message || 'An error occurred while fetching data');
    } finally {
      if (abortController === abortControllerRef.current) {
        setLoading(false);
        abortControllerRef.current = null;
      }
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
      // Fallback
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleFetchData();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="CCB Event Explorer" size="xl">
      <div className="space-y-4">
        {/* CCB Profile Link - Always visible when available */}
        {ccbProfileLink && (
          <div className="flex justify-end">
            <a
              href={ccbProfileLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View Circle Leader in CCB
            </a>
          </div>
        )}
        
        {/* Input Fields */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-3 sm:px-4 py-3 border border-gray-300/30 dark:border-gray-600/30 rounded-xl shadow-sm bg-white/50 dark:bg-gray-700/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 backdrop-blur-sm transition-all duration-200 text-sm sm:text-base"
              disabled={loading}
            />
          </div>

          <div className="min-w-0">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Group Name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., LVT | S1"
              className="w-full px-3 sm:px-4 py-3 border border-gray-300/30 dark:border-gray-600/30 rounded-xl shadow-sm bg-white/50 dark:bg-gray-700/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 backdrop-blur-sm transition-all duration-200 text-sm sm:text-base"
              disabled={loading}
            />
          </div>
        </div>

        {/* Fetch Button */}
        <button
          onClick={handleFetchData}
          disabled={loading || !date || !groupName}
          className="w-full px-4 py-3 bg-blue-600/90 hover:bg-blue-600 text-white rounded-xl font-medium text-sm tracking-tight transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Fetching Data...
            </>
          ) : (
            <>
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Fetch Data
            </>
          )}
        </button>

        {/* Error Message */}
        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Results Display */}
        {hasSearched && !loading && events.length === 0 && !error && (
          <div className="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 rounded-lg flex items-center gap-2">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            No events found for this date and group
          </div>
        )}

        {/* Copy All & Event Cards */}
        {events.length > 0 && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Copy All Button */}
            <div className="flex justify-end">
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
                        
                        // Try parsing as ISO date (YYYY-MM-DD)
                        const date = new Date(dateStr + 'T00:00:00');
                        
                        if (isNaN(date.getTime())) {
                          return `Date: ${dateStr}`;
                        }
                        
                        return date.toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        });
                      } catch (e) {
                        return `Date: ${event.date || 'Unknown'}`;
                      }
                    })()}{' '}
                    • Event ID: {event.eventId}
                  </div>
                </div>

                {/* Event Content */}
                <div className="p-4 space-y-3">
                  {/* Did Not Meet Warning */}
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
                        <svg
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                          />
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
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Topic
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                        {event.topic}
                      </p>
                    </div>
                  )}

                  {/* Notes */}
                  {event.notes && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Notes
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 whitespace-pre-wrap">
                        {event.notes}
                      </p>
                    </div>
                  )}

                  {/* Prayer Requests */}
                  {event.prayerRequests && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Prayer Requests
                      </h4>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
