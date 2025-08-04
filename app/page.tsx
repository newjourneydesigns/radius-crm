import ProtectedRoute from '../components/ProtectedRoute';

export default function Page() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Welcome to RADIUS</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Circle Leader Management System
            </p>
          </div>

        {/* Main Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="px-4 sm:px-6 py-6 sm:py-8">
            <div className="text-center">
              <svg 
                className="mx-auto h-12 w-12 sm:h-16 sm:w-16 text-blue-500 dark:text-blue-400 mb-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth="2" 
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Manage Your Circle Leaders
              </h2>
              
              <p className="text-gray-600 dark:text-gray-400 mb-6 sm:mb-8 max-w-2xl mx-auto text-sm sm:text-base">
                RADIUS helps you track, manage, and support your Circle Leaders. Monitor event summaries, 
                contact information, meeting schedules, and more from one central dashboard.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 justify-center">
                <a 
                  href="/dashboard" 
                  className="inline-flex items-center justify-center px-4 sm:px-6 py-2 sm:py-3 border border-transparent text-sm sm:text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Go to Dashboard
                  <svg className="ml-2 -mr-1 w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mt-6 sm:mt-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <div className="flex items-start sm:items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3 sm:ml-4">
                <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">Track Progress</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Monitor event summary submissions and leader activity</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <div className="flex items-start sm:items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="ml-3 sm:ml-4">
                <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">Stay Connected</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Easy access to contact information and communication tools</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <div className="flex items-start sm:items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="ml-3 sm:ml-4">
                <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">Organize Schedules</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">View today's meetings and upcoming circle gatherings</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </ProtectedRoute>
  );
}
