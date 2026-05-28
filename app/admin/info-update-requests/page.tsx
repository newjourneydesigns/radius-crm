'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Row = {
  id: string;
  leader_id: number;
  existing_day: string | null;
  existing_time: string | null;
  existing_location: string | null;
  proposed_day: string | null;
  proposed_time: string | null;
  proposed_location: string | null;
  review_action: 'applied' | 'rejected' | 'deferred' | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  circle_leaders: { name: string; campus: string | null; acpd: string | null };
};

export default function InfoUpdateRequestsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'reviewed'>('pending');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token || null));
  }, []);
  useEffect(() => {
    if (token) refresh();
  }, [token, tab]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/info-update-requests?status=${tab}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load.');
      setRows(data.requests || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function review(
    id: string,
    action: 'applied' | 'rejected' | 'deferred',
    applyToLeader: boolean
  ) {
    const notes = action === 'rejected' ? prompt('Optional note for the record:') ?? null : null;
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/info-update-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, action, notes, applyToLeader }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed.');
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold text-white tracking-tight mb-1">
          Circle info update requests
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Leader-requested changes to meeting day, time, or location.
        </p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('pending')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'pending'
                ? 'bg-vc-500/20 text-vc-200'
                : 'text-slate-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setTab('reviewed')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'reviewed'
                ? 'bg-vc-500/20 text-vc-200'
                : 'text-slate-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            Reviewed
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            <div className="animate-pulse bg-zinc-700 rounded-xl h-24" />
            <div className="animate-pulse bg-zinc-700 rounded-xl h-24" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 bg-zinc-800 border border-zinc-700 rounded-xl">
            <p className="text-slate-400 text-sm">
              {tab === 'pending' ? 'No pending requests.' : 'No reviewed requests yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 shadow-card-glass"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-medium text-white">{r.circle_leaders?.name}</p>
                    <p className="text-xs text-slate-400">
                      {[r.circle_leaders?.campus, r.circle_leaders?.acpd]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 shrink-0">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="space-y-2 text-sm mb-3">
                  {(r.existing_day || r.proposed_day) && (
                    <ChangeRow
                      label="Meeting day"
                      from={r.existing_day}
                      to={r.proposed_day}
                    />
                  )}
                  {(r.existing_time || r.proposed_time) && (
                    <ChangeRow
                      label="Meeting time"
                      from={r.existing_time}
                      to={r.proposed_time}
                    />
                  )}
                  {(r.existing_location || r.proposed_location) && (
                    <ChangeRow
                      label="Meeting location"
                      from={r.existing_location}
                      to={r.proposed_location}
                    />
                  )}
                </div>

                {r.review_action ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full ${
                        r.review_action === 'applied'
                          ? 'bg-green-500/20 text-green-300'
                          : r.review_action === 'rejected'
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {r.review_action}
                    </span>
                    {r.reviewed_at && (
                      <span className="text-slate-500">
                        {new Date(r.reviewed_at).toLocaleDateString()}
                      </span>
                    )}
                    {r.review_notes && <span className="text-slate-400">— {r.review_notes}</span>}
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => review(r.id, 'applied', true)}
                      disabled={busyId === r.id}
                      className="bg-btn-success text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      Apply &amp; update leader
                    </button>
                    <button
                      onClick={() => review(r.id, 'applied', false)}
                      disabled={busyId === r.id}
                      className="bg-zinc-700 hover:bg-zinc-600 text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium"
                    >
                      Mark applied (no leader change)
                    </button>
                    <button
                      onClick={() => review(r.id, 'deferred', false)}
                      disabled={busyId === r.id}
                      className="bg-zinc-700 hover:bg-zinc-600 text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium"
                    >
                      Defer
                    </button>
                    <button
                      onClick={() => review(r.id, 'rejected', false)}
                      disabled={busyId === r.id}
                      className="bg-btn-danger text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChangeRow({
  label,
  from,
  to,
}: {
  label: string;
  from: string | null;
  to: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs uppercase tracking-wide text-slate-500 w-32">{label}</span>
      <span className="text-slate-400 line-through">{from || '(unset)'}</span>
      <span className="text-slate-500">→</span>
      <span className="text-white font-medium">{to || '(unset)'}</span>
    </div>
  );
}
