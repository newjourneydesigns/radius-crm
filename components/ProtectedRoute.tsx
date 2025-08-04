'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export default function ProtectedRoute({ children, requireAuth = true }: ProtectedRouteProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for loading to complete
    if (loading) return;

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
  }, [user, loading, requireAuth, isAuthenticated, router]);

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
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
