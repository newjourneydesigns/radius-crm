'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export default function ProtectedRoute({ children, requireAuth = true }: ProtectedRouteProps) {
  const { user, loading, isAuthenticated, clearAuthData } = useAuth();
  const router = useRouter();
  const [timeoutReached, setTimeoutReached] = useState(false);

  const handleClearData = async () => {
    console.log('🔄 ProtectedRoute: Clearing data and refreshing...');
    try {
      await clearAuthData();
      // Force a hard refresh to completely reset the app state
      window.location.href = '/login';
    } catch (error) {
      console.error('Error clearing auth data:', error);
      // Force refresh even if clear fails
      window.location.href = '/login';
    }
  };

  // Timeout mechanism to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn('Authentication timeout reached, forcing refresh');
        setTimeoutReached(true);
      }
    }, 7000); // 7 second timeout to allow for auth context fallback

    return () => clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    // Wait for loading to complete
    if (loading && !timeoutReached) return;

    // If timeout reached and still loading, redirect to login
    if (timeoutReached && loading) {
      router.push('/login');
      return;
    }

    // If authentication is required but user is not authenticated
    if (requireAuth && !isAuthenticated()) {
      router.push('/login');
      return;
    }

    // If user is authenticated but trying to access login page, redirect to dashboard
    if (!requireAuth && isAuthenticated() && window.location.pathname === '/login') {
      router.push('/dashboard');
      return;
    }
  }, [user, loading, requireAuth, isAuthenticated, router, timeoutReached]);

  // Show loading while checking authentication
  if (loading && !timeoutReached) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If timeout reached, show error message with refresh option
  if (timeoutReached && loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4">
            <svg className="w-12 h-12 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.732 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Authentication Timeout</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">The authentication check is taking too long. This usually indicates a database connection issue.</p>
          <div className="space-x-2">
            <button
              onClick={() => window.location.href = '/login'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go to Login
            </button>
            <button
              onClick={handleClearData}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Clear Data & Reset
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If authentication is required but user is not authenticated, show loading
  // (the useEffect will redirect to login)
  if (requireAuth && !isAuthenticated()) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // User is authenticated or route doesn't require auth, render children
  return <>{children}</>;
}
