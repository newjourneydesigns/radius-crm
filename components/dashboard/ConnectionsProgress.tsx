'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface ConnectionsProgressProps {
  filteredLeaderIds: number[];
  totalFilteredLeaders: number;
  refreshTrigger?: number; // Add refresh trigger prop
}

interface ConnectionsData {
  total: number;
  connected: number;
  percentage: number;
}

export default function ConnectionsProgress({ filteredLeaderIds, totalFilteredLeaders, refreshTrigger }: ConnectionsProgressProps) {
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

        console.log('🔍 Fetching connections for date range:', { startDate, endDate });
        console.log('🔍 Filtered leader IDs:', filteredLeaderIds);

        // Query for connections this month for the filtered leaders
        const { data: connections, error } = await supabase
          .from('connections')
          .select('circle_leader_id')
          .in('circle_leader_id', filteredLeaderIds)
          .gte('date_of_connection', startDate)
          .lte('date_of_connection', endDate);

        console.log('🔍 Connections query result:', { connections, error });

        if (error) {
          console.error('Error fetching connections:', error);
          setConnectionsData({ total: totalFilteredLeaders, connected: 0, percentage: 0 });
          return;
        }

        // Count unique circle leaders who have connections this month
        const uniqueLeaderIds = new Set(connections?.map(conn => conn.circle_leader_id) || []);
        const connectedCount = uniqueLeaderIds.size;
        
        // Calculate percentage with minimum 1% if there are any connections
        let percentage = 0;
        if (totalFilteredLeaders > 0) {
          const exactPercentage = (connectedCount / totalFilteredLeaders) * 100;
          if (connectedCount > 0 && exactPercentage < 1) {
            percentage = 1; // Show at least 1% if there are any connections
          } else {
            percentage = Math.round(exactPercentage);
          }
        }

        console.log('🔍 Connections calculation:', { 
          uniqueLeaderIds: Array.from(uniqueLeaderIds), 
          connectedCount, 
          totalFilteredLeaders, 
          exactPercentage: totalFilteredLeaders > 0 ? (connectedCount / totalFilteredLeaders) * 100 : 0,
          percentage 
        });

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
  }, [filteredLeaderIds, totalFilteredLeaders, refreshTrigger]); // Add refreshTrigger dependency

  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Connections Made ({currentMonth})
        </h3>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {isLoading ? (
            <div className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading...
            </div>
          ) : (
            `${connectionsData.connected} of ${connectionsData.total} Connected`
          )}
        </span>
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
        <div 
          className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-in-out"
          style={{ width: `${connectionsData.percentage}%` }}
        ></div>
      </div>
      
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
        <span>0%</span>
        <span className="font-medium">{connectionsData.percentage}%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
