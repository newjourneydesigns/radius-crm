'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { useLeadershipSnapshots } from '../../../hooks/useLeadershipSnapshots';
import { STRENGTH_THRESHOLD, CAMPUS_OPTIONS, formatRating } from '../../../lib/leadershipSnapshot';
import type { LeadershipSnapshot } from '../../../lib/supabase';

function snapMax(snap: LeadershipSnapshot): number {
  return (snap.template?.scale?.length) || (snap.template_version === 1 ? 4 : 5);
}

type LeaderLite = { id: number; name: string; campus: string | null; email: string | null };

function scoreColor(score: number): string {
  if (score >= STRENGTH_THRESHOLD) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminLeadershipSnapshotsPage() {
  const { isAdmin } = useAuth();
  const { snapshots, isLoading, loadAll, confirmLink } = useLeadershipSnapshots();

  const [tab, setTab] = useState<'all' | 'needs'>('all');
  const [search, setSearch] = useState('');
  const [campus, setCampus] = useState('');
  const [leaders, setLeaders] = useState<LeaderLite[]>([]);
  const [linkChoice, setLinkChoice] = useState<Record<string, number | ''>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
    supabase
      .from('circle_leaders')
      .select('id, name, campus, email')
      .order('name')
      .then(({ data }) => setLeaders((data as LeaderLite[]) || []));
  }, [loadAll]);

  const leaderById = useMemo(() => {
    const m = new Map<number, LeaderLite>();
    leaders.forEach((l) => m.set(l.id, l));
    return m;
  }, [leaders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshots.filter((s) => {
      if (tab === 'needs' && s.leader_link_confirmed) return false;
      if (campus && s.campus !== campus) return false;
      if (q) {
        const hay = `${s.respondent_name || ''} ${s.respondent_email || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [snapshots, tab, campus, search]);

  const needsCount = useMemo(() => snapshots.filter((s) => !s.leader_link_confirmed).length, [snapshots]);

  async function handleConfirm(snapshotId: string, leaderId: number | null) {
    if (!leaderId) return;
    setBusyId(snapshotId);
    await confirmLink(snapshotId, leaderId);
    await loadAll();
    setBusyId(null);
  }

  if (!isAdmin()) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] flex items-center justify-center px-4">
          <p className="text-slate-400 text-sm">This page is available to ACPD admins only.</p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 lg:pb-10">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-white tracking-tight">Leadership Snapshots</h1>
              <p className="text-sm text-slate-400 mt-1">Review every self-assessment and confirm which Circle Leader each belongs to.</p>
            </div>
            <Link
              href="/admin/leadership-snapshots/questions"
              className="shrink-0 bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Edit questions
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setTab('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'all' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              All ({snapshots.length})
            </button>
            <button
              onClick={() => setTab('needs')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'needs' ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              Needs confirmation ({needsCount})
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 mb-5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email…"
              className="flex-1 bg-slate-800 border border-slate-700 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={campus}
              onChange={(e) => setCampus(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All campuses</option>
              {CAMPUS_OPTIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          {isLoading && snapshots.length === 0 ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400 text-sm">No snapshots match your filters.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((snap) => {
                const linkedLeader = snap.circle_leader_id ? leaderById.get(snap.circle_leader_id) : null;
                const choice = linkChoice[snap.id] ?? (snap.circle_leader_id || '');
                return (
                  <div key={snap.id} className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shadow-card-glass">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white truncate">{snap.respondent_name || '—'}</span>
                          {!snap.leader_link_confirmed && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">Needs confirm</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {fmtDate(snap.created_at)} · {snap.campus || '—'} · {snap.role || '—'}
                          {snap.respondent_email ? ` · ${snap.respondent_email}` : ''}
                        </div>
                      </div>
                      <span className="flex items-baseline gap-0.5 shrink-0">
                        <span className={`text-xl font-bold ${scoreColor(snap.overall_score)}`}>{formatRating(snap.overall_score, snapMax(snap))}</span>
                        <span className="text-xs font-medium text-slate-500">/ {snapMax(snap)}</span>
                      </span>
                    </div>

                    {/* Link controls */}
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 pt-3 border-t border-slate-700/60">
                      {snap.leader_link_confirmed && linkedLeader ? (
                        <div className="flex-1 text-xs text-slate-400">
                          Linked to{' '}
                          <Link href={`/circle/${linkedLeader.id}/leadership-snapshot`} className="text-indigo-400 hover:text-indigo-300 font-medium">
                            {linkedLeader.name}
                          </Link>
                        </div>
                      ) : (
                        <>
                          <select
                            value={choice}
                            onChange={(e) => setLinkChoice({ ...linkChoice, [snap.id]: e.target.value ? Number(e.target.value) : '' })}
                            className="flex-1 bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select a Circle Leader…</option>
                            {leaders.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}{l.campus ? ` · ${l.campus}` : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleConfirm(snap.id, choice ? Number(choice) : null)}
                            disabled={!choice || busyId === snap.id}
                            className="bg-btn-success text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                          >
                            {busyId === snap.id ? 'Saving…' : 'Confirm link'}
                          </button>
                        </>
                      )}
                      {linkedLeader && (
                        <Link
                          href={`/circle/${linkedLeader.id}/leadership-snapshot`}
                          className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 transition-colors text-center"
                        >
                          Open history →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
