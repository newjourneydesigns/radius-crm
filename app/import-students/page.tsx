'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { currentTerm, formatTerm, isValidTerm, termSortKey } from '../../lib/student-toolkit/terms';
import { ageFromBirthdate, isMinor } from '../../lib/messaging/minorGuard';

type MinistryGroup = {
  id: number;
  campus: string;
  term: string;
  kind: 'circle' | 'movement' | 'leaders';
  ccb_group_id: string;
  label: string | null;
};

type CCBMember = {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  birthday?: string;
};

type ExistingLeader = {
  id: number;
  name: string;
  ccb_individual_id: string | null;
};

const inputClass =
  'mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-vc-500';
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300';

function termOptions(): string[] {
  const year = new Date().getFullYear();
  return Array.from(
    new Set([
      currentTerm(),
      `${year - 1}-fall`,
      `${year}-spring`,
      `${year}-fall`,
      `${year + 1}-spring`,
      `${year + 1}-fall`,
    ])
  )
    .filter(isValidTerm)
    .sort((a, b) => termSortKey(b) - termSortKey(a));
}

function memberName(member: CCBMember): string {
  return (
    member.fullName?.trim() ||
    `${member.firstName || ''} ${member.lastName || ''}`.trim() ||
    `CCB #${member.id}`
  );
}

function memberPhone(member: CCBMember): string {
  return (member.mobilePhone || member.phone || '').trim();
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function ImportStudentsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-[#0f1117]" />}>
      <ImportStudents />
    </Suspense>
  );
}

