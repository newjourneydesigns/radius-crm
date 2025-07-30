'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function LogoutPage() {
  const [isLoggingOut, setIsLoggingOut] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const performLogout = async () => {
      try {
        await supabase.auth.signOut();
        
        // Wait a bit for the logout to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Redirect to login page
        router.push('/login');
      } catch (error) {
        console.error('Logout error:', error);
        setIsLoggingOut(false);
      }
    };

    performLogout();
  }, [router]);

  const handleManualRedirect = () => {
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 sm:space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
            {isLoggingOut ? (
              <svg className="animate-spin h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            )}
          </div>
          
          <h2 className="mt-4 sm:mt-6 text-center text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            {isLoggingOut ? 'Signing you out...' : 'Signed out'}
          </h2>
          
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            {isLoggingOut 
              ? 'Please wait while we securely sign you out of RADIUS.'
              : 'You have been successfully signed out of RADIUS.'
            }
          </p>
        </div>

        {!isLoggingOut && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <div className="text-center">
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Thank you for using RADIUS. Your session has been ended securely.
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={handleManualRedirect}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Return to Login
                </button>
                
                <a
                  href="/"
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Go to Home
                </a>
              </div>
            </div>
          </div>
        )}

        {isLoggingOut && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <div className="flex items-center justify-center">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
