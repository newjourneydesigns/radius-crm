'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../../../lib/supabase';

// How long to wait for Supabase to turn the link into a session before telling
// the leader it didn't work. Generous for a slow connection, far short of the
// two minutes someone will otherwise sit watching a spinner.
const LINK_TIMEOUT_MS = 10_000;

const EXPIRED_LINK_MESSAGE =
  'This reset link has expired or was already used. Reset links work once, and some email providers ' +
  'open them to scan before you do. Get a new one from the sign-in page, or sign in with a magic ' +
  'link instead.';

const UNVERIFIED_LINK_MESSAGE =
  "This reset link didn't check out. It may have expired, already been used, or been opened in a " +
  'different browser than the one that asked for it. Get a new one from the sign-in page, or sign ' +
  'in with a magic link instead.';

/**
 * Supabase hands a dead recovery link back as `error` / `error_code` in the URL
 * — the hash on the implicit flow this app uses, the query string on some
 * redirects — and no session. Nothing read those, so every failure looked
 * identical to "still working on it" and the page spun forever (reported
 * 2026-09-15 by a leader who waited over two minutes).
 */
function readLinkError(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const pick = (key: string) => hash.get(key) || query.get(key);

  const code = pick('error_code');
  const error = pick('error');
  if (!code && !error) return null;

  if (code === 'otp_expired' || error === 'access_denied') return EXPIRED_LINK_MESSAGE;
  return UNVERIFIED_LINK_MESSAGE;
}

function ResetPasswordContent() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ready, setReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [linkError, setLinkError] = useState('');
  const [success, setSuccess] = useState(false);

  // Supabase sends a PASSWORD_RECOVERY event once it processes the reset link
  useEffect(() => {
    // A rejected link is final. Stop here rather than letting an unrelated
    // session already in this browser stand in for a token Supabase just refused.
    const urlError = readLinkError();
    if (urlError) {
      setLinkError(urlError);
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      setLinkError(UNVERIFIED_LINK_MESSAGE);
    }, LINK_TIMEOUT_MS);

    // A session arriving late still wins: clear the timeout message and show
    // the form rather than making someone request a second link.
    const markReady = () => {
      settled = true;
      clearTimeout(timer);
      setLinkError('');
      setReady(true);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) markReady();
    });

    // Also check if there's already an active recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) markReady();
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.replace('/boards'), 2500);
  };

  const inputClass = "w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-transparent transition-all duration-150 disabled:opacity-60";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-zinc-950 flex items-center justify-center py-12 px-4">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center">
          <div className="mx-auto h-20 w-20 flex items-center justify-center">
            <Image src="/icon-192x192.png" alt="Radius Logo" width={80} height={80}
              className="rounded-2xl shadow-lg shadow-blue-900/30" priority />
          </div>
          <h2 className="mt-5 text-2xl font-bold text-white tracking-tight">
            {linkError ? 'Reset link not accepted' : 'Set new password'}
          </h2>
          {!linkError && (
            <p className="mt-1.5 text-sm text-gray-400">Choose a strong password for your account.</p>
          )}
        </div>

        <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-xl p-5 sm:p-7 space-y-5">
          {success ? (
            <div className="text-center space-y-3 py-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white font-medium">Password updated!</p>
              <p className="text-sm text-gray-400">Redirecting you in…</p>
            </div>
          ) : linkError ? (
            <div className="space-y-5">
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3.5 text-sm text-red-200 leading-relaxed">
                {linkError}
              </div>
              <button type="button" onClick={() => router.replace('/login')}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-vc-500 focus:ring-offset-2 focus:ring-offset-gray-900
                  transition-all duration-150 active:scale-[0.98]">
                Go to sign in
              </button>
            </div>
          ) : !ready ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-8 h-8 border-2 border-gray-700 border-t-vc-500 rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-400">Verifying reset link…</p>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3.5 text-sm text-red-300">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-300 mb-2">
                  New password
                </label>
                <input id="new-password" type="password" autoComplete="new-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters" className={inputClass} disabled={isLoading} />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm password
                </label>
                <input id="confirm-password" type="password" autoComplete="new-password" required
                  value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat your password" className={inputClass} disabled={isLoading} />
              </div>
              <button type="submit" disabled={isLoading || !password || !confirm}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-vc-500 focus:ring-offset-2 focus:ring-offset-gray-900
                  flex items-center justify-center gap-3 transition-all duration-150
                  disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]">
                {isLoading
                  ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Saving...</span></>
                  : 'Set new password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-700 border-t-vc-500 rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
