'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAssistantConnections, type AssistantActivity } from '../../hooks/useAssistantConnections';

const ZONE = 'America/Chicago';

const TOOL_LABELS: Record<string, string> = {
  search_leaders: 'Searched leaders',
  get_leader: 'Read a leader profile',
  list_leader_notes: 'Read a leader’s notes',
  list_leader_connections: 'Read a leader’s interactions',
  list_follow_ups: 'Listed follow-ups',
};

const when = (iso: string | null) =>
  iso ? DateTime.fromISO(iso).setZone(ZONE).toFormat('LLL d, h:mm a') : 'Never';

const ago = (iso: string | null) => (iso ? DateTime.fromISO(iso).toRelative() ?? when(iso) : 'Never used');

function describe(row: AssistantActivity) {
  const label = (row.tool && TOOL_LABELS[row.tool]) || row.tool || 'Request';
  if (row.ok === false) return `${label} (didn’t complete)`;
  if (row.result_count === null) return label;
  return `${label}: ${row.result_count} ${row.result_count === 1 ? 'record' : 'records'}`;
}

const dangerBtn = [
  'px-4 py-2 rounded-xl text-sm font-semibold text-red-300',
  'border border-red-500/40 bg-transparent hover:bg-red-500/10',
  'transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400',
].join(' ');
const quietBtn = [
  'px-4 py-2 rounded-xl text-sm font-semibold text-slate-200',
  'border border-white/15 bg-transparent hover:bg-white/5',
  'transition-colors duration-150 disabled:opacity-50',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-vc-400',
].join(' ');
const card = 'bg-brand-dark border border-white/10 rounded-2xl shadow-card-glass p-5 sm:p-6';

export default function AssistantAccessPage() {
  const router = useRouter();
  const { data, loading, busy, error, disconnect, disconnectAll } = useAssistantConnections();
  // Which button is waiting for a second click: a connection id, or 'all'.
  const [confirming, setConfirming] = useState<string | null>(null);

  const connections = data?.connections ?? [];

  const confirmThen = async (key: string, action: () => Promise<void>) => {
    if (confirming !== key) {
      setConfirming(key);
      return;
    }
    setConfirming(null);
    await action();
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0f1117]">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-6">
          <div>
            <button
              type="button"
              onClick={() => router.push('/settings')}
              className="text-sm text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-vc-400 rounded"
            >
              Back to Settings
            </button>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-white">Assistant access</h1>
            <p className="mt-2 text-slate-400 leading-relaxed">
              An AI assistant you connect can read leaders, their notes, interactions and follow-ups. It can’t change anything.
              Disconnecting stops it immediately.
            </p>
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {loading && <p className="text-sm text-slate-400">Loading…</p>}

          {!loading && data && !data.enabled && (
            <div className={card}>
              <p className="text-sm text-slate-300 leading-relaxed">
                Assistant access isn’t turned on for this account, so nothing can be connected. An administrator enables it.
              </p>
            </div>
          )}

          {!loading && data && (
            <section className={card} aria-labelledby="connected-heading">
              <div className="flex items-start justify-between gap-4">
                <h2 id="connected-heading" className="text-base font-semibold text-white">
                  Connected assistants
                </h2>
                {connections.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    {confirming === 'all' && (
                      <button type="button" onClick={() => setConfirming(null)} className={quietBtn} disabled={busy}>
                        Keep
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => confirmThen('all', disconnectAll)}
                      disabled={busy}
                      className={dangerBtn}
                    >
                      {confirming === 'all' ? 'Yes, disconnect everything' : 'Disconnect everything'}
                    </button>
                  </div>
                )}
              </div>

              {connections.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                  Nothing is connected. To connect an assistant, start from the assistant itself; you’ll be asked to approve it here.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-white/10">
                  {connections.map((c) => (
                    <li key={c.id} className="py-4 first:pt-0 last:pb-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-white">{c.assistant}</p>
                        <p className="mt-0.5 text-sm text-slate-400">
                          Connected {when(c.connected_at)}. Last used {ago(c.last_used_at)}.
                        </p>
                        <p className="text-sm text-slate-500">Access ends {when(c.expires_at)} unless you disconnect sooner.</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {confirming === c.id && (
                          <button type="button" onClick={() => setConfirming(null)} className={quietBtn} disabled={busy}>
                            Keep
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => confirmThen(c.id, () => disconnect(c.id))}
                          disabled={busy}
                          className={dangerBtn}
                        >
                          {confirming === c.id ? `Yes, disconnect ${c.assistant}` : 'Disconnect'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!loading && data && (
            <section className={card} aria-labelledby="activity-heading">
              <h2 id="activity-heading" className="text-base font-semibold text-white">
                Recent activity
              </h2>
              {data.activity.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">Nothing yet. Each read an assistant makes shows up here.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.activity.map((row, i) => (
                    <li key={`${row.at}-${i}`} className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="text-slate-200">{describe(row)}</span>
                      <span className="shrink-0 text-slate-500">{when(row.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
