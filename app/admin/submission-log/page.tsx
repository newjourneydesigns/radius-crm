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
  ccb_event_id: string;
  ccb_group_id: string | null;
  occurrence: string;
  did_not_meet: boolean;
  did_not_meet_reason: string | null;
  topic: string | null;
  status: 'submitted' | 'failed' | 'retrying';
  ccb_error: string | null;
  ccb_submitted_at: string | null;
  submitted_via: string;
  created_at: string;
  circle_leaders: { name: string; campus: string | null; acpd: string | null };
};

export default function SubmissionLogPage() {
  const [token, setToken] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'failed'>('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token || null));
  }, []);
  useEffect(() => {
    if (token) refresh();
  }, [token, statusFilter]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/admin/submission-log', window.location.origin);
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
      url.searchParams.set('limit', '200');
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load.');
      setRows(data.submissions || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-xl font-semibold text-white tracking-tight mb-1">Submission log</h1>
        <p className="text-sm text-slate-400 mb-6">
          Audit trail of every Circle Event Summary submission.
        </p>

        <div className="flex gap-2 mb-4">
          {(['all', 'submitted', 'failed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-vc-500/20 text-vc-200'
                  : 'text-slate-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="animate-pulse bg-zinc-700 rounded-xl h-48" />
        ) : rows.length === 0 ? (
          <div className="text-center py-12 bg-zinc-800 border border-zinc-700 rounded-xl">
            <p className="text-slate-400 text-sm">No submissions match.</p>
          </div>
        ) : (
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/50">
                <tr className="border-b border-zinc-700">
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                    When
                  </th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                    Leader
                  </th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                    Event
                  </th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700/50">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-700/30 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <div className="text-slate-200">
                        {new Date(r.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                      <div className="text-xs text-slate-500">
                        for {new Date(r.occurrence).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-slate-200 font-medium">
                        {r.circle_leaders?.name || `Leader #${r.leader_id}`}
                      </div>
                      <div className="text-xs text-slate-500">
                        {[r.circle_leaders?.campus, r.circle_leaders?.acpd]
                          .filter(Boolean)
                          .join(' • ')}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-slate-200">
                        {r.did_not_meet ? (
                          <span className="text-slate-400 italic">
                            Did not meet
                            {r.did_not_meet_reason ? ` — ${r.did_not_meet_reason}` : ''}
                          </span>
                        ) : (
                          <span>{r.topic || <span className="text-slate-500">(no topic)</span>}</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        CCB event {r.ccb_event_id}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          r.status === 'submitted'
                            ? 'bg-green-500/20 text-green-300'
                            : r.status === 'failed'
                              ? 'bg-red-500/20 text-red-300'
                              : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {r.status}
                      </span>
                      {r.ccb_error && (
                        <div className="text-xs text-red-400 mt-1 max-w-xs truncate" title={r.ccb_error}>
                          {r.ccb_error}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
