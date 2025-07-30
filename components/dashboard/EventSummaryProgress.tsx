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
    if (percentage === 100) return 'bg-green-600';
    if (percentage >= 75) return 'bg-green-500';
    if (percentage >= 50) return 'bg-yellow-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-md flex items-center justify-center mr-3">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Event Summaries Received</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {receivedCount} out of {totalCount} received
              </p>
            </div>
          </div>
          <button
            onClick={onResetCheckboxes}
            className="flex items-center px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900 rounded-md border border-red-300 dark:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Reset Checkboxes
          </button>
        </div>
      </div>
      <div className="px-6 py-4">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
          <div 
            className={`h-3 rounded-full transition-all duration-300 ${getProgressColor()}`}
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
