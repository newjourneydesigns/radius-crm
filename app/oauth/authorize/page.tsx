'use client';

import { Suspense } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useMcpAuthorization } from '../../../hooks/useMcpAuthorization';

const CAN_SEE = [
  'Circle Leaders: name, campus, ACPD, status and meeting details',
  'The notes on each leader’s profile',
  'Your logged interactions with each leader',
  'Follow-ups, including your own to-dos about leaders',
];

const CANNOT = [
  'Change, add or delete anything in Radius',
  'See phone numbers, emails or birthdays',
  'See prayer requests',
  'Message your leaders',
];

const pageWrap = 'min-h-screen bg-[#0f1117] flex items-center justify-center py-8 px-4';
const cardClass = 'bg-brand-dark border border-white/10 rounded-2xl shadow-card-glass p-6 sm:p-8';
const primaryBtn = [
  'w-full py-3 px-4 rounded-xl font-semibold text-sm text-white',
  'bg-vc-500 hover:bg-vc-600 active:scale-[0.98]',
  'flex items-center justify-center gap-2',
  'transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-vc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#161820]',
].join(' ');
const secondaryBtn = [
  'w-full py-3 px-4 rounded-xl font-semibold text-sm text-slate-200',
  'bg-transparent border border-white/15 hover:bg-white/5',
  'transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-vc-400',
].join(' ');

function Notice({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  const styles = tone === 'error'
    ? 'bg-red-500/10 border-red-500/30 text-red-300'
    : 'bg-white/5 border-white/10 text-slate-300';
  return <div role="alert" className={`rounded-xl border p-3 text-sm leading-relaxed ${styles}`}>{children}</div>;
}

function List({ title, items, kind }: { title: string; items: string[]; kind: 'can' | 'cannot' }) {
  const Icon = kind === 'can' ? Check : X;
  return (
    <section>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300 leading-snug">
            <Icon
              aria-hidden
              className={`mt-0.5 h-4 w-4 shrink-0 ${kind === 'can' ? 'text-vc-400' : 'text-slate-500'}`}
              strokeWidth={2.5}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConsentScreen() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, loading } = useAuth();
  const { state, decide } = useMcpAuthorization(search, !!user);

  const signIn = () => {
    const back = `/oauth/authorize${window.location.search}`;
    router.push(`/login?redirectTo=${encodeURIComponent(back)}`);
  };

  const clientName = 'clientName' in state ? state.clientName : 'your assistant';
  const busy = state.status === 'working' || state.status === 'leaving';

  return (
    <div className={pageWrap}>
      <main className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto h-16 w-16">
            <Image src="/icon-192x192.png" alt="Radius" width={64} height={64} className="rounded-2xl" priority />
          </div>
          {state.status === 'invalid' ? (
            <h1 className="mt-4 text-xl font-bold text-white tracking-tight">This request can’t be approved</h1>
          ) : (
            <h1 className="mt-4 text-xl font-bold text-white tracking-tight">Let {clientName} read Radius?</h1>
          )}
          {user && state.status !== 'invalid' && (
            <p className="mt-1 text-sm text-slate-400">
              Signed in as <span className="font-medium text-white">{user.email}</span>
            </p>
          )}
        </div>

        <div className={`${cardClass} space-y-5`}>
          {state.status === 'checking' && <p className="text-sm text-slate-400">Checking the request…</p>}

          {state.status === 'invalid' && (
            <>
              <Notice tone="error">{state.message}</Notice>
              <p className="text-sm text-slate-400">
                Nothing was shared. Close this tab and start the connection again from your assistant.
              </p>
            </>
          )}

          {(state.status === 'ready' || state.status === 'working' || state.status === 'not-enabled' || state.status === 'error' || state.status === 'leaving') && (
            <>
              <List title={`${clientName} will be able to see`} items={CAN_SEE} kind="can" />
              <List title="It will not be able to" items={CANNOT} kind="cannot" />
              <p className="text-sm text-slate-400 leading-relaxed">
                Radius shares leader information with every signed-in user, so this includes leaders outside your own circles. Access
                ends after 90 days, and every request it makes is logged.
              </p>

              {state.status === 'error' && <Notice tone="error">{state.message}</Notice>}
              {state.status === 'not-enabled' && (
                <Notice tone="error">
                  Assistant access hasn’t been turned on for {user?.email || 'this account'}. Ask whoever manages Radius to enable it, then
                  connect again.
                </Notice>
              )}

              {!loading && !user ? (
                <div className="space-y-3">
                  <Notice tone="info">Sign in to Radius to continue.</Notice>
                  <button type="button" onClick={signIn} className={primaryBtn}>Sign in to Radius</button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row-reverse">
                  <button type="button" onClick={() => decide('approve')} disabled={busy || loading || state.status === 'not-enabled'} className={primaryBtn}>
                    {state.status === 'working' || state.status === 'leaving' ? 'Connecting…' : 'Allow read-only access'}
                  </button>
                  <button type="button" onClick={() => decide('deny')} disabled={busy || loading} className={secondaryBtn}>
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense fallback={null}>
      <ConsentScreen />
    </Suspense>
  );
}
