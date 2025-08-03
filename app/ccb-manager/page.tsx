'use client';

import { useState } from 'react';

interface CCBEvent {
  eventId: string;
  eventName: string;
  eventDate: string;
  description: string;
  notes: string;
  groupId?: string;
}

interface CCBGroup {
  groupId: string;
  groupName: string;
  leader: string;
}

export default function CCBManagerPage() {
  const [groups, setGroups] = useState<CCBGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [events, setEvents] = useState<CCBEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadGroups = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ccb/groups');
      const data = await response.json();
      if (data.success) {
        setGroups(data.groups);
        setError('');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load groups');
    }
    setLoading(false);
  };

  const loadEvents = async () => {
    if (!selectedGroupId || !startDate || !endDate) {
      setError('Please select a group and date range');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        groupId: selectedGroupId,
        startDate,
        endDate
      });
      
      const response = await fetch(`/api/ccb/events?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setEvents(data.events);
        setError('');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load events');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            CCB Circle Leader Event Manager
          </h1>

          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Circle Leader/Group
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={groups.length === 0}
                >
                  <option value="">Select a group...</option>
                  {groups.map(group => (
                    <option key={group.groupId} value={group.groupId}>
                      {group.leader} - {group.groupName}
                    </option>
                  ))}
                </select>
                <button
                  onClick={loadGroups}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {loading ? 'Loading...' : 'Load Groups'}
                </button>
              </div>
              {groups.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {groups.length} groups loaded
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mb-6">
            <button
              onClick={loadEvents}
              disabled={loading || !selectedGroupId || !startDate || !endDate}
              className="w-full md:w-auto px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Loading Events...' : 'Get Event Summaries'}
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* Results */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">
                Event Summaries
              </h2>
              {events.length > 0 && (
                <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  {events.length} events found
                </span>
              )}
            </div>
            
            {events.length === 0 && !loading && !error && (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg mb-2">No events found</p>
                <p className="text-sm">Select a circle leader and date range to view event summaries</p>
              </div>
            )}

            {events.map(event => (
              <div key={`${event.eventId}-${event.eventDate}`} className="border border-gray-200 rounded-lg p-6 bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-3">
                  <h3 className="font-semibold text-lg text-gray-900 mb-2 md:mb-0">
                    {event.eventName}
                  </h3>
                  <span className="text-sm text-gray-500 bg-white px-3 py-1 rounded-full whitespace-nowrap">
                    {new Date(event.eventDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </div>
                
                {event.description && (
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-700 mb-2 flex items-center">
                      <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                      Description
                    </h4>
                    <div className="pl-4 border-l-2 border-blue-200">
                      <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{event.description}</p>
                    </div>
                  </div>
                )}
                
                {event.notes && (
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-700 mb-2 flex items-center">
                      <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                      Leader Notes
                    </h4>
                    <div className="pl-4 border-l-2 border-green-200">
                      <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{event.notes}</p>
                    </div>
                  </div>
                )}
                
                {!event.description && !event.notes && (
                  <div className="text-center py-4">
                    <p className="text-gray-400 italic">No notes or description available for this event</p>
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-gray-200">
                  <span className="text-xs text-gray-400">Event ID: {event.eventId}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
