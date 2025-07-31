'use client';

interface ProgressBarProps {
  receivedCount: number;
  totalCount: number;
  onResetCheckboxes: () => void;
}

export default function EventSummaryProgress({ 
  receivedCount, 
  totalCount, 
  onResetCheckboxes 
}: ProgressBarProps) {
  const percentage = totalCount > 0 ? Math.round((receivedCount / totalCount) * 100) : 0;
  
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
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
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
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {percentage}%
              </div>
              <div className={`text-sm font-medium ${getStatusColor()}`}>
                {getStatusMessage()}
              </div>
            </div>
            <button
              onClick={onResetCheckboxes}
              className="flex items-center px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-red-300 dark:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              Reset All
            </button>
          </div>
        </div>
      </div>
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Progress</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {totalCount - receivedCount} remaining
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
          <div 
            className={`h-4 rounded-full transition-all duration-700 ease-out ${getProgressColor()}`}
            style={{ width: `${percentage}%` }}
          >
            <div className="h-full w-full bg-white bg-opacity-20 rounded-full animate-pulse"></div>
          </div>
        </div>
        {percentage > 0 && (
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>Started</span>
            {percentage >= 25 && <span>25%</span>}
            {percentage >= 50 && <span>50%</span>}
            {percentage >= 75 && <span>75%</span>}
            {percentage === 100 && <span className="text-green-600 dark:text-green-400 font-medium">Complete!</span>}
          </div>
        )}
      </div>
    </div>
  );
}
