'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { supabase } from '../../lib/supabase';
import { formatDateOnlyForDisplay } from '../../lib/dateUtils';

const PREFS_KEY = 'touchpoint-tracker-prefs';
const PREFS_VERSION = 3;

type TypeStat = { count: number; last: string | null };
type LeaderType = 'circle' | 'host_team';

type TrackerLeader = {
  id: number;
  name: string;
  campus: string | null;
  acpd: string | null;
  status: string | null;
  leader_type: LeaderType;
  team_name: string | null;
  director: string | null;
  by_type: Record<string, TypeStat>;
};

type TrackerResponse = {
  config: { target_per_period: number; period_label: string; period_start: string; period_end: string };
  types: string[];
  leaders: TrackerLeader[];
  generated_at: string;
};

type DerivedLeader = {
  id: number;
  name: string;
  campus: string | null;
  acpd: string | null;
  status: string | null;
  leaderType: LeaderType;
  teamName: string | null;
  director: string | null;
  owner: string | null;
  count: number;
  last: string | null;
  met: boolean;
};

type Rollup = { name: string; total: number; met: number; coverage_pct: number };
type SortKey = 'name' | 'leaderType' | 'campus' | 'owner' | 'teamName' | 'status' | 'count' | 'last';
type SortDir = 'asc' | 'desc';

function relativeDate(iso: string | null): string {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return formatDateOnlyForDisplay(iso, { month: 'short', day: 'numeric' });
  }
  return DateTime.fromISO(iso).setZone('America/Chicago').toFormat('LLL d');
}

function titleize(s: string): string {
  return s.replace(/(^|[\s-])\w/g, (m) => m.toUpperCase());
}

function leaderTypeLabel(type: LeaderType): string {
  return type === 'host_team' ? 'Host Team' : 'Circle';
}

