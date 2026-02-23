'use client';

import { Suspense, useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import ProtectedRoute from '../../components/ProtectedRoute';

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized_user: 'Access denied. Only invited users can sign in. Contact an administrator for access.',
  auth_failed: 'Authentication failed. Please try again.',
  invalid_email: 'Please enter a valid email address.',
};

function LoginContent() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
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

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleMagicLinkSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmail(email)) {
      setError(ERROR_MESSAGES.invalid_email);
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      // Use production domain for redirects to ensure consistent sessions
      const redirectDomain = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      
      // First, check if user exists in our system by attempting to sign in with OTP
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${redirectDomain}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
          // Don't create a new user - only allow existing users
          shouldCreateUser: false,
        },
      });

      if (error) {
        // If user doesn't exist, show unauthorized message
        if (error.message.includes('not found') || error.message.includes('User not found')) {
          setError(ERROR_MESSAGES.unauthorized_user);
        } else {
          setError(error.message);
        }
        setIsLoading(false);
        return;
      }

      // Success - email sent
      setEmailSent(true);
      setIsLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to send magic link. Please try again.');
      setIsLoading(false);
    }
  };

  const displayError = error || urlError;

  // Show success message if email was sent
  if (emailSent) {
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
              Check Your Email
            </h2>
          </div>

          {/* Success Card */}
          <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-xl p-5 sm:p-7 space-y-5">
            <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
                </svg>
                <p className="text-sm text-green-300 font-medium">
                  Magic link sent!
                </p>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                We sent a sign-in link to <span className="font-semibold text-white">{email}</span>
              </p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Click the link in the email to sign in. The link will expire in 1 hour.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setEmailSent(false);
                setEmail('');
                setError('');
              }}
              className="w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900
                transition-all duration-150 active:scale-[0.98]"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

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

          <form onSubmit={handleMagicLinkSignIn} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-500
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  transition-all duration-150"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full relative py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900
                flex items-center justify-center gap-3 transition-all duration-150
                disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Sending magic link...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Send magic link
                </>
              )}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-gray-800/60 text-gray-500">
                Passwordless sign in
              </span>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 leading-relaxed">
            We'll send you a secure sign-in link via email.<br />No password required.
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-gray-600">
          Need access?{' '}
          <a href="mailto:trip.ochenski@valleycreek.org" className="text-blue-400/80 hover:text-blue-400 hover:underline transition-colors">
            Contact an administrator
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
