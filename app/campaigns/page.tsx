'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useCampaigns, Campaign } from '../../hooks/useCampaigns';

function CompletionPill({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-slate-600 text-sm">—</span>;
  const color =
    pct >= 80
      ? 'bg-green-500/20 text-green-400'
      : pct >= 50
      ? 'bg-amber-500/20 text-amber-400'
      : 'bg-red-500/20 text-red-400';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {pct.toFixed(0)}%
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return DateTime.fromISO(iso).toFormat('MMM d, yyyy');
}

function Spinner() {
  return <div className="w-4 h-4 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />;
}

export default function CampaignsPage() {
  const { campaigns, loading, error, fetchCampaigns, archiveCampaign, restoreCampaign } = useCampaigns();
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);

  useEffect(() => {
    fetchCampaigns(showArchived);
  }, [showArchived, fetchCampaigns]);

  const active = campaigns.filter(c => !c.archived_at);
  const archived = campaigns.filter(c => !!c.archived_at);
  const visible = showArchived ? campaigns : active;

  async function handleArchive(c: Campaign) {
    setArchiving(c.id);
    try { await archiveCampaign(c.id); } finally { setArchiving(null); }
  }

  async function handleRestore(c: Campaign) {
    setArchiving(c.id);
    try { await restoreCampaign(c.id); } finally { setArchiving(null); }
  }

  return (
    <ProtectedRoute>
      <div className="p-4 sm:p-6 lg:p-8 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">Follow-Up Campaigns</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Reconcile a CCB group against a CCB form to track who&apos;s submitted and follow up with those who haven&apos;t.
            </p>
          </div>
          <Link
            href="/campaigns/new"
            className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + New Campaign
          </Link>
        </div>

        {/* Archived toggle */}
        {(archived.length > 0 || showArchived) && (
          <label className="flex items-center gap-2 cursor-pointer w-fit mb-4">
            <div
              className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${showArchived ? 'bg-indigo-500' : 'bg-zinc-700'}`}
              onClick={() => setShowArchived(v => !v)}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${showArchived ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-slate-400 select-none" onClick={() => setShowArchived(v => !v)}>
              Show archived ({archived.length})
            </span>
          </label>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center items-center py-16">
            <div className="w-6 h-6 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && visible.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col items-center justify-center py-16 text-center">
            <p className="text-slate-500 text-sm">No campaigns yet.</p>
            <Link
              href="/campaigns/new"
              className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity mt-4"
            >
              Create your first campaign
            </Link>
          </div>
        )}

        {/* Campaign table */}
        {!loading && visible.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-5 py-3">Campaign</th>
                    <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Expected</th>
                    <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Submitted</th>
                    <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Missing</th>
                    <th className="text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Done</th>
                    <th className="text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Due</th>
                    <th className="text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Last Reconciled</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {visible.map(c => (
                    <tr
                      key={c.id}
                      className={`hover:bg-zinc-800/40 transition-colors ${c.archived_at ? 'opacity-50' : ''}`}
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="font-medium text-slate-200 hover:text-white transition-colors"
                        >
                          {c.name}
                        </Link>
                        {c.archived_at && (
                          <span className="ml-2 text-xs text-slate-500 border border-zinc-700 rounded px-1 py-0.5 leading-none">
                            archived
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">{c.expected_count ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-400">{c.submitted_count ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-400">{c.missing_count ?? '—'}</td>
                      <td className="px-4 py-3"><CompletionPill pct={c.completion_pct} /></td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-400">{formatDate(c.due_date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {c.last_reconciled_at ? formatDate(c.last_reconciled_at) : <span className="italic text-slate-600">Not yet</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <Link
                            href={`/campaigns/${c.id}`}
                            className="text-slate-400 hover:text-white hover:bg-zinc-700 px-2.5 py-1 rounded-lg text-xs transition-colors"
                          >
                            View
                          </Link>
                          {c.archived_at ? (
                            <button
                              className="text-slate-400 hover:text-white hover:bg-zinc-700 px-2.5 py-1 rounded-lg text-xs transition-colors disabled:opacity-40 flex items-center gap-1"
                              disabled={archiving === c.id}
                              onClick={() => handleRestore(c)}
                            >
                              {archiving === c.id ? <Spinner /> : 'Restore'}
                            </button>
                          ) : (
                            <button
                              className="text-slate-500 hover:text-slate-300 hover:bg-zinc-700 px-2.5 py-1 rounded-lg text-xs transition-colors disabled:opacity-40 flex items-center gap-1"
                              disabled={archiving === c.id}
                              onClick={() => handleArchive(c)}
                            >
                              {archiving === c.id ? <Spinner /> : 'Archive'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