function rollupByName(rows: DerivedLeader[], getName: (row: DerivedLeader) => string | null): Rollup[] {
  const groups = new Map<string, { name: string; total: number; met: number }>();
  for (const r of rows) {
    const name = (getName(r) || '').trim() || 'Unassigned';
    const g = groups.get(name) || { name, total: 0, met: 0 };
    g.total += 1;
    if (r.met) g.met += 1;
    groups.set(name, g);
  }
  return Array.from(groups.values())
    .map((g) => ({ ...g, coverage_pct: g.total ? Math.round((g.met / g.total) * 100) : 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-vc-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="h-2 w-full rounded-full bg-zinc-700 overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.max(pct, 2)}%` }} />
    </div>
  );
}

export default function TouchpointTrackerPage() {
  const [data, setData] = useState<TrackerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [campusFilter, setCampusFilter] = useState('');
  const [acpdFilter, setAcpdFilter] = useState('');
  const [directorFilter, setDirectorFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [leaderTypeFilter, setLeaderTypeFilter] = useState<LeaderType | ''>('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const [hydrated, setHydrated] = useState(false);
  const typesInitialized = useRef(false);
  const needsTypeResetRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const storedVersion = Number(p?.version ?? 0);
        if (typeof p.campus === 'string') setCampusFilter(p.campus);
        if (typeof p.acpd === 'string') setAcpdFilter(p.acpd);
        if (typeof p.director === 'string') setDirectorFilter(p.director);
        if (typeof p.team === 'string') setTeamFilter(p.team);
        if (p.leaderType === 'circle' || p.leaderType === 'host_team' || p.leaderType === '') setLeaderTypeFilter(p.leaderType);
        if (typeof p.status === 'string') setStatusFilter(p.status);
        if (['name', 'leaderType', 'campus', 'owner', 'teamName', 'status', 'count', 'last'].includes(p.sortKey)) setSortKey(p.sortKey);
        if (p.sortDir === 'asc' || p.sortDir === 'desc') setSortDir(p.sortDir);
        if (storedVersion === PREFS_VERSION && Array.isArray(p.types)) {
          setSelectedTypes(p.types.filter((t: unknown): t is string => typeof t === 'string'));
          typesInitialized.current = true;
        } else {
          // Legacy saved type filters can hide valid counts; reset types once.
          needsTypeResetRef.current = true;
        }
      }
    } catch {
      /* ignore corrupt prefs */
    }
    setHydrated(true);
  }, []);

  // First load with no saved type selection → default to all available types.
  useEffect(() => {
    if (!data) return;
    if (needsTypeResetRef.current || !typesInitialized.current) {
      setSelectedTypes(data.types);
      typesInitialized.current = true;
      needsTypeResetRef.current = false;
    }
  }, [data]);

  useEffect(() => {
    if (!hydrated || !typesInitialized.current) return;
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          version: PREFS_VERSION,
          campus: campusFilter,
          acpd: acpdFilter,
          director: directorFilter,
          team: teamFilter,
          leaderType: leaderTypeFilter,
          status: statusFilter,
          sortKey,
          sortDir,
          types: selectedTypes,
        }),
      );
    } catch {
      /* ignore quota errors */
    }
  }, [hydrated, campusFilter, acpdFilter, directorFilter, teamFilter, leaderTypeFilter, statusFilter, sortKey, sortDir, selectedTypes]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? null;
      const res = await fetch('/api/touchpoint-tracker', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load the tracker.');
      setData(json as TrackerResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the tracker.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reload immediately when a connection is saved anywhere in the app (FAB,
  // leader profile, etc.) — fired via the radius:connection-saved custom event.
  useEffect(() => {
    const onConnectionSaved = () => load();
    window.addEventListener('radius:connection-saved', onConnectionSaved);
    return () => window.removeEventListener('radius:connection-saved', onConnectionSaved);
  }, [load]);

  // Reload when returning to this page (browser tab refocus or back-navigation),
  // so a connection logged on another page shows up immediately.
  // Guarded to once per 10s to prevent rapid-switch hammering.
  useEffect(() => {
    let lastLoad = Date.now();
    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoad < 10_000) return;
      lastLoad = Date.now();
      load();
    };
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('focus', refreshIfVisible);
    return () => {
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('focus', refreshIfVisible);
    };
  }, [load]);

  const target = data?.config.target_per_period ?? 1;
  const allTypes = data?.types ?? [];

  // Sum the selected types per leader.
  const selectedSet = useMemo(() => new Set(selectedTypes), [selectedTypes]);
  const allDerived = useMemo<DerivedLeader[]>(() => {
    return (data?.leaders ?? []).map((l) => {
      let count = 0;
      let lastMs = 0;
      let last: string | null = null;
      for (const [type, stat] of Object.entries(l.by_type)) {
        if (!selectedSet.has(type)) continue;
        count += stat.count;
        if (stat.last) {
          const ms = new Date(stat.last).getTime();
          if (ms > lastMs) {
            lastMs = ms;
            last = stat.last;
          }
        }
      }
      const leaderType = l.leader_type === 'host_team' ? 'host_team' : 'circle';
      return {
        id: l.id,
        name: l.name,
        campus: l.campus,
        acpd: l.acpd,
        status: l.status,
        leaderType,
        teamName: l.team_name,
        director: l.director,
        owner: leaderType === 'host_team' ? l.director : l.acpd,
        count,
        last,
        met: count >= target,
      };
    });
  }, [data, selectedSet, target]);

  const filtered = useMemo(() => {
    let list = allDerived;
    if (leaderTypeFilter) list = list.filter((l) => l.leaderType === leaderTypeFilter);
    if (acpdFilter) list = list.filter((l) => l.leaderType === 'circle' && (l.acpd || '') === acpdFilter);
    if (directorFilter) list = list.filter((l) => l.leaderType === 'host_team' && (l.director || '') === directorFilter);
    if (teamFilter) list = list.filter((l) => l.leaderType === 'host_team' && (l.teamName || '') === teamFilter);
    if (campusFilter) list = list.filter((l) => (l.campus || '') === campusFilter);
    if (statusFilter) list = list.filter((l) => (l.status || '') === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((l) => (
        l.name.toLowerCase().includes(q) ||
        (l.teamName || '').toLowerCase().includes(q) ||
        (l.owner || '').toLowerCase().includes(q)
      ));
    }
    return list;
  }, [allDerived, leaderTypeFilter, acpdFilter, directorFilter, teamFilter, campusFilter, statusFilter, search]);

  const rows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'count':
          return (a.count - b.count || ms(a.last) - ms(b.last)) * dir;
        case 'last':
          return (ms(a.last) - ms(b.last)) * dir;
        default:
          return String(a[sortKey] || '').localeCompare(String(b[sortKey] || '')) * dir;
      }
    });
  }, [filtered, sortKey, sortDir]);

  const scopedSummary = useMemo(() => {
    const total = filtered.length;
    const met = filtered.filter((r) => r.met).length;
    return { total, met, pct: total ? Math.round((met / total) * 100) : 0 };
  }, [filtered]);

  const byAcpd = useMemo(() => rollupByName(filtered.filter((r) => r.leaderType === 'circle'), (r) => r.acpd), [filtered]);
  const byDirector = useMemo(() => rollupByName(filtered.filter((r) => r.leaderType === 'host_team'), (r) => r.director), [filtered]);
  const byCampus = useMemo(() => rollupByName(filtered, (r) => r.campus), [filtered]);
  const visibleRollups = useMemo(() => {
    const cards: { title: string; rows: Rollup[] }[] = [];
    if (byAcpd.length > 0) cards.push({ title: 'By ACPD', rows: byAcpd });
    if (byDirector.length > 0) cards.push({ title: 'By Team Director', rows: byDirector });
    if (byCampus.length > 0) cards.push({ title: 'By Campus', rows: byCampus });
    return cards;
  }, [byAcpd, byDirector, byCampus]);
  const rollupGridClass =
    visibleRollups.length === 1
      ? 'grid grid-cols-1 gap-4 mb-5'
      : visibleRollups.length === 2
        ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5'
        : 'grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5';

  const campuses = useMemo(
    () => Array.from(new Set((data?.leaders ?? []).map((l) => l.campus).filter(Boolean) as string[])).sort(),
    [data],
  );
  const acpds = useMemo(
    () => Array.from(new Set((data?.leaders ?? []).filter((l) => l.leader_type !== 'host_team').map((l) => l.acpd).filter(Boolean) as string[])).sort(),
    [data],
  );
  const directors = useMemo(
    () => Array.from(new Set((data?.leaders ?? []).filter((l) => l.leader_type === 'host_team').map((l) => l.director).filter(Boolean) as string[])).sort(),
    [data],
  );
  const teams = useMemo(
    () => Array.from(new Set((data?.leaders ?? []).filter((l) => l.leader_type === 'host_team').map((l) => l.team_name).filter(Boolean) as string[])).sort(),
    [data],
  );
  const statuses = useMemo(
    () => Array.from(new Set((data?.leaders ?? []).map((l) => l.status).filter(Boolean) as string[])).sort(),
    [data],
  );

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir('asc');
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Connection Tracker</h1>
          <p className="text-sm text-slate-400 mt-1">
            {data ? (
              <>
                <span className="text-slate-200 font-medium">{data.config.period_label}</span>
                <span className="text-slate-500"> · target {target} touchpoint{target === 1 ? '' : 's'} per leader</span>
              </>
            ) : (
              'Loading…'
            )}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        {/* Summary stat cards (reflect filters + selected types) */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
          <StatCard label="Leaders" value={scopedSummary.total} />
          <StatCard label="Covered" value={scopedSummary.met} accent="text-vc-400" />
          <StatCard
            label="Coverage"
            value={`${scopedSummary.pct}%`}
            accent={scopedSummary.pct >= 80 ? 'text-vc-400' : scopedSummary.pct >= 40 ? 'text-amber-400' : 'text-red-400'}
          />
        </div>

        {/* Rollup charts (reflect filters + selected types) */}
        {data && visibleRollups.length > 0 && (
          <div className={rollupGridClass}>
            {visibleRollups.map((rollup) => (
              <RollupCard key={rollup.title} title={rollup.title} rows={rollup.rows} />
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leaders…"
            className="bg-zinc-700 border border-zinc-600 text-slate-200 placeholder-slate-400 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 w-full sm:w-56"
          />
          <select
            value={leaderTypeFilter}
            onChange={(e) => {
              const next = e.target.value as LeaderType | '';
              setLeaderTypeFilter(next);
              if (next === 'circle') {
                setDirectorFilter('');
                setTeamFilter('');
              } else if (next === 'host_team') {
                setAcpdFilter('');
              }
            }}
            className="bg-zinc-700 border border-zinc-600 text-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
          >
            <option value="">All leaders</option>
            <option value="circle">Circles only</option>
            <option value="host_team">Teams only</option>
          </select>
          <select
            value={campusFilter}
            onChange={(e) => setCampusFilter(e.target.value)}
            className="bg-zinc-700 border border-zinc-600 text-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
          >
            <option value="">All campuses</option>
            {campuses.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={acpdFilter}
            onChange={(e) => setAcpdFilter(e.target.value)}
            className="bg-zinc-700 border border-zinc-600 text-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
          >
            <option value="">All ACPDs</option>
            {acpds.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            value={directorFilter}
            onChange={(e) => setDirectorFilter(e.target.value)}
            className="bg-zinc-700 border border-zinc-600 text-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
          >
            <option value="">All team directors</option>
            {directors.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="bg-zinc-700 border border-zinc-600 text-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-700 border border-zinc-600 text-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{titleize(s)}</option>
            ))}
          </select>
          <TypeMultiSelect options={allTypes} selected={selectedTypes} onChange={setSelectedTypes} />
          {(campusFilter || acpdFilter || directorFilter || teamFilter || leaderTypeFilter || statusFilter || search) && (
            <button
              onClick={() => {
                setCampusFilter('');
                setAcpdFilter('');
                setDirectorFilter('');
                setTeamFilter('');
                setLeaderTypeFilter('');
                setStatusFilter('');
                setSearch('');
              }}
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Leader table */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-lg bg-zinc-800" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-400 text-sm">No leaders match these filters.</p>
              <p className="text-slate-500 text-xs mt-1">Try clearing a filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left">
                    <SortHeader label="Leader" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Type" col="leaderType" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="hidden sm:table-cell" />
                    <SortHeader label="Campus" col="campus" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="hidden md:table-cell" />
                    <SortHeader label="Team" col="teamName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="hidden lg:table-cell" />
                    <SortHeader label="Director / ACPD" col="owner" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="hidden lg:table-cell" />
                    <SortHeader label="Status" col="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="hidden xl:table-cell" />
                    <SortHeader label="This period" col="count" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Last" col="last" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="hidden sm:table-cell" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {rows.map((l) => (
                    <tr key={l.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <a href={`/circle/${l.id}`} className="font-medium text-white hover:text-vc-300 transition-colors">
                          {l.name}
                        </a>
                        <div className="text-xs text-slate-500 sm:hidden">
                          {leaderTypeLabel(l.leaderType)}{l.campus ? ` · ${l.campus}` : ''}
                        </div>
                        {l.leaderType === 'host_team' && (
                          <div className="text-xs text-slate-500 lg:hidden">
                            {l.teamName || 'No team'}{l.director ? ` · ${l.director}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300 hidden sm:table-cell">{leaderTypeLabel(l.leaderType)}</td>
                      <td className="px-4 py-3 text-slate-300 hidden md:table-cell">{l.campus || '—'}</td>
                      <td className="px-4 py-3 text-slate-300 hidden lg:table-cell">{l.leaderType === 'host_team' ? (l.teamName || '—') : '—'}</td>
                      <td className="px-4 py-3 text-slate-300 hidden lg:table-cell">{l.owner || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 hidden xl:table-cell">{l.status ? titleize(l.status) : '—'}</td>
                      <td className="px-4 py-3">
                        {l.met ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-vc-500/15 text-vc-300 text-xs font-medium px-2.5 py-0.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            {l.count}/{target}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-amber-300 text-xs font-medium px-2.5 py-0.5">
                            {l.count}/{target} · overdue
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs hidden sm:table-cell">
                        {l.last ? (
                          <a href={`/circle/${l.id}/notes`} className="text-slate-400 hover:text-vc-300 transition-colors" title="View notes">
                            {relativeDate(l.last)}
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
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
    </div>
  );
}

function TypeMultiSelect({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const allSelected = options.length > 0 && selected.length === options.length;
  const label = selected.length === 0 ? 'No types' : allSelected ? 'All types' : `${selected.length} type${selected.length === 1 ? '' : 's'}`;

  const toggle = (t: string) => {
    if (selected.includes(t)) onChange(selected.filter((x) => x !== t));
    else onChange([...selected, t]);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 bg-zinc-700 border border-zinc-600 text-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
      >
        Types: {label}
        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-64 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl p-2 max-h-80 overflow-auto">
            <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-zinc-700">
              <button onClick={() => onChange(options)} className="text-xs text-vc-300 hover:text-vc-200">Select all</button>
              <button onClick={() => onChange([])} className="text-xs text-slate-400 hover:text-slate-200">Clear</button>
            </div>
            {options.length === 0 ? (
              <p className="text-xs text-slate-500 px-1 py-2">No types yet.</p>
            ) : (
              options.map((t) => (
                <label key={t} className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-zinc-700/50 cursor-pointer text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={selected.includes(t)}
                    onChange={() => toggle(t)}
                    className="w-4 h-4 rounded border-zinc-500 bg-zinc-700 text-vc-600 focus:ring-vc-500"
                  />
                  {t}
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className = '',
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === col;
  return (
    <th className={`px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide ${className}`}>
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-slate-200 ${active ? 'text-slate-200' : ''}`}
      >
        {label}
        <span className={`text-[10px] leading-none ${active ? 'opacity-100' : 'opacity-30'}`}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

function StatCard({ label, value, accent = 'text-white' }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 sm:px-5 sm:py-4">
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl sm:text-3xl font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}

function RollupCard({ title, rows }: { title: string; rows: Rollup[] }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-base font-semibold text-white mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No data yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.name}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-200 truncate pr-2">{r.name}</span>
                <span className="text-slate-400 text-xs flex-shrink-0">
                  {r.met}/{r.total} · {r.coverage_pct}%
                </span>
              </div>
              <CoverageBar pct={r.coverage_pct} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
