'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { useLeadershipSnapshots } from '../../../hooks/useLeadershipSnapshots';
import { STRENGTH_THRESHOLD, CAMPUS_OPTIONS, DEFAULT_TEMPLATE, formatRating } from '../../../lib/leadershipSnapshot';
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

function csvValue(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function dateInputToRange(date: string, boundary: 'start' | 'end'): Date | null {
  if (!date) return null;
  return new Date(`${date}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}`);
}

function filenameDate(date: string): string {
  return date || 'all';
}

export default function AdminLeadershipSnapshotsPage() {
  const { isAdmin } = useAuth();
  const { snapshots, isLoading, loadAll, confirmLink } = useLeadershipSnapshots();

  const [tab, setTab] = useState<'all' | 'needs'>('all');
  const [search, setSearch] = useState('');
  const [campus, setCampus] = useState('');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportError, setExportError] = useState('');
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

  function exportCsv() {
    setExportError('');
    const start = dateInputToRange(exportStartDate, 'start');
    const end = dateInputToRange(exportEndDate, 'end');

    if (start && end && start.getTime() > end.getTime()) {
      setExportError('Start date must be before end date.');
      return;
    }

    const exportRows = snapshots.filter((snap) => {
      const created = new Date(snap.created_at);
      if (start && created < start) return false;
      if (end && created > end) return false;
      return true;
    });

    if (exportRows.length === 0) {
      setExportError('No submissions found in that date range.');
      return;
    }

    const templates = exportRows.map((snap) => snap.template || DEFAULT_TEMPLATE);
    const questionMap = new Map<string, string>();
    const reflectionMap = new Map<string, string>();
    const categoryMap = new Map<string, string>();

    for (const template of templates) {
      for (const category of template.categories || []) {
        categoryMap.set(category.id, category.label);
        reflectionMap.set(category.reflectionId, `${category.label} Reflection`);
        for (const question of category.questions || []) {
          questionMap.set(question.id, `${category.label} - ${question.stem}`);
        }
      }
    }

    const questionIds = Array.from(questionMap.keys()).sort();
    const reflectionIds = Array.from(reflectionMap.keys()).sort();
    const categoryIds = Array.from(categoryMap.keys()).sort();

    const headers = [
      'Submission ID',
      'Submitted At',
      'Respondent Name',
      'Respondent Email',
      'Respondent Phone',
      'Role',
      'Campus',
      'Circle Type',
      'Group Size',
      'Linked Circle Leader ID',
      'Linked Circle Leader',
      'Leader Link Confirmed',
      'Overall Rating',
      'Overall Score %',
      ...categoryIds.map((id) => `${categoryMap.get(id) || id} Score %`),
      ...questionIds.map((id) => questionMap.get(id) || id),
      ...reflectionIds.map((id) => reflectionMap.get(id) || id),
      'AI Summary',
    ];

    const rows = exportRows.map((snap) => {
      const linkedLeader = snap.circle_leader_id ? leaderById.get(snap.circle_leader_id) : null;
      const categoryScores = new Map((snap.category_scores || []).map((score) => [score.id, score.score]));
      return [
        snap.id,
        new Date(snap.created_at).toLocaleString('en-US'),
        snap.respondent_name || '',
        snap.respondent_email || '',
        snap.respondent_phone || '',
        snap.role || '',
        snap.campus || '',
        snap.circle_type || '',
        snap.group_size || '',
        snap.circle_leader_id || '',
        linkedLeader?.name || '',
        snap.leader_link_confirmed ? 'Yes' : 'No',
        formatRating(snap.overall_score, snapMax(snap)),
        snap.overall_score,
        ...categoryIds.map((id) => categoryScores.get(id) ?? ''),
        ...questionIds.map((id) => snap.answers?.[id] ?? ''),
        ...reflectionIds.map((id) => snap.reflections?.[id] || ''),
        snap.ai_summary || '',
      ];
    });

    const csv = [headers, ...rows].map((row) => row.map(csvValue).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leadership-snapshots-${filenameDate(exportStartDate)}-to-${filenameDate(exportEndDate)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

          {/* Export */}
          <div className="mb-4 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex-1 min-w-0">
                <span className="mb-1 block text-xs font-medium text-slate-400">From</span>
                <input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="flex-1 min-w-0">
                <span className="mb-1 block text-xs font-medium text-slate-400">To</span>
                <input
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <button
                onClick={exportCsv}
                disabled={isLoading || snapshots.length === 0}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-4 w-4" strokeWidth={1.8} />
                Export CSV
              </button>
            </div>
            {exportError && <p className="mt-2 text-xs text-amber-300">{exportError}</p>}
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