function ImportStudents() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();

  const [token, setToken] = useState<string | null>(null);
  const [campuses, setCampuses] = useState<string[]>([]);
  const [groups, setGroups] = useState<MinistryGroup[]>([]);
  const [existing, setExisting] = useState<ExistingLeader[]>([]);
  const [members, setMembers] = useState<CCBMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiFallback, setApiFallback] = useState(false);

  const term = useMemo(() => {
    const requested = searchParams?.get('term');
    return isValidTerm(requested) ? requested : currentTerm();
  }, [searchParams]);
  const campus = searchParams?.get('campus') || '';

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
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token || null));
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

  // The configured group map for the term, so we know where to read leaders from.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoadingGroups(true);
    fetch(`/api/admin/student-ministry-groups/?term=${encodeURIComponent(term)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) throw new Error(data.error || 'Could not load the group map.');
        setGroups(data.groups || []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load the group map.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingGroups(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, term]);

  const loadExisting = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/student-leaders/', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok) setExisting(data.leaders || []);
    } catch {
      // Only powers the "already imported" badge — not worth blocking on.
    }
  }, [token]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  const leadersGroup = useMemo(
    () => groups.find((group) => group.kind === 'leaders' && group.campus === campus) || null,
    [groups, campus]
  );

  const existingByCcbId = useMemo(() => {
    const map = new Map<string, ExistingLeader>();
    for (const leader of existing) {
      if (leader.ccb_individual_id) map.set(leader.ccb_individual_id, leader);
    }
    return map;
  }, [existing]);

  // Changing campus or term invalidates the people on screen.
  useEffect(() => {
    setMembers([]);
    setSelected(new Set());
    setApiFallback(false);
  }, [campus, term]);

  async function loadMembers() {
    if (!token || !leadersGroup) return;
    setLoadingMembers(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/ccb/group-roster/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        // enrichPhones: false skips CCB v1's per-person profile call. That N+1
        // times out past roughly eighteen people, which a campus's leaders
        // group will exceed — and on v2 phone and birthday already come back
        // inline, so the flag costs nothing there.
        body: JSON.stringify({ groupId: leadersGroup.ccb_group_id, enrichPhones: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details || 'Could not read the group from CCB.');
      const people = (data.data || []) as CCBMember[];
      setMembers(people);
      setApiFallback(data.apiFallback === 'v1');
      // Pre-check the people who are not in RADIUS yet — the common case is
      // "add this term's new leaders". Existing people stay unchecked so a
      // re-import is a deliberate choice.
      setSelected(new Set(people.filter((p) => !existingByCcbId.has(String(p.id))).map((p) => String(p.id))));
      if (people.length === 0) {
        setError('CCB returned nobody in that group. Check the group ID on Student Groups.');
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not read the group from CCB.'));
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function importSelected() {
    if (!token || !leadersGroup) return;
    const people = members
      .filter((member) => selected.has(String(member.id)))
      .map((member) => ({
        ccb_individual_id: String(member.id),
        name: memberName(member),
        email: member.email || null,
        phone: memberPhone(member) || null,
        birthday: member.birthday || null,
      }));

    if (people.length === 0) {
      setError('Select at least one person to import.');
      return;
    }

    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/student-leaders/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'import',
          campus,
          term,
          source_ccb_group_id: leadersGroup.ccb_group_id,
          people,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed.');
      setSuccess(data.message || 'Import finished.');
      await loadExisting();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Import failed.'));
    } finally {
      setImporting(false);
    }
  }

  const missingBirthdays = useMemo(
    () => members.filter((member) => !ageFromBirthdate(member.birthday || null)).length,
    [members]
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117]">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Import Students</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Pull student leaders from the CCB group you mapped for a campus, and pick who gets a
            Student Toolkit profile. Running it again updates the people already imported instead of
            duplicating them.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 p-3 mb-4">
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </div>
        )}
        {success && (
          <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500/30 p-3 mb-4">
            <p className="text-sm text-green-800 dark:text-green-300">
              {success}{' '}
              <Link href="/admin/student-leaders/" className="underline hover:no-underline">
                Manage student leaders
              </Link>
            </p>
          </div>
        )}

        <div className="space-y-4 sm:space-y-6">
          {/* Card 1: campus + term */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Campus and term</h2>
            </div>
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="campus" className={labelClass}>
                    Campus
                  </label>
                  <select
                    id="campus"
                    className={inputClass}
                    value={campus}
                    onChange={(e) => setParam('campus', e.target.value)}
                  >
                    <option value="">Select a campus</option>
                    {campuses.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="term" className={labelClass}>
                    Term
                  </label>
                  <select
                    id="term"
                    className={inputClass}
                    value={term}
                    onChange={(e) => setParam('term', e.target.value)}
                  >
                    {termOptions().map((option) => (
                      <option key={option} value={option}>
                        {formatTerm(option)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                {!campus ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Choose a campus to see the CCB group its student leaders come from.
                  </p>
                ) : loadingGroups ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading the group map…</p>
                ) : leadersGroup ? (
                  <div className="rounded-md bg-gray-50 dark:bg-gray-700/40 p-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {leadersGroup.label || 'Student leaders group'}{' '}
                        <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                          #{leadersGroup.ccb_group_id}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Mapped for {campus} · {formatTerm(term)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={loadMembers}
                      disabled={loadingMembers}
                      className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                    >
                      {loadingMembers ? 'Loading from CCB…' : 'Load people from CCB'}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 p-3">
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      {campus} has no student leaders group mapped for {formatTerm(term)}.
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400/80 mt-1">
                      Add it on{' '}
                      <Link href={`/admin/student-groups/?term=${term}&campus=${encodeURIComponent(campus)}`} className="underline hover:no-underline">
                        Student Groups
                      </Link>{' '}
                      under &quot;Student leaders group&quot;, then come back here.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: people */}
          {members.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                    Who to import
                  </h2>
                  <span className="text-xs font-medium bg-vc-500/20 text-vc-500 dark:text-vc-400 px-2 py-0.5 rounded-full">
                    {selected.size} of {members.length} selected
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  People already in RADIUS start unchecked. Check them to refresh their name, contact
                  info, and birthday from CCB.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(new Set(members.map((m) => String(m.id))))}
                    className="text-sm text-vc-500 dark:text-vc-400 hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="text-sm text-vc-500 dark:text-vc-400 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {(apiFallback || missingBirthdays > 0) && (
                <div className="px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20">
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    {apiFallback
                      ? 'CCB API v2 was unavailable, so this list came from v1 — which returns no birthdays.'
                      : `${missingBirthdays} of these people have no usable birthday in CCB.`}{' '}
                    Student leaders are often minors themselves, and the age gate that keeps anyone
                    under 18 out of a bulk text has nothing to check without one. Import them, then
                    add the birthday in CCB and re-run.
                  </p>
                </div>
              )}

              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {members.map((member) => {
                  const id = String(member.id);
                  const checked = selected.has(id);
                  const alreadyImported = existingByCcbId.has(id);
                  const age = ageFromBirthdate(member.birthday || null);
                  const phone = memberPhone(member);
                  return (
                    <li key={id}>
                      <label className="flex items-start gap-3 px-4 sm:px-6 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(id)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-vc-500 focus:ring-vc-500"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {memberName(member)}
                            </span>
                            {alreadyImported && (
                              <span className="text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                                Already imported
                              </span>
                            )}
                            {isMinor(age) && (
                              <span className="text-xs font-medium bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full">
                                Under 18
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {[
                              member.email,
                              phone,
                              age != null ? `age ${age}` : 'no birthday on file',
                              `CCB #${id}`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMembers([]);
                    setSelected(new Set());
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={importSelected}
                  disabled={importing || selected.size === 0}
                  className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  {importing
                    ? 'Importing…'
                    : `Import ${selected.size} student leader${selected.size === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
