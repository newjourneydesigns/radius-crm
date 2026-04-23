'use client';

import { Suspense, useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import { getRememberMe, setRememberMe } from '../../lib/rememberMeStorage';
import ProtectedRoute from '../../components/ProtectedRoute';

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized_user: 'Access denied. Only invited users can sign in. Contact an administrator for access.',
  auth_failed: 'Authentication failed. Please try again.',
  invalid_email: 'Please enter a valid email address.',
  invalid_code: 'Invalid or expired code. Please try again.',
};

function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'magic' | 'password'>('password');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [mounted, setMounted] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [rememberMe, setRememberMeState] = useState(true);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cooldownRef = useRef<NodeJS.Timeout | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    setRememberMeState(getRememberMe());
    return () => clearTimeout(t);
  }, []);

  const handleRememberMeChange = (checked: boolean) => {
    setRememberMeState(checked);
    setRememberMe(checked);
  };

  useEffect(() => {
    if (cooldown <= 0) return;
    cooldownRef.current = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => { if (cooldownRef.current) clearTimeout(cooldownRef.current); };
  }, [cooldown]);

  const redirectTo = useMemo(() => {
    const raw = searchParams.get('redirectTo') || '/calendar';
    if (!raw.startsWith('/')) return '/calendar';
    if (raw.startsWith('//')) return '/calendar';
    if (raw.startsWith('/login')) return '/calendar';
    if (raw.startsWith('/auth')) return '/calendar';
    return raw;
  }, [searchParams]);

  const urlError = useMemo(() => {
    const key = searchParams.get('error') || '';
    return ERROR_MESSAGES[key] || (key ? 'Sign-in error. Please try again.' : '');
  }, [searchParams]);

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  /* ── Password sign-in ── */
  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) { setError(ERROR_MESSAGES.invalid_email); return; }
    if (!password) { setError('Please enter your password.'); return; }
    setIsLoading(true);
    setError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        setError(error.message.includes('Invalid login credentials') ? 'Incorrect email or password.' : error.message);
        setIsLoading(false);
        return;
      }
      if (data.session) {
        const { data: userProfile, error: profileError } = await supabase
          .from('users').select('id').eq('id', data.session.user.id).single();
        if (profileError || !userProfile) {
          await supabase.auth.signOut();
          setError(ERROR_MESSAGES.unauthorized_user);
          setIsLoading(false);
          return;
        }
        router.replace(redirectTo);
      }
    } catch (err: any) {
      setError(err.message || 'Sign-in failed. Please try again.');
      setIsLoading(false);
    }
  };

  /* ── Forgot password ── */
  const handleForgotPassword = async () => {
    if (!validateEmail(email)) { setError('Enter your email address above first.'); return; }
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/auth/reset-password` }
    );
    setIsLoading(false);
    if (error) setError(error.message);
    else setSuccessMessage('Password reset email sent. Check your inbox.');
  };

  /* ── Send OTP ── */
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) { setError(ERROR_MESSAGES.invalid_email); return; }
    if (cooldown > 0) return;
    setIsLoading(true);
    setError('');
    try {
      const otpPromise = supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false },
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
      setCooldown(60);
      setStep('code');
      setIsLoading(false);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      setError(err.message || 'Failed to send code. Please try again.');
      setIsLoading(false);
    }
  };

  /* ── Verify OTP ── */
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
        const { data: userProfile, error: profileError } = await supabase
          .from('users').select('id, email, role').eq('id', data.session.user.id).single();
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
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...otpCode];
    newCode[index] = digit;
    setOtpCode(newCode);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    const fullCode = newCode.join('');
    if (fullCode.length === 6 && newCode.every(d => d !== '')) verifyCode(fullCode);
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted.length) return;
    const newCode = Array.from({ length: 6 }, (_, i) => pasted[i] || '');
    setOtpCode(newCode);
    if (pasted.length === 6) verifyCode(pasted);
    else inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const displayError = error || urlError;

  const inputClass = [
    'w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-500',
    'bg-slate-700/60 border border-slate-600',
    'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
    'transition-colors duration-150 disabled:opacity-50',
  ].join(' ');

  const pageWrap = `min-h-screen bg-slate-900 flex items-center justify-center py-8 px-4`;
  const cardClass = `bg-slate-800 border border-slate-700 rounded-2xl shadow-card-glass p-6 sm:p-8 space-y-5`;
  const primaryBtn = [
    'w-full py-3 px-4 rounded-xl font-semibold text-sm text-white',
    'bg-btn-primary hover:opacity-90 active:scale-[0.98]',
    'flex items-center justify-center gap-2.5',
    'transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
    'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900',
  ].join(' ');

  /* ── Code entry step ── */
  if (step === 'code') {
    return (
      <div className={pageWrap}>
        <div className={`max-w-sm w-full space-y-6 transition-all duration-500 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {/* Brand */}
          <div className="text-center">
            <div className="mx-auto h-16 w-16 flex items-center justify-center">
              <Image src="/icon-192x192.png" alt="RADIUS" width={64} height={64} className="rounded-2xl" priority />
            </div>
            <h2 className="mt-4 text-xl font-bold text-white tracking-tight">Check your email</h2>
            <p className="mt-1 text-sm text-slate-400">
              6-digit code sent to <span className="text-white font-medium">{email}</span>
            </p>
          </div>

          <div className={cardClass}>
            {displayError && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-300 leading-relaxed">
                {displayError}
              </div>
            )}

            <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
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
                  className={[
                    'w-11 h-14 text-center text-xl font-bold rounded-xl border-2',
                    'bg-slate-700/60 text-white outline-none transition-all duration-150',
                    digit ? 'border-indigo-500 shadow-sm shadow-indigo-500/20' : 'border-slate-600',
                    'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50',
                  ].join(' ')}
                />
              ))}
            </div>

            {isVerifying && (
              <div className="flex items-center justify-center gap-2 text-sm text-indigo-400">
                <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                Verifying…
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setStep('email'); setOtpCode(['', '', '', '', '', '']); setError(''); }}
                className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                Use a different email
              </button>
              <button
                type="button"
                onClick={handleSendCode as any}
                disabled={isLoading || cooldown > 0}
                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50 py-1"
              >
                {isLoading ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-slate-600">
            Code may take up to 60 seconds. Check your spam folder.
          </p>
        </div>
      </div>
    );
  }

  /* ── Email / password step ── */
  return (
    <div className={pageWrap}>
      <div className={`max-w-sm w-full space-y-6 transition-all duration-500 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

        {/* Brand */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 flex items-center justify-center">
            <Image src="/icon-192x192.png" alt="RADIUS" width={64} height={64} className="rounded-2xl" priority />
          </div>
          <h2 className="mt-4 text-xl font-bold text-white tracking-tight">Welcome to RADIUS</h2>
          <p className="mt-1 text-sm text-slate-400">Circle Leader Management</p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-slate-800 border border-slate-700 rounded-xl p-1 gap-1">
          <button
            type="button"
            onClick={() => { setMode('password'); setError(''); setSuccessMessage(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
              mode === 'password'
                ? 'bg-btn-primary text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => { setMode('magic'); setError(''); setSuccessMessage(''); setPassword(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
              mode === 'magic'
                ? 'bg-btn-primary text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Magic Link
          </button>
        </div>

        {/* Card */}
        <div className={cardClass}>
          {displayError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-300 leading-relaxed">
              {displayError}
            </div>
          )}
          {successMessage && (
            <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3 text-sm text-green-300 leading-relaxed">
              {successMessage}
            </div>
          )}

          {mode === 'magic' ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                  Email address
                </label>
                <input id="email" name="email" type="email" autoComplete="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@valleycreek.org" className={inputClass} disabled={isLoading} />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                  <input type="checkbox" checked={rememberMe} onChange={e => handleRememberMeChange(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 accent-indigo-500 cursor-pointer" />
                  <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">Stay signed in</span>
                </label>
                <span className="text-xs text-slate-600">{rememberMe ? 'Persistent session' : 'Signs out on close'}</span>
              </div>

              <button type="submit" disabled={isLoading || !email || cooldown > 0} className={primaryBtn}>
                {isLoading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending code…</>
                ) : cooldown > 0 ? `Resend in ${cooldown}s` : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>Send sign-in code</>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordSignIn} className="space-y-4">
              <div>
                <label htmlFor="email-pw" className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                  Email address
                </label>
                <input id="email-pw" name="email" type="email" autoComplete="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@valleycreek.org" className={inputClass} disabled={isLoading} />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                  Password
                </label>
                <input id="password" name="password" type="password" autoComplete="current-password" required
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" className={inputClass} disabled={isLoading} />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                  <input type="checkbox" checked={rememberMe} onChange={e => handleRememberMeChange(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 accent-indigo-500 cursor-pointer" />
                  <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">Stay signed in</span>
                </label>
                <button type="button" onClick={handleForgotPassword} disabled={isLoading}
                  className="text-xs text-indigo-400/80 hover:text-indigo-400 hover:underline transition-colors disabled:opacity-50">
                  Forgot password?
                </button>
              </div>

              <button type="submit" disabled={isLoading || !email || !password} className={primaryBtn}>
                {isLoading
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in…</>
                  : 'Sign in'}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600">
          Need access?{' '}
          <a href="mailto:trip.ochenski@valleycreek.org" className="text-indigo-400/80 hover:text-indigo-400 hover:underline transition-colors">
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
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      }>
        <LoginContent />
      </Suspense>
    </ProtectedRoute>
  );
}
