'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Stage = 'identifier' | 'code';

export default function SignInForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('identifier');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/circle-summary/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.message || 'Something went wrong.');
        return;
      }
      setInfo(data.message || 'Check your email for a 6-digit code.');
      setStage('code');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/circle-summary/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: email.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid code.');
        return;
      }
      // Navigate straight to the group-scoped events page when we know the
      // group. Falls back to the legacy redirector only if it's missing.
      const groupId = data.ccbGroupId;
      router.replace(
        groupId != null ? `/circle-summary/${groupId}/events` : '/circle-summary/events'
      );
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cs-card">
      {stage === 'identifier' && (
        <>
          <h2 className="cs-display text-2xl sm:text-3xl text-neutral-900 mb-2">
            Let's get you in
          </h2>
          <p className="text-sm text-neutral-600 mb-5">
            Enter the email on your Circle profile.
          </p>

          {error && <div className="cs-alert cs-alert-error mb-4">{error}</div>}

          <form onSubmit={requestCode} className="space-y-4">
            <div>
              <label className="cs-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="cs-input"
              />
            </div>
            <button
              type="submit"
              className="cs-btn cs-btn-primary w-full"
              disabled={submitting || !email.trim()}
            >
              {submitting ? 'Sending code…' : 'Send me a code'}
            </button>
            <p className="text-xs text-neutral-500 text-center pt-1">
              Need help? Contact your ACPD.
            </p>
          </form>
        </>
      )}

      {stage === 'code' && (
        <>
          <h2 className="cs-display text-2xl sm:text-3xl text-neutral-900 mb-2">
            Check your email
          </h2>
          {info && <div className="cs-alert cs-alert-info mb-4">{info}</div>}
          {error && <div className="cs-alert cs-alert-error mb-4">{error}</div>}

          <form onSubmit={verifyCode} className="space-y-4">
            <div>
              <label className="cs-label" htmlFor="code">
                6-digit code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoFocus
                required
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="cs-input text-center text-2xl tracking-[0.5em] font-mono"
              />
            </div>
            <button
              type="submit"
              className="cs-btn cs-btn-primary w-full"
              disabled={submitting || code.length !== 6}
            >
              {submitting ? 'Verifying…' : 'Continue'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStage('identifier');
                setCode('');
                setError(null);
                setInfo(null);
              }}
              className="cs-btn cs-btn-ghost w-full"
            >
              Use a different email
            </button>
          </form>
        </>
      )}
    </div>
  );
}
