'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface ConnectionsProgressProps {
  filteredLeaderIds: number[];
  totalFilteredLeaders: number;
}

interface ConnectionsData {
  total: number;
  connected: number;
  percentage: number;
}

export default function ConnectionsProgress({ filteredLeaderIds, totalFilteredLeaders }: ConnectionsProgressProps) {
  const [connectionsData, setConnectionsData] = useState<ConnectionsData>({
    total: 0,
    connected: 0,
    percentage: 0
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadConnectionsData = async () => {
      if (filteredLeaderIds.length === 0) {
        setConnectionsData({ total: 0, connected: 0, percentage: 0 });
        return;
      }

      setIsLoading(true);
      try {
        // Get current month boundaries
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        const startDate = firstDayOfMonth.toISOString().split('T')[0];
        const endDate = lastDayOfMonth.toISOString().split('T')[0];

        // Query for connections this month for the filtered leaders
        const { data: connections, error } = await supabase
          .from('connections')
          .select('circle_leader_id')
          .in('circle_leader_id', filteredLeaderIds)
          .gte('date_of_connection', startDate)
          .lte('date_of_connection', endDate);

        if (error) {
          console.error('Error fetching connections:', error);
          setConnectionsData({ total: totalFilteredLeaders, connected: 0, percentage: 0 });
          return;
        }

        // Count unique circle leaders who have connections this month
        const uniqueLeaderIds = new Set(connections?.map(conn => conn.circle_leader_id) || []);
        const connectedCount = uniqueLeaderIds.size;
        const percentage = totalFilteredLeaders > 0 ? Math.round((connectedCount / totalFilteredLeaders) * 100) : 0;

        setConnectionsData({
          total: totalFilteredLeaders,
          connected: connectedCount,
          percentage
        });

      } catch (error) {
        console.error('Error calculating connections data:', error);
        setConnectionsData({ total: totalFilteredLeaders, connected: 0, percentage: 0 });
      } finally {
        setIsLoading(false);
      }
    };

    loadConnectionsData();
  }, [filteredLeaderIds, totalFilteredLeaders]);

  const getProgressColor = () => {
    const { percentage } = connectionsData;
    if (percentage === 100) return 'bg-gradient-to-r from-green-500 to-green-600';
    if (percentage >= 75) return 'bg-gradient-to-r from-blue-500 to-blue-600';
    if (percentage >= 50) return 'bg-gradient-to-r from-yellow-500 to-yellow-600';
    if (percentage >= 25) return 'bg-gradient-to-r from-orange-500 to-orange-600';
    return 'bg-gradient-to-r from-red-500 to-red-600';
  };

  const getStatusMessage = () => {
    const { percentage, total } = connectionsData;
    if (total === 0) return 'No leaders in current filter';
    if (percentage === 100) return 'All connected this month! 🎉';
    if (percentage >= 75) return 'Great connections!';
    if (percentage >= 50) return 'Good progress';
    if (percentage >= 25) return 'Building connections';
    return 'Getting started';
  };

  const getStatusColor = () => {
    const { percentage } = connectionsData;
    if (percentage === 100) return 'text-green-600 dark:text-green-400';
    if (percentage >= 75) return 'text-blue-600 dark:text-blue-400';
    if (percentage >= 50) return 'text-yellow-600 dark:text-yellow-400';
    if (percentage >= 25) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (totalFilteredLeaders === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mr-3 sm:mr-4">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Connections Progress</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No leaders in current filter ({currentMonth})
              </p>
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-6 py-4 sm:py-5">
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Adjust your filters or check data connection
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        {/* Mobile Layout - Stack everything vertically */}
        <div className="block sm:hidden space-y-4">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Connections Progress</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isLoading ? 'Loading...' : `${connectionsData.connected} of ${connectionsData.total} connected (${currentMonth})`}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-start">
            <div className="text-left">
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {isLoading ? '...' : `${connectionsData.percentage}%`}
              </div>
              <div className={`text-xs font-medium ${getStatusColor()}`}>
                {isLoading ? 'Loading...' : getStatusMessage()}
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Layout - Original horizontal layout */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Connections Progress</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isLoading ? 'Loading...' : `${connectionsData.connected} of ${connectionsData.total} connected (${currentMonth})`}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end">
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {isLoading ? '...' : `${connectionsData.percentage}%`}
              </div>
              <div className={`text-sm font-medium ${getStatusColor()}`}>
                {isLoading ? 'Loading...' : getStatusMessage()}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 sm:px-6 py-4 sm:py-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Progress</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {isLoading ? 'Loading...' : `${connectionsData.total - connectionsData.connected} remaining`}
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 sm:h-4 overflow-hidden">
          <div 
            className={`h-3 sm:h-4 rounded-full transition-all duration-700 ease-out ${getProgressColor()}`}
            style={{ width: `${connectionsData.percentage}%` }}
          >
            <div className="h-full w-full bg-white bg-opacity-20 rounded-full animate-pulse"></div>
          </div>
        </div>
        {connectionsData.percentage > 0 && !isLoading && (
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>Started</span>
            {connectionsData.percentage >= 25 && <span className="hidden xs:inline">25%</span>}
            {connectionsData.percentage >= 50 && <span>50%</span>}
            {connectionsData.percentage >= 75 && <span className="hidden xs:inline">75%</span>}
            {connectionsData.percentage === 100 && <span className="text-green-600 dark:text-green-400 font-medium">Complete!</span>}
          </div>
        )}
      </div>
    </div>
  );
}
