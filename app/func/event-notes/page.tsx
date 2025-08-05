'use client';

import { useState } from 'react';
import { useEventNotesForGroup } from '../../../hooks/useEventNotesForGroup';
import { EventNote } from '../../../lib/ccb-types';

interface EventNotesFormData {
  groupId: string;
  startDate: string;
  endDate: string;
}

const EventNotesDisplay = ({ eventNotes }: { eventNotes: EventNote[] }) => {
  if (eventNotes.length === 0) {
    return (
      <div className="text-gray-600 italic">
        No events found for the specified criteria.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">
        Found {eventNotes.length} event(s) with notes
      </h3>
      
      {eventNotes.map((eventNote) => (
        <div key={eventNote.eventId} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
          <div className="mb-3">
            <h4 className="text-xl font-medium text-gray-900">
              {eventNote.eventName}
            </h4>
            <p className="text-sm text-gray-600">
              Date: {new Date(eventNote.eventDate).toLocaleDateString()}
            </p>
            <p className="text-xs text-gray-500">
              Event ID: {eventNote.eventId}
            </p>
          </div>
          
          {eventNote.notes.length > 0 ? (
            <div className="space-y-3">
              <h5 className="font-medium text-gray-800">Notes:</h5>
              {eventNote.setupNotes && (
                <div className="bg-blue-50 p-3 rounded">
                  <h6 className="text-sm font-medium text-blue-800 mb-1">Setup Notes:</h6>
                  <p className="text-sm text-blue-700 whitespace-pre-wrap">
                    {eventNote.setupNotes}
                  </p>
                </div>
              )}
              {eventNote.leaderNotes && (
                <div className="bg-green-50 p-3 rounded">
                  <h6 className="text-sm font-medium text-green-800 mb-1">Leader Notes:</h6>
                  <p className="text-sm text-green-700 whitespace-pre-wrap">
                    {eventNote.leaderNotes}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 italic">No notes available for this event.</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default function EventNotesForGroupPage() {
  const [formData, setFormData] = useState<EventNotesFormData>({
    groupId: '',
    startDate: '',
    endDate: ''
  });
  
  const [submitted, setSubmitted] = useState(false);
  
  // Only call the hook when we have submitted data
  const { data, loading, error, refetch } = useEventNotesForGroup(
    submitted ? parseInt(formData.groupId) || 0 : 0,
    submitted ? formData.startDate : '',
    submitted ? formData.endDate : ''
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate inputs
    if (!formData.groupId || !formData.startDate || !formData.endDate) {
      alert('Please fill in all fields');
      return;
    }
    
    if (isNaN(parseInt(formData.groupId))) {
      alert('Group ID must be a number');
      return;
    }
    
    if (new Date(formData.startDate) > new Date(formData.endDate)) {
      alert('Start date must be before end date');
      return;
    }
    
    setSubmitted(true);
  };

  const handleReset = () => {
    setSubmitted(false);
    setFormData({
      groupId: '',
      startDate: '',
      endDate: ''
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            CCB Event Notes for Group
          </h1>
          
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="text-sm font-medium text-yellow-800 mb-2">Note:</h3>
            <p className="text-sm text-yellow-700">
              This tool fetches event notes from the CCB API for a specific group within a date range. 
              The API credentials are currently hard-coded and should be moved to environment variables in production.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="groupId" className="block text-sm font-medium text-gray-700 mb-1">
                  Group ID (number)
                </label>
                <input
                  type="number"
                  id="groupId"
                  name="groupId"
                  value={formData.groupId}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. 12345"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Fetching...' : 'Fetch Event Notes'}
              </button>
              
              {submitted && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  Reset
                </button>
              )}
              
              {submitted && !loading && (
                <button
                  type="button"
                  onClick={refetch}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  Refresh
                </button>
              )}
            </div>
          </form>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Fetching event data from CCB API...</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="text-sm font-medium text-red-800 mb-2">Error:</h3>
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={refetch}
                className="mt-3 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
              >
                Try Again
              </button>
            </div>
          )}

          {submitted && !loading && !error && (
            <EventNotesDisplay eventNotes={data} />
          )}
        </div>
      </div>
    </div>
  );
}
