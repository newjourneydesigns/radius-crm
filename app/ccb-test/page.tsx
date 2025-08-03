'use client';

import React, { useState } from 'react';

interface CCBTestResult {
  endpoint: string;
  status: number;
  data: any;
  error?: string;
  timestamp: string;
}

export default function CCBTestPage() {
  const [results, setResults] = useState<CCBTestResult[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [groupId, setGroupId] = useState('3143');
  const [startDate, setStartDate] = useState('2025-04-01');
  const [endDate, setEndDate] = useState('2025-06-30');

  const addResult = (endpoint: string, status: number, data: any, error?: string) => {
    const result: CCBTestResult = {
      endpoint,
      status,
      data,
      error,
      timestamp: new Date().toISOString()
    };
    setResults(prev => [result, ...prev]);
  };

  const testEndpoint = async (endpoint: string, description: string) => {
    setLoading(endpoint);
    try {
      const response = await fetch(endpoint);
      const data = await response.json();
      addResult(`${description} (${endpoint})`, response.status, data);
    } catch (error) {
      addResult(`${description} (${endpoint})`, 0, null, error.message);
    }
    setLoading(null);
  };

  const testCCBEventNotes = () => {
    const endpoint = `/api/ccb/event-notes/?groupId=${groupId}&startDate=${startDate}&endDate=${endDate}`;
    testEndpoint(endpoint, 'CCB Event Notes');
  };

  const testCCBEventNotesWide = () => {
    const endpoint = `/api/ccb/event-notes/?groupId=${groupId}&startDate=2020-01-01&endDate=2030-12-31`;
    testEndpoint(endpoint, 'CCB Event Notes (Wide Range)');
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">CCB API Test Dashboard</h1>
        
        {/* Test Parameters */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Test Parameters</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Group ID
              </label>
              <input
                type="text"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="3143"
              />
              <div className="text-xs text-gray-500 mt-1">
                Current: {groupId || 'Not set'}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Test Buttons */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Available Tests</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            <button
              onClick={testCCBEventNotes}
              disabled={loading !== null}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === `/api/ccb/event-notes/?groupId=${groupId}&startDate=${startDate}&endDate=${endDate}` ? 'Testing...' : 'Test CCB Event Notes'}
            </button>

            <button
              onClick={testCCBEventNotesWide}
              disabled={loading !== null}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === `/api/ccb/event-notes/?groupId=${groupId}&startDate=2020-01-01&endDate=2030-12-31` ? 'Testing...' : 'Test Wide Date Range'}
            </button>

            <button
              onClick={() => testEndpoint('/api/ccb/event-notes/?groupId=invalid&startDate=2025-01-01&endDate=2025-12-31', 'Invalid Group ID Test')}
              disabled={loading !== null}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === '/api/ccb/event-notes/?groupId=invalid&startDate=2025-01-01&endDate=2025-12-31' ? 'Testing...' : 'Test Invalid Group'}
            </button>

            <button
              onClick={() => testEndpoint('/api/ccb/event-notes/?groupId=3254&startDate=2025-01-01&endDate=2025-12-31', 'Different Group Test')}
              disabled={loading !== null}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === '/api/ccb/event-notes/?groupId=3254&startDate=2025-01-01&endDate=2025-12-31' ? 'Testing...' : 'Test Group 3254'}
            </button>

            <button
              onClick={() => testEndpoint('/api/ccb/event-notes/?groupId=3413&startDate=2025-01-01&endDate=2025-12-31', 'Group 3413 Test')}
              disabled={loading !== null}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === '/api/ccb/event-notes/?groupId=3413&startDate=2025-01-01&endDate=2025-12-31' ? 'Testing...' : 'Test Group 3413'}
            </button>

            <button
              onClick={clearResults}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Clear Results
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Test Results ({results.length})</h2>
          
          {results.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No tests run yet. Click a test button above to get started.</p>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-4 ${
                    result.status === 200
                      ? 'border-green-200 bg-green-50'
                      : result.status >= 400
                      ? 'border-red-200 bg-red-50'
                      : 'border-yellow-200 bg-yellow-50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-lg">{result.endpoint}</h3>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-1 rounded text-sm font-medium ${
                          result.status === 200
                            ? 'bg-green-100 text-green-800'
                            : result.status >= 400
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {result.status || 'ERROR'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(result.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  
                  {result.error && (
                    <div className="mb-2">
                      <span className="text-red-600 font-medium">Error: </span>
                      <span className="text-red-700">{result.error}</span>
                    </div>
                  )}
                  
                  {result.data && (
                    <div className="mt-2">
                      <details className="cursor-pointer">
                        <summary className="font-medium text-gray-700 hover:text-gray-900">
                          Response Data
                          {result.data.totalEvents !== undefined && (
                            <span className="ml-2 text-sm text-gray-600">
                              ({result.data.totalEvents} events found)
                            </span>
                          )}
                        </summary>
                        
                        {/* Formatted Key Information */}
                        {result.data && (
                          <div className="mt-3 space-y-3">
                            {/* Success/Error Status */}
                            {result.data.success !== undefined && (
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-gray-600">Status:</span>
                                <span className={`px-2 py-1 rounded text-sm ${result.data.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                  {result.data.success ? 'Success' : 'Failed'}
                                </span>
                              </div>
                            )}
                            
                            {/* Group ID and Date Range */}
                            {result.data.groupId && (
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                <div>
                                  <span className="font-medium text-gray-600">Group ID:</span>
                                  <span className="ml-2 font-mono bg-gray-100 px-2 py-1 rounded">{result.data.groupId}</span>
                                </div>
                                {result.data.startDate && (
                                  <div>
                                    <span className="font-medium text-gray-600">Start Date:</span>
                                    <span className="ml-2 font-mono bg-gray-100 px-2 py-1 rounded">{result.data.startDate}</span>
                                  </div>
                                )}
                                {result.data.endDate && (
                                  <div>
                                    <span className="font-medium text-gray-600">End Date:</span>
                                    <span className="ml-2 font-mono bg-gray-100 px-2 py-1 rounded">{result.data.endDate}</span>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Debug Information */}
                            {result.data.debug && (
                              <div className="bg-blue-50 p-3 rounded-lg">
                                <h4 className="font-medium text-blue-900 mb-2">🔍 Debug Information</h4>
                                <div className="space-y-2 text-sm">
                                  <div>
                                    <span className="font-medium text-blue-700">Search Window:</span>
                                    <span className="ml-2 font-mono text-blue-600">{result.data.debug.searchStartDate} to today</span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-blue-700">Events Found for Group:</span>
                                    <span className="ml-2 font-bold text-blue-800">{result.data.debug.totalEventsFound}</span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-blue-700">Total Groups Found:</span>
                                    <span className="ml-2 font-bold text-blue-800">{result.data.debug.totalGroupIds}</span>
                                  </div>
                                  {result.data.debug.allGroupIdsFound && result.data.debug.allGroupIdsFound.length > 0 && (
                                    <div>
                                      <span className="font-medium text-blue-700">Sample Group IDs:</span>
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {result.data.debug.allGroupIdsFound.map((gid: string, idx: number) => (
                                          <span key={idx} className="font-mono text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                            {gid}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Event Notes */}
                            {result.data.eventNotes && result.data.eventNotes.length > 0 && (
                              <div className="bg-green-50 p-3 rounded-lg">
                                <h4 className="font-medium text-green-900 mb-2">📝 Event Notes Found</h4>
                                {result.data.eventNotes.map((note: any, idx: number) => (
                                  <div key={idx} className="border-l-4 border-green-400 pl-3 mb-3 last:mb-0">
                                    <div className="font-medium text-green-800">
                                      {note.eventName} - {note.eventDate}
                                    </div>
                                    <div className="text-sm text-green-700 mt-1">
                                      Event ID: {note.eventId}
                                    </div>
                                    <div className="text-sm text-green-600 mt-2 bg-white p-2 rounded border">
                                      {note.notes}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {/* Error Messages */}
                            {result.data.error && (
                              <div className="bg-red-50 p-3 rounded-lg">
                                <h4 className="font-medium text-red-900 mb-1">❌ Error</h4>
                                <p className="text-red-700">{result.data.error}</p>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Raw JSON (collapsible) */}
                        <details className="mt-4 cursor-pointer">
                          <summary className="text-xs font-medium text-gray-500 hover:text-gray-700">
                            📋 Raw JSON Response
                          </summary>
                          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-x-auto max-h-40 overflow-y-auto">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        </details>
                      </details>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
