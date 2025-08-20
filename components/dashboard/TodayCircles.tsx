'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { CircleLeader } from '../../lib/supabase';

interface TodayCirclesProps {
  todayCircles: CircleLeader[];
}

export default function TodayCircles({ todayCircles }: TodayCirclesProps) {
  const [isVisible, setIsVisible] = useState(true);

  // Load visibility state from localStorage on component mount
  useEffect(() => {
    const saved = localStorage.getItem('todayCirclesVisible');
    if (saved !== null) {
      setIsVisible(JSON.parse(saved));
    }
  }, []);

  // Save visibility state to localStorage when it changes
  const toggleVisibility = () => {
    const newVisibility = !isVisible;
    setIsVisible(newVisibility);
    localStorage.setItem('todayCirclesVisible', JSON.stringify(newVisibility));
  };

  // Filter out Invited, Pipeline, and Archive state Circle Leaders
  const filteredCircles = todayCircles.filter(
    (leader) => !['invited', 'pipeline', 'archive'].includes((leader.status || '').toLowerCase())
  );

  const formatTime = (timeString?: string) => {
    if (!timeString) return 'Not set';
    try {
      if (timeString.includes(':')) {
        const [hours, minutes] = timeString.split(':');
        const hour = parseInt(hours);
        const min = minutes.padStart(2, '0');
        if (hour === 0) {
          return `12:${min} AM`;
        } else if (hour < 12) {
          return `${hour}:${min} AM`;
        } else if (hour === 12) {
          return `12:${min} PM`;
        } else {
          return `${hour - 12}:${min} PM`;
        }
      }
      return timeString;
    } catch (error) {
      console.error('Error formatting time:', error);
      return timeString;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900 rounded-md flex items-center justify-center mr-3">
              <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"></path>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Today's Circles</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isVisible 
                  ? 'Circle Leaders meeting today' 
                  : `${todayCircles.length} Circle Leader${todayCircles.length !== 1 ? 's' : ''} meeting today`
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
        <div className="overflow-x-auto">
          {filteredCircles.length === 0 ? (
            <div className="p-6 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No circles today</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">No Circle Leaders are scheduled to meet today.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-3 py-3 sm:px-6 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Circle Leader
                  </th>
                  <th className="px-3 py-3 sm:px-6 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hidden sm:table-cell">
                    Time
                  </th>
                  <th className="px-3 py-3 sm:px-6 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hidden md:table-cell">
                    Frequency
                  </th>
                  <th className="px-3 py-3 sm:px-6 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hidden lg:table-cell">
                    CCB
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredCircles.map(leader => (
                  <tr key={leader.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-3 py-4 sm:px-6 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-sm font-medium">
                          <Link 
                            href={`/circle/${leader.id}`}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 hover:underline cursor-pointer text-left"
                          >
                            {leader.name || 'Unnamed Leader'}
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 sm:px-6 whitespace-nowrap hidden sm:table-cell">
                      <div className="text-sm text-gray-900 dark:text-white">{formatTime(leader.time)}</div>
                    </td>
                    <td className="px-3 py-4 sm:px-6 whitespace-nowrap hidden md:table-cell">
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                        {leader.frequency || 'Not set'}
                      </span>
                    </td>
                    <td className="px-3 py-4 sm:px-6 whitespace-nowrap hidden lg:table-cell">
                      {leader.ccb_profile_link ? (
                        <a
                          href={leader.ccb_profile_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                          title="View CCB Profile"
                        >
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                          </svg>
                          CCB
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">No link</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
