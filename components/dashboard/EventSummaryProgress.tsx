'use client';

import { useRouter } from 'next/navigation';

interface ProgressBarProps {
  receivedCount: number;
  totalCount: number;
  onResetCheckboxes: () => void;
  filters?: any; // Dashboard filters to pass to leaders page
}

export default function EventSummaryProgress({ 
  receivedCount, 
  totalCount, 
  onResetCheckboxes,
  filters 
}: ProgressBarProps) {
  const router = useRouter();
  const percentage = totalCount > 0 ? Math.round((receivedCount / totalCount) * 100) : 0;
  
  const handleUpdateClick = () => {
    // Navigate to leaders page with filters for "not received" event summaries
    const searchParams = new URLSearchParams();
    
    // Set event summary filter to show "not received" only
    searchParams.set('eventSummary', 'not_received');
    
    // Pass current dashboard filters to leaders page
    if (filters) {
      // Handle array filters by appending each value separately
      if (filters.campus && filters.campus.length > 0) {
        filters.campus.forEach((campus: string) => {
          searchParams.append('campus', campus);
        });
      }
      if (filters.acpd && filters.acpd.length > 0) {
        filters.acpd.forEach((acpd: string) => {
          searchParams.append('acpd', acpd);
        });
      }
      if (filters.status && filters.status.length > 0) {
        filters.status.forEach((status: string) => {
          searchParams.append('status', status);
        });
      }
      if (filters.circleType && filters.circleType.length > 0) {
        filters.circleType.forEach((circleType: string) => {
          searchParams.append('circleType', circleType);
        });
      }
      if (filters.meetingDay && filters.meetingDay.length > 0) {
        filters.meetingDay.forEach((meetingDay: string) => {
          searchParams.append('meetingDay', meetingDay);
        });
      }
      // Handle single value filters
      if (filters.connected && filters.connected !== 'all') {
        searchParams.set('connected', filters.connected);
      }
      if (filters.timeOfDay && filters.timeOfDay !== 'all') {
        searchParams.set('timeOfDay', filters.timeOfDay);
      }
    }
    
    const queryString = searchParams.toString();
    const url = queryString ? `/leaders?${queryString}` : '/leaders?eventSummary=not_received';
    
    router.push(url);
  };

  const getProgressColor = () => {
    if (percentage === 100) return 'bg-gradient-to-r from-green-500 to-green-600';
    if (percentage >= 75) return 'bg-gradient-to-r from-blue-500 to-blue-600';
    if (percentage >= 50) return 'bg-gradient-to-r from-yellow-500 to-yellow-600';
    if (percentage >= 25) return 'bg-gradient-to-r from-orange-500 to-orange-600';
    return 'bg-gradient-to-r from-red-500 to-red-600';
  };

  const getStatusMessage = () => {
    if (totalCount === 0) return 'No leaders in current filter';
    if (percentage === 100) return 'All summaries received! 🎉';
    if (percentage >= 75) return 'Almost complete!';
    if (percentage >= 50) return 'Halfway there';
    if (percentage >= 25) return 'Making progress';
    return 'Just getting started';
  };

  const getStatusColor = () => {
    if (percentage === 100) return 'text-green-600 dark:text-green-400';
    if (percentage >= 75) return 'text-blue-600 dark:text-blue-400';
    if (percentage >= 50) return 'text-yellow-600 dark:text-yellow-400';
    if (percentage >= 25) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  if (totalCount === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mr-3 sm:mr-4">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"></path>
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Event Summaries Progress</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No leaders in current filter
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
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"></path>
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Event Summaries Progress</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {receivedCount} of {totalCount} summaries received
              </p>
            </div>
          </div>
          <div className="flex items-center justify-start">
            <div className="text-left">
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {percentage}%
              </div>
              <div className={`text-xs font-medium ${getStatusColor()}`}>
                {getStatusMessage()}
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Layout - Original horizontal layout */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"></path>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Event Summaries Progress</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {receivedCount} of {totalCount} summaries received
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end">
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {percentage}%
              </div>
              <div className={`text-sm font-medium ${getStatusColor()}`}>
                {getStatusMessage()}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 sm:px-6 py-4 sm:py-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Progress</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {totalCount - receivedCount} remaining
            </span>
            <button
              onClick={handleUpdateClick}
              className="flex items-center px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded border border-blue-300 dark:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
              Update
            </button>
          </div>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 sm:h-4 overflow-hidden">
          <div 
            className={`h-3 sm:h-4 rounded-full transition-all duration-700 ease-out ${getProgressColor()}`}
            style={{ width: `${percentage}%` }}
          >
            <div className="h-full w-full bg-white bg-opacity-20 rounded-full animate-pulse"></div>
          </div>
        </div>
        {percentage > 0 && (
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>Started</span>
            {percentage >= 25 && <span className="hidden xs:inline">25%</span>}
            {percentage >= 50 && <span>50%</span>}
            {percentage >= 75 && <span className="hidden xs:inline">75%</span>}
            {percentage === 100 && <span className="text-green-600 dark:text-green-400 font-medium">Complete!</span>}
          </div>
        )}
      </div>
    </div>
  );
}
