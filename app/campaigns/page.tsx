'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useCampaigns, Campaign } from '../../hooks/useCampaigns';

function CompletionBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-base-content/30 text-sm">—</span>;
  const color = pct >= 80 ? 'badge-success' : pct >= 50 ? 'badge-warning' : 'badge-error';
  return <span className={`badge badge-sm ${color}`}>{pct.toFixed(0)}%</span>;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return DateTime.fromISO(iso).toFormat('MMM d, yyyy');
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
    try {
      await archiveCampaign(c.id);
    } finally {
      setArchiving(null);
    }
  }

  async function handleRestore(c: Campaign) {
    setArchiving(c.id);
    try {
      await restoreCampaign(c.id);
    } finally {
      setArchiving(null);
    }
  }

  return (
    <ProtectedRoute adminOnly>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Follow-Up Campaigns</h1>
            <p className="text-base-content/50 text-sm mt-0.5">
              Reconcile a CCB group against a CCB form to track who's submitted and follow up with those who haven't.
            </p>
          </div>
          <Link href="/campaigns/new" className="btn btn-primary btn-sm">
            + New Campaign
          </Link>
        </div>

        {/* Archived toggle */}
        {archived.length > 0 || showArchived ? (
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
            />
            <span className="text-sm text-base-content/60">
              Show archived ({archived.length})
            </span>
          </label>
        ) : null}

        {/* Error */}
        {error && (
          <div className="alert alert-error text-sm">{error}</div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-md" />
          </div>
        )}

        {/* Empty state */}
        {!loading && visible.length === 0 && (
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body items-center text-center py-16">
              <p className="text-base-content/50 text-sm">No campaigns yet.</p>
              <Link href="/campaigns/new" className="btn btn-sm btn-primary mt-3">
                Create your first campaign
              </Link>
            </div>
          </div>
        )}

        {/* Campaign table */}
        {!loading && visible.length > 0 && (
          <div className="card bg-base-200 border border-base-300 overflow-x-auto">
            <table className="table table-zebra w-full text-sm">
              <thead>
                <tr className="text-base-content/50 text-xs uppercase tracking-wider">
                  <th>Campaign</th>
                  <th className="text-right">Expected</th>
                  <th className="text-right">Submitted</th>
                  <th className="text-right">Missing</th>
                  <th>Done</th>
                  <th>Due</th>
                  <th>Last Reconciled</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(c => (
                  <tr key={c.id} className={c.archived_at ? 'opacity-50' : ''}>
                    <td>
                      <Link href={`/campaigns/${c.id}`} className="font-medium hover:text-primary transition-colors">
                        {c.name}
                      </Link>
                      {c.archived_at && (
                        <span className="badge badge-xs badge-ghost ml-2">archived</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{c.expected_count ?? '—'}</td>
                    <td className="text-right tabular-nums text-success">{c.submitted_count ?? '—'}</td>
                    <td className="text-right tabular-nums text-error">{c.missing_count ?? '—'}</td>
                    <td><CompletionBadge pct={c.completion_pct} /></td>
                    <td className="whitespace-nowrap">{formatDate(c.due_date)}</td>
                    <td className="whitespace-nowrap text-base-content/40">
                      {c.last_reconciled_at ? formatDate(c.last_reconciled_at) : <span className="italic">Not yet</span>}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Link href={`/campaigns/${c.id}`} className="btn btn-ghost btn-xs">
                          View
                        </Link>
                        {c.archived_at ? (
                          <button
                            className="btn btn-ghost btn-xs"
                            disabled={archiving === c.id}
                            onClick={() => handleRestore(c)}
                          >
                            {archiving === c.id ? <span className="loading loading-spinner loading-xs" /> : 'Restore'}
                          </button>
                        ) : (
                          <button
                            className="btn btn-ghost btn-xs text-base-content/40"
                            disabled={archiving === c.id}
                            onClick={() => handleArchive(c)}
                          >
                            {archiving === c.id ? <span className="loading loading-spinner loading-xs" /> : 'Archive'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
