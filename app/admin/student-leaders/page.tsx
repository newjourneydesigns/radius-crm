'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { formatTerm, isValidTerm } from '../../../lib/student-toolkit/terms';
import { isStudentToolkitEnabled } from '../../../lib/student-toolkit/feature-flag';

type StudentLeaderRow = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  campus: string | null;
  status: string;
  toolkit_access_enabled: boolean;
  ccb_individual_id: string | null;
  term: string | null;
  birthday: string | null;
  last_seen_at: string | null;
};

const inputClass =
  'w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function StudentLeadersAdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f1117]" />}>
      <StudentLeadersAdmin />
    </Suspense>
  );
}

function StudentLeadersAdmin() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();

  const [token, setToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [leaders, setLeaders] = useState<StudentLeaderRow[]>([]);
  const [campuses, setCampuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams?.get('q') || '');

  const campusFilter = searchParams?.get('campus') || '';
  const statusFilter = searchParams?.get('status') || 'active';
  const termFilter = searchParams?.get('term') || '';

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '');
      if (value) next.set(key, value);
      else next.delete(key);
      const query = next.toString();
      // next.config.js sets trailingSlash: true, so keep the slash before the
      // query string — and don't double it if usePathname already has one.
      const base = pathname.endsWith('/') ? pathname : `${pathname}/`;
      router.replace(query ? `${base}?${query}` : base, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token || null);
      setAuthChecked(true);
      if (!data.session?.access_token) setLoading(false);
    });
  }, []);

  useEffect(() => {
    supabase
      .from('campuses')
      .select('value')
      .order('value')
      .then(({ data }) => {
        setCampuses(
          ((data || []) as { value: string | null }[])
            .map((row) => row.value)
            .filter((value): value is string => Boolean(value))
        );
      });
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (campusFilter) params.set('campus', campusFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (isValidTerm(termFilter)) params.set('term', termFilter);
      const query = params.toString();
      const res = await fetch(`/api/student-leaders/${query ? `?${query}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load student leaders.');
      setLeaders(data.leaders || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not load student leaders.'));
    } finally {
      setLoading(false);
    }
  }, [token, campusFilter, statusFilter, termFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Search is client-side: the whole list is already here, and a round-trip per
  // keystroke would be slower than filtering in place.
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return leaders;
    return leaders.filter((leader) =>
      [leader.name, leader.email, leader.campus]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
    );
  }, [leaders, search]);

  const terms = useMemo(
    () => Array.from(new Set(leaders.map((l) => l.term).filter((t): t is string => isValidTerm(t)))),
    [leaders]
  );

  async function patchLeader(leader: StudentLeaderRow, body: Record<string, unknown>, message: string) {
    if (!token) return;
    setActingId(leader.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/student-leaders/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: leader.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed.');
      setSuccess(message);
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Update failed.'));
    } finally {
      setActingId(null);
    }
  }

  /** Shared with both buttons — the route signs a link and tells us how to send it. */
  async function requestMagicLink(leader: StudentLeaderRow, selfHosted: boolean) {
    if (!token) throw new Error('Please sign in again.');
    const res = await fetch('/api/student-toolkit/admin-magic-link/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      // Both keys on purpose: the route reads `leader_id` today, and the rest of
      // the student surface calls this id `student_leader_id`. Sending both means
      // a rename on either side can't silently break the sign-in links.
      body: JSON.stringify({ leader_id: leader.id, student_leader_id: leader.id, selfHosted }),
    });
    const raw = await res.text();
    let data: {
      error?: string;
      url?: string;
      email?: string | null;
      phone?: string | null;
      smsBody?: string;
      isMinor?: boolean;
    } = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      // Non-JSON (a Netlify 404/502 mid-deploy) — fall through to the status check.
    }
    if (!res.ok) {
      throw new Error(
        data.error ||
          (res.status === 404
            ? 'Sign-in links are not available yet — the latest version may still be deploying.'
            : `Request failed (${res.status}). Try again.`)
      );
    }
    if (!data.url) throw new Error('Could not generate a sign-in link.');
    return data;
  }

  async function openToolkit(leader: StudentLeaderRow) {
    const pending = window.open('about:blank', '_blank');
    setActingId(leader.id);
    setError(null);
    setSuccess(null);
    try {
      const data = await requestMagicLink(leader, true);
      if (pending) pending.location.href = data.url!;
      else window.location.href = data.url!;
    } catch (err: unknown) {
      if (pending) pending.close();
      setError(getErrorMessage(err, 'Could not open the toolkit.'));
    } finally {
      setActingId(null);
    }
  }

  async function textLink(leader: StudentLeaderRow) {
    setActingId(leader.id);
    setError(null);
    setSuccess(null);
    try {
      const data = await requestMagicLink(leader, false);
      // Student leaders are frequently minors themselves. Texting is age-gated
      // everywhere else in RADIUS, so make sending here a deliberate choice
      // rather than opening the composer straight away.
      if (
        data.isMinor &&
        !confirm(
          `${leader.name} is under 18. Texting minors is age-gated elsewhere in RADIUS. Send this sign-in link anyway?`
        )
      ) {
        return;
      }
      const message = data.smsBody || data.url!;
      const phone = (data.phone || leader.phone || '').replace(/\D/g, '');
      if (phone) {
        window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
        return;
      }
      await navigator.clipboard.writeText(message);
      setSuccess(
        `No phone on file for ${leader.name}, so the sign-in message is on your clipboard. Paste it into a text or email.`
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not create the sign-in link.'));
    } finally {
      setActingId(null);
    }
  }

  // Middleware hides the other student routes while the flag is off, but this
  // page is not on that list — say so plainly rather than showing a live roster.
  if (!isStudentToolkitEnabled()) {
    return (
      <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8">
        <div className="max-w-xl mx-auto bg-zinc-800 border border-zinc-700 rounded-xl p-6 shadow-card-glass">
          <h1 className="text-xl font-semibold text-white tracking-tight">Student Leaders</h1>
          <p className="text-sm text-slate-400 mt-2">
            The Student Toolkit is turned off. Set NEXT_PUBLIC_STUDENT_TOOLKIT_ENABLED to true in
            Netlify to manage student leaders.
          </p>
        </div>
      </div>
    );
  }

  if (authChecked && !token) {
    return (
      <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8">
        <div className="max-w-xl mx-auto bg-zinc-800 border border-zinc-700 rounded-xl p-6 shadow-card-glass">
          <h1 className="text-xl font-semibold text-white tracking-tight">Student Leaders</h1>
          <p className="text-sm text-slate-400 mt-2">Sign in to Radius to manage student leaders.</p>
          <a
            href="/login/"
            className="inline-flex mt-5 bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white tracking-tight">Student Leaders</h1>
          <p className="text-sm text-slate-400 mt-1">
            Everyone imported into the Student Toolkit. Turn access off to lock a leader out on their
            next request, or send them a sign-in link.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-lg p-3 mb-4">
            {success}
          </div>
        )}

        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 sm:p-5 shadow-card-glass mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Search
              </label>
              <input
                className={inputClass}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setParam('q', e.target.value);
                }}
                placeholder="Name or email"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Campus
              </label>
              <select
                className={inputClass}
                value={campusFilter}
                onChange={(e) => setParam('campus', e.target.value)}
              >
                <option value="">All campuses</option>
                {campuses.map((campus) => (
                  <option key={campus} value={campus}>
                    {campus}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Status
              </label>
              <select
                className={inputClass}
                value={statusFilter}
                onChange={(e) => setParam('status', e.target.value)}
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="">All</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Term
              </label>
              <select
                className={inputClass}
                value={termFilter}
                onChange={(e) => setParam('term', e.target.value)}
              >
                <option value="">All terms</option>
                {terms.map((term) => (
                  <option key={term} value={term}>
                    {formatTerm(term)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="animate-pulse bg-zinc-800 rounded-xl h-20" />
            <div className="animate-pulse bg-zinc-800 rounded-xl h-20" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-12 bg-zinc-800 border border-zinc-700 rounded-xl">
            <p className="text-slate-400 text-sm">
              {leaders.length === 0 ? 'No student leaders yet.' : 'Nobody matches those filters.'}
            </p>
            <p className="text-slate-500 text-xs mt-1">
              {leaders.length === 0 ? (
                <>
                  Map a campus&apos;s leaders group on{' '}
                  <Link href="/admin/student-groups/" className="text-vc-300 hover:text-vc-200">
                    Student Groups
                  </Link>
                  , then bring people in from{' '}
                  <Link href="/import-students/" className="text-vc-300 hover:text-vc-200">
                    Import Students
                  </Link>
                  .
                </>
              ) : (
                'Clear a filter to see more.'
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((leader) => {
              const busy = actingId === leader.id;
              // The magic-link route refuses an archived leader or one whose kill
              // switch is off, so don't offer a button that can only 403.
              const canSignIn = leader.toolkit_access_enabled && leader.status !== 'archived';
              return (
                <article
                  key={leader.id}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-semibold text-white">{leader.name}</h2>
                      {leader.status === 'archived' && (
                        <span className="bg-zinc-600/50 text-slate-300 text-xs font-medium px-2 py-0.5 rounded-full">
                          Archived
                        </span>
                      )}
                      {!leader.toolkit_access_enabled && (
                        <span className="bg-red-500/20 text-red-300 text-xs font-medium px-2 py-0.5 rounded-full">
                          Access off
                        </span>
                      )}
                      {leader.term && (
                        <span className="bg-vc-500/20 text-vc-300 text-xs font-medium px-2 py-0.5 rounded-full">
                          {formatTerm(leader.term)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 break-words">
                      {[leader.campus, leader.email, leader.phone].filter(Boolean).join(' · ') ||
                        'No campus or contact info on file'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {leader.last_seen_at
                        ? `Last opened the toolkit ${new Date(leader.last_seen_at).toLocaleDateString()}`
                        : 'Has not opened the toolkit yet'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => openToolkit(leader)}
                      disabled={busy || !canSignIn}
                      title={
                        canSignIn
                          ? 'Open the toolkit signed in as this leader'
                          : 'Turn access on and restore this leader first'
                      }
                      className="text-slate-300 hover:text-white hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-40"
                    >
                      Open Toolkit
                    </button>
                    <button
                      onClick={() => textLink(leader)}
                      disabled={busy || !canSignIn}
                      className="text-slate-300 hover:text-white hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-40"
                    >
                      Text link
                    </button>
                    <button
                      onClick={() =>
                        patchLeader(
                          leader,
                          { toolkit_access_enabled: !leader.toolkit_access_enabled },
                          leader.toolkit_access_enabled
                            ? `${leader.name} is locked out of the toolkit.`
                            : `${leader.name} can use the toolkit again.`
                        )
                      }
                      disabled={busy}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50 ${
                        leader.toolkit_access_enabled
                          ? 'text-amber-300 hover:text-amber-200 hover:bg-amber-500/10'
                          : 'text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/10'
                      }`}
                    >
                      {leader.toolkit_access_enabled ? 'Turn access off' : 'Turn access on'}
                    </button>
                    <button
                      onClick={() =>
                        patchLeader(
                          leader,
                          { status: leader.status === 'archived' ? 'active' : 'archived' },
                          leader.status === 'archived'
                            ? `${leader.name} restored.`
                            : `${leader.name} archived.`
                        )
                      }
                      disabled={busy}
                      className="text-slate-400 hover:text-white hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {leader.status === 'archived' ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
