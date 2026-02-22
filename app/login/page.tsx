'use client';

import { Suspense, useMemo, useState, useEffect } from 'react';
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
  const [mounted, setMounted] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    // Trigger entrance animation after mount
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const redirectTo = useMemo(() => {
    const raw = searchParams.get('redirectTo') || '/dashboard';
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
            hd: 'valleycreek.org',
          },
        },
      });
      if (error) {
        setError(error.message);
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed.');
      setIsLoading(false);
    }
  };

  const displayError = error || urlError;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-slate-950 flex items-center justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div
        className={`max-w-sm w-full space-y-6 transition-all duration-500 ease-out ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* Brand */}
        <div className="text-center">
          <div className="mx-auto h-20 w-20 flex items-center justify-center">
            <Image
              src="/icon-192x192.png"
              alt="RADIUS Logo"
              width={80}
              height={80}
              className="rounded-2xl shadow-lg shadow-blue-900/30"
              priority
            />
          </div>
          <h2 className="mt-5 text-center text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Welcome to RADIUS
          </h2>
          <p className="mt-1.5 text-center text-sm text-gray-400">
            Circle Leader Management
          </p>
        </div>

        {/* Card */}
        <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-xl p-5 sm:p-7 space-y-5">
          {displayError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3.5 text-sm text-red-300 leading-relaxed animate-in fade-in">
              {displayError}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full relative py-3 px-4 bg-white hover:bg-gray-50 text-gray-800 font-semibold rounded-xl shadow-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900
              flex items-center justify-center gap-3 transition-all duration-150
              disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {isLoading ? (
              <>
                <div className="absolute left-4 w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                <span className="ml-2">Signing in…</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20" className="shrink-0">
                  <path fill="#4285F4" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.22l6.85-6.85C36.36 2.34 30.55 0 24 0 14.61 0 6.27 5.7 2.13 14.02l7.98 6.21C12.13 13.13 17.56 9.5 24 9.5z"/>
                  <path fill="#34A853" d="M46.1 24.5c0-1.64-.15-3.22-.43-4.75H24v9.02h12.47c-.54 2.92-2.18 5.39-4.66 7.06l7.25 5.63C43.73 37.13 46.1 31.27 46.1 24.5z"/>
                  <path fill="#FBBC05" d="M10.11 28.23c-1.13-3.36-1.13-6.97 0-10.33l-7.98-6.21C.41 16.61 0 20.22 0 24c0 3.78.41 7.39 2.13 10.31l7.98-6.08z"/>
                  <path fill="#EA4335" d="M24 44c6.55 0 12.36-2.17 16.97-5.94l-7.25-5.63c-2.01 1.35-4.59 2.13-7.72 2.13-6.44 0-11.87-3.63-13.89-8.73l-7.98 6.08C6.27 42.3 14.61 48 24 48z"/>
                </svg>
                Sign in with Google
              </>
            )}
          </button>

          <p className="text-center text-xs text-gray-500 leading-relaxed">
            Use your <span className="text-gray-300 font-medium">@valleycreek.org</span> account
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-gray-600">
          Need access?{' '}
          <a href="mailto:trip.ochenski@valleycreek.org" className="text-blue-400/80 hover:text-blue-400 hover:underline transition-colors">
            Contact trip.ochenski@valleycreek.org
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <ProtectedRoute requireAuth={false}>
      <Suspense fallback={
        <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-slate-950 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
        </div>
      }>
        <LoginContent />
      </Suspense>
    </ProtectedRoute>
  );
}
