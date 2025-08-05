'use c  const exampleData = [
    { status: 'Invited' as const, count: 4, color: 'bg-blue-500' },
    { status: 'Pipeline' as const, count: 7, color: 'bg-indigo-500' },
    { status: 'Active' as const, count: 198, color: 'bg-green-500' },
    { status: 'Follow-Up' as const, count: 5, color: 'bg-orange-500' },
    { status: 'Paused' as const, count: 1, color: 'bg-yellow-500' },
    { status: 'Off-Boarding' as const, count: 3, color: 'bg-red-500' }
  ];import CircleStatusBar from '../../components/dashboard/CircleStatusBar';

export default function StatusBarDemo() {
  // Example data for demonstration
  const exampleData = [
    { status: 'Invited' as const, count: 12, color: 'bg-blue-500' },
    { status: 'Pipeline' as const, count: 8, color: 'bg-indigo-500' },
    { status: 'Active' as const, count: 45, color: 'bg-green-500' },
    { status: 'Follow-Up' as const, count: 7, color: 'bg-orange-500' },
    { status: 'Paused' as const, count: 3, color: 'bg-yellow-500' },
    { status: 'Off-Boarding' as const, count: 2, color: 'bg-red-500' },
    { status: 'Recording' as const, count: 1, color: 'bg-purple-500' }
  ];

  const total = exampleData.reduce((sum, item) => sum + item.count, 0);

  const handleStatusClick = (status: string) => {
    alert(`Clicked on ${status} status`);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Circle Status Bar Demo
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            iPhone storage bar-style component for Circle Leader statuses
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Circle Leader Status Distribution
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Click on any segment or legend item to filter by that status
            </p>
          </div>

          <CircleStatusBar
            data={exampleData}
            total={total}
            onStatusClick={handleStatusClick}
          />
        </div>

        <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Features
          </h3>
          <ul className="space-y-2 text-gray-600 dark:text-gray-400">
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
              iPhone storage bar-style horizontal segmented progress bar
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
              Proportionate segments based on count/percentage
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
              Interactive tooltips on hover showing status and count
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
              Clickable segments and legend items for filtering
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
              Responsive grid layout for legend
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
              Accessibility support with keyboard navigation and ARIA labels
            </li>
            <li className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
              Dark mode support with Tailwind CSS
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
