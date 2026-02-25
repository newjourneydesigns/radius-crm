'use client';

import { Suspense, useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import ProtectedRoute from '../../components/ProtectedRoute';

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized_user: 'Access denied. Only invited users can sign in. Contact an administrator for access.',
  auth_failed: 'Authentication failed. Please try again.',
  invalid_email: 'Please enter a valid email address.',
  invalid_code: 'Invalid or expired code. Please try again.',
};

function LoginContent() {
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cooldownRef = useRef<NodeJS.Timeout | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    cooldownRef.current = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => {
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    };
  }, [cooldown]);

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

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  /* ── Step 1: Send OTP code ── */
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      setError(ERROR_MESSAGES.invalid_email);
      return;
    }
    if (cooldown > 0) return; // Respect cooldown

    setIsLoading(true);
    setError('');

    try {
      // Race the OTP request against a 15-second timeout so it never hangs
      const otpPromise = supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: false, // invite-only
        },
      });

      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'Request timed out. Please check your connection and try again.' } }), 15000)
      );

      const { error } = await Promise.race([otpPromise, timeoutPromise]);

      if (error) {
        if (error.message.includes('not found') || error.message.includes('User not found') || error.message.includes('Signups not allowed')) {
          setError(ERROR_MESSAGES.unauthorized_user);
        } else if (error.message.toLowerCase().includes('rate') || error.message.toLowerCase().includes('limit')) {
          setError('Too many requests. Please wait a minute before trying again.');
          setCooldown(60);
        } else {
          setError(error.message);
        }
        setIsLoading(false);
        return;
      }

      // Start 60-second cooldown to prevent rate-limit stacking
      setCooldown(60);
      setStep('code');
      setIsLoading(false);
      // Focus first OTP input after transition
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      setError(err.message || 'Failed to send code. Please try again.');
      setIsLoading(false);
    }
  };

  /* ── Step 2: Verify OTP code ── */
  const verifyCode = async (code: string) => {
    setIsVerifying(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code,
        type: 'email',
      });

      if (error) {
        setError(ERROR_MESSAGES.invalid_code);
        setOtpCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        setIsVerifying(false);
        return;
      }

      if (data.session) {
        // Verify user exists in our system (invite-only)
        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('id, email, role')
          .eq('id', data.session.user.id)
          .single();

        if (profileError || !userProfile) {
          await supabase.auth.signOut();
          setError(ERROR_MESSAGES.unauthorized_user);
          setStep('email');
          setOtpCode(['', '', '', '', '', '']);
          setIsVerifying(false);
          return;
        }

        router.replace(redirectTo);
      } else {
        setError('Verification failed. Please try again.');
        setIsVerifying(false);
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
      setIsVerifying(false);
    }
  };

  /* ── OTP input handlers ── */
  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...otpCode];
    newCode[index] = digit;
    setOtpCode(newCode);

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    const fullCode = newCode.join('');
    if (fullCode.length === 6 && newCode.every(d => d !== '')) {
      verifyCode(fullCode);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 0) return;
    const newCode = [...otpCode];
    for (let i = 0; i < 6; i++) {
      newCode[i] = pasted[i] || '';
    }
    setOtpCode(newCode);
    if (pasted.length === 6) {
      verifyCode(pasted);
    } else {
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  const displayError = error || urlError;

  /* ── Code entry step ── */
  if (step === 'code') {
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
              <Image src="/icon-192x192.png" alt="RADIUS Logo" width={80} height={80}
                className="rounded-2xl shadow-lg shadow-blue-900/30" priority />
            </div>
            <h2 className="mt-5 text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Enter Your Code
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              We sent a 6-digit code to
            </p>
            <p className="text-sm font-semibold text-white">{email}</p>
          </div>

          {/* Code Card */}
          <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-xl p-5 sm:p-7 space-y-5">
            {displayError && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3.5 text-sm text-red-300 leading-relaxed">
                {displayError}
              </div>
            )}

            {/* OTP Inputs */}
            <div className="flex justify-center gap-2 sm:gap-3" onPaste={handleOtpPaste}>
              {otpCode.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  disabled={isVerifying}
                  className={`w-11 h-14 sm:w-12 sm:h-16 text-center text-xl sm:text-2xl font-bold rounded-xl border-2 bg-gray-900/50 text-white
                    transition-all duration-150 outline-none
                    ${digit ? 'border-blue-500 shadow-sm shadow-blue-500/20' : 'border-gray-600'}
                    focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30
                    disabled:opacity-60`}
                />
              ))}
            </div>

            {isVerifying && (
              <div className="flex items-center justify-center gap-2 text-sm text-blue-400">
                <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                Verifying...
              </div>
            )}

            <div className="flex flex-col gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setOtpCode(['', '', '', '', '', '']);
                  setError('');
                }}
                className="w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900
                  transition-all duration-150 active:scale-[0.98]"
              >
                Use a different email
              </button>

              <button
                type="button"
                onClick={handleSendCode as any}
                disabled={isLoading || cooldown > 0}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 disabled:hover:text-blue-400"
              >
                {isLoading ? 'Sending...' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-gray-500">
            Code may take up to 60 seconds to arrive. Check your spam folder.
          </p>
        </div>
      </div>
    );
  }

  /* ── Email entry step ── */
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
            <Image src="/icon-192x192.png" alt="RADIUS Logo" width={80} height={80}
              className="rounded-2xl shadow-lg shadow-blue-900/30" priority />
          </div>
          <h2 className="mt-5 text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Welcome to RADIUS
          </h2>
          <p className="mt-1.5 text-sm text-gray-400">
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

          <form onSubmit={handleSendCode} className="space-y-4">
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
              disabled={isLoading || !email || cooldown > 0}
              className="w-full relative py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900
                flex items-center justify-center gap-3 transition-all duration-150
                disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Sending code...</span>
                </>
              ) : cooldown > 0 ? (
                <span>Resend in {cooldown}s</span>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Send sign-in code
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
            We'll send a 6-digit code to your email.<br />No password required.
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
