'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import ProtectedRoute from '../../components/ProtectedRoute';

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized_domain: 'Access is restricted to @valleycreek.org accounts. Please sign in with your Valley Creek Google account.',
  auth_failed: 'Authentication failed. Please try again.',
};

function LoginContent() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const searchParams = useSearchParams();

  const redirectTo = useMemo(() => {
    const raw = searchParams.get('redirectTo') || '/dashboard';
    // Prevent open redirects: allow only same-site absolute paths.
    if (!raw.startsWith('/')) return '/dashboard';
    if (raw.startsWith('//')) return '/dashboard';
    if (raw.startsWith('/login')) return '/dashboard';
    if (raw.startsWith('/auth')) return '/dashboard';
    return raw;
  }, [searchParams]);

  const urlError = useMemo(() => {
    const key = searchParams.get('error') || '';
    return ERROR_MESSAGES[key] || (key ? 'Sign-in error. Please try again.' : '');
  }, [searchParams]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
          queryParams: {
            hd: 'valleycreek.org', // hint to Google to show only valleycreek.org accounts
          },
        },
      });
      if (error) {
        setError(error.message);
        setIsLoading(false);
      }
      // Supabase will redirect automatically on success
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed.');
      setIsLoading(false);
    }
  };

  const displayError = error || urlError;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 sm:space-y-8">
        <div>
          <div className="mx-auto h-20 w-20 flex items-center justify-center">
            <Image
              src="/icon-192x192.png"
              alt="RADIUS Logo"
              width={80}
              height={80}
              className="rounded-lg"
            />
          </div>
          <h2 className="mt-4 sm:mt-6 text-center text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Sign in to RADIUS
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Access your Circle Leader dashboard
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 space-y-4">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            Sign in with your <span className="font-medium text-gray-700 dark:text-gray-200">@valleycreek.org</span> Google account.
          </p>

          {displayError && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 p-3 text-sm text-red-700 dark:text-red-300">
              {displayError}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 font-semibold rounded-lg border border-gray-300 dark:border-gray-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center gap-3 transition-colors disabled:opacity-60"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="22" height="22">
              <path fill="#4285F4" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.22l6.85-6.85C36.36 2.34 30.55 0 24 0 14.61 0 6.27 5.7 2.13 14.02l7.98 6.21C12.13 13.13 17.56 9.5 24 9.5z"/>
              <path fill="#34A853" d="M46.1 24.5c0-1.64-.15-3.22-.43-4.75H24v9.02h12.47c-.54 2.92-2.18 5.39-4.66 7.06l7.25 5.63C43.73 37.13 46.1 31.27 46.1 24.5z"/>
              <path fill="#FBBC05" d="M10.11 28.23c-1.13-3.36-1.13-6.97 0-10.33l-7.98-6.21C.41 16.61 0 20.22 0 24c0 3.78.41 7.39 2.13 10.31l7.98-6.08z"/>
              <path fill="#EA4335" d="M24 44c6.55 0 12.36-2.17 16.97-5.94l-7.25-5.63c-2.01 1.35-4.59 2.13-7.72 2.13-6.44 0-11.87-3.63-13.89-8.73l-7.98 6.08C6.27 42.3 14.61 48 24 48z"/>
            </svg>
            {isLoading ? 'Redirecting…' : 'Sign in with Google'}
          </button>

          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Need access?{' '}
            <a
              href="mailto:trip.ochenski@valleycreek.org"
              className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Contact trip.ochenski@valleycreek.org
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <ProtectedRoute requireAuth={false}>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-700 dark:text-gray-300">Loading…</div>}>
        <LoginContent />
      </Suspense>
    </ProtectedRoute>
  );
}
