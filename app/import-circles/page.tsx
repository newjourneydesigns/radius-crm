'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Link from 'next/link';

interface CCBGroup {
  id: string;
  name: string;
  description?: string;
  campus?: string;
  groupType?: string;
  mainLeader?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    email?: string;
    phone?: string;
  };
  meetingDay?: string;
  meetingTime?: string;
  alreadyImported?: boolean;
  possibleMatch?: { id: number; name: string } | null;
  ccbLink?: string | null;
}

interface ImportResult {
  imported: number;
  skipped: number;
  skippedDetails: Array<{ id: string; name: string; reason: string }>;
}

interface MassUpdateLeader {
  id: number;
  name: string;
  campus: string | null;
  acpd: string | null;
  status: string | null;
}

interface ReferenceData {
  directors: { id: number; name: string }[];
  campuses: { id: number; value: string }[];
}

export default function ImportCirclesPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<'ccb' | 'mass-update'>('ccb');

  // CCB Import state
  const [searchTerm, setSearchTerm] = useState('');
  const [groups, setGroups] = useState<CCBGroup[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const router = useRouter();

  // Mass Update state
  const [massUpdateField, setMassUpdateField] = useState<'campus' | 'acpd'>('campus');
  const [massUpdateValue, setMassUpdateValue] = useState('');
  const [massUpdateFilterField, setMassUpdateFilterField] = useState<'all' | 'campus' | 'acpd'>('all');
  const [massUpdateFilterValue, setMassUpdateFilterValue] = useState('');
  const [massUpdateLeaders, setMassUpdateLeaders] = useState<MassUpdateLeader[]>([]);
  const [massUpdateSelected, setMassUpdateSelected] = useState<Set<number>>(new Set());
  const [massUpdateLoading, setMassUpdateLoading] = useState(false);
  const [massUpdateSearching, setMassUpdateSearching] = useState(false);
  const [massUpdateResult, setMassUpdateResult] = useState<{ updated: number; error?: string } | null>(null);
  const [referenceData, setReferenceData] = useState<ReferenceData>({ directors: [], campuses: [] });

  // Sort state for mass update table
  type SortField = 'name' | 'campus' | 'acpd' | 'status';
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedMassUpdateLeaders = useMemo(() => {
    return [...massUpdateLeaders].sort((a, b) => {
      const aVal = (a[sortField] || '').toLowerCase();
      const bVal = (b[sortField] || '').toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [massUpdateLeaders, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg className="w-3 h-3 ml-1 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortDirection === 'asc' ? (
      <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Load reference data for dropdowns
  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const res = await fetch('/api/reference-data');
        if (res.ok) {
          const data = await res.json();
          setReferenceData({
            directors: data.directors || [],
            campuses: data.campuses || [],
          });
        }
      } catch (err) {
        console.error('Failed to load reference data:', err);
      }
    };
    loadReferenceData();
  }, []);

  // Search/filter leaders for mass update
  const searchLeadersForMassUpdate = useCallback(async () => {
    setMassUpdateSearching(true);
    setMassUpdateResult(null);
    setMassUpdateSelected(new Set());
    try {
      const res = await fetch('/api/circle-leaders');
      if (!res.ok) throw new Error('Failed to fetch circle leaders');
      const data = await res.json();
      let leaders: MassUpdateLeader[] = (data.circleLeaders || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        campus: l.campus || null,
        acpd: l.acpd || null,
        status: l.status || null,
      }));

      if (massUpdateFilterField === 'campus' && massUpdateFilterValue) {
        leaders = leaders.filter(l => l.campus === massUpdateFilterValue);
      } else if (massUpdateFilterField === 'acpd' && massUpdateFilterValue) {
        leaders = leaders.filter(l => l.acpd === massUpdateFilterValue);
      }

      leaders.sort((a, b) => a.name.localeCompare(b.name));
      setMassUpdateLeaders(leaders);
    } catch (err: any) {
      console.error('Error searching leaders:', err);
    } finally {
      setMassUpdateSearching(false);
    }
  }, [massUpdateFilterField, massUpdateFilterValue]);

  // Track last clicked index for shift-click range selection
  const lastClickedIndexRef = useRef<number | null>(null);

  const toggleMassUpdateSelect = (id: number, event?: React.MouseEvent) => {
    const currentIndex = sortedMassUpdateLeaders.findIndex(l => l.id === id);

    if (event?.shiftKey && lastClickedIndexRef.current !== null && lastClickedIndexRef.current !== currentIndex) {
      // Shift-click: select range between last click and current click
      const start = Math.min(lastClickedIndexRef.current, currentIndex);
      const end = Math.max(lastClickedIndexRef.current, currentIndex);
      const rangeIds = sortedMassUpdateLeaders.slice(start, end + 1).map(l => l.id);

      setMassUpdateSelected(prev => {
        const next = new Set(prev);
        rangeIds.forEach(rid => next.add(rid));
        return next;
      });
    } else {
      // Normal click: toggle single item
      setMassUpdateSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }

    lastClickedIndexRef.current = currentIndex;
  };

  const massUpdateSelectAll = () => {
    setMassUpdateSelected(new Set(massUpdateLeaders.map(l => l.id)));
  };

  const massUpdateDeselectAll = () => {
    setMassUpdateSelected(new Set());
  };

  const handleMassUpdate = async () => {
    if (massUpdateSelected.size === 0 || !massUpdateValue) return;

    setMassUpdateLoading(true);
    setMassUpdateResult(null);
    try {
      const res = await fetch('/api/circle-leaders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaderIds: Array.from(massUpdateSelected),
          field: massUpdateField,
          value: massUpdateValue,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');

      setMassUpdateResult({ updated: data.updated });
      await searchLeadersForMassUpdate();
    } catch (err: any) {
      setMassUpdateResult({ updated: 0, error: err.message });
    } finally {
      setMassUpdateLoading(false);
    }
  };

  // ---- Search ----
  const handleSearch = useCallback(async () => {
    const q = searchTerm.trim();
    if (q.length > 0 && q.length < 2) {
      setSearchError('Enter at least 2 characters to search.');
      return;
    }

    setIsSearching(true);
    setSearchError('');
    setImportResult(null);
    setSelected(new Set());

    try {
      const res = await fetch(`/api/ccb/import-circles?q=${encodeURIComponent(q)}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setGroups(json.groups || []);
      setHasSearched(true);
    } catch (err: any) {
      setSearchError(err.message || 'Search failed.');
      setGroups([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchTerm]);

  // ---- Selection helpers ----
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableGroups = groups.filter((g) => !g.alreadyImported);
  const selectAll = () => {
    setSelected(new Set(selectableGroups.map((g) => g.id)));
  };
  const deselectAll = () => setSelected(new Set());

  // ---- Import ----
  const handleImport = useCallback(async () => {
    if (selected.size === 0) return;

    setIsImporting(true);
    setSearchError('');
    setImportResult(null);

    const toImport = groups.filter((g) => selected.has(g.id));

    try {
      const res = await fetch('/api/ccb/import-circles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: toImport }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setImportResult(json);

      // Re-run search to update statuses
      if (json.imported > 0) {
        setSelected(new Set());
        // Small delay so the user sees the result before the list refreshes
        setTimeout(() => handleSearch(), 800);
      }
    } catch (err: any) {
      setSearchError(err.message || 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  }, [selected, groups, handleSearch]);

  // ---- Key handler for search box ----
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Import &amp; Manage Circles
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Import from CCB or mass-update ACPD &amp; Campus assignments.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              ← Back
            </Link>
          </div>

          {/* Tab Switcher */}
          <div className="mb-6 border-b border-gray-700/60">
            <nav className="-mb-px flex space-x-6">
              <button
                onClick={() => setActiveTab('ccb')}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'ccb'
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Import from CCB
                </span>
              </button>
              <button
                onClick={() => setActiveTab('mass-update')}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'mass-update'
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Mass Update
                </span>
              </button>
            </nav>
          </div>

          {/* ===== MASS UPDATE TAB ===== */}
          {activeTab === 'mass-update' && (
            <div className="space-y-6">
              {/* Step 1: Configure update */}
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
                <div className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                    Mass Update ACPD or Campus
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Select circle leaders and assign them a new ACPD or Campus value in bulk.
                  </p>

                  {/* Filter controls */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Filter Leaders By
                      </label>
                      <select
                        value={massUpdateFilterField}
                        onChange={(e) => {
                          setMassUpdateFilterField(e.target.value as 'all' | 'campus' | 'acpd');
                          setMassUpdateFilterValue('');
                        }}
                        className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="all">All Leaders</option>
                        <option value="campus">Current Campus</option>
                        <option value="acpd">Current ACPD</option>
                      </select>
                    </div>

                    {massUpdateFilterField !== 'all' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {massUpdateFilterField === 'campus' ? 'Campus' : 'ACPD'}
                        </label>
                        <select
                          value={massUpdateFilterValue}
                          onChange={(e) => setMassUpdateFilterValue(e.target.value)}
                          className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        >
                          <option value="">-- Select --</option>
                          {massUpdateFilterField === 'campus'
                            ? referenceData.campuses.map((c) => (
                                <option key={c.id} value={c.value}>{c.value}</option>
                              ))
                            : referenceData.directors.map((d) => (
                                <option key={d.id} value={d.name}>{d.name}</option>
                              ))}
                        </select>
                      </div>
                    )}

                    <div className="flex items-end">
                      <button
                        onClick={searchLeadersForMassUpdate}
                        disabled={massUpdateSearching || (massUpdateFilterField !== 'all' && !massUpdateFilterValue)}
                        className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                      >
                        {massUpdateSearching ? 'Loading...' : 'Load Leaders'}
                      </button>
                    </div>
                  </div>

                  {/* Update target controls */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
                        Field to Update
                      </label>
                      <select
                        value={massUpdateField}
                        onChange={(e) => {
                          setMassUpdateField(e.target.value as 'campus' | 'acpd');
                          setMassUpdateValue('');
                        }}
                        className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="campus">Campus</option>
                        <option value="acpd">ACPD / Director</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
                        New Value
                      </label>
                      <select
                        value={massUpdateValue}
                        onChange={(e) => setMassUpdateValue(e.target.value)}
                        className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="">-- Select New Value --</option>
                        {massUpdateField === 'campus'
                          ? referenceData.campuses.map((c) => (
                              <option key={c.id} value={c.value}>{c.value}</option>
                            ))
                          : referenceData.directors.map((d) => (
                              <option key={d.id} value={d.name}>{d.name}</option>
                            ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Select leaders */}
              {massUpdateLeaders.length > 0 && (
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        Select Circle Leaders ({massUpdateLeaders.length} found)
                      </h3>
                      <div className="flex items-center space-x-3">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {massUpdateSelected.size} selected
                        </span>
                        <button
                          onClick={massUpdateSelectAll}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Select All
                        </button>
                        <button
                          onClick={massUpdateDeselectAll}
                          className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left w-10">
                              <input
                                type="checkbox"
                                checked={massUpdateSelected.size === massUpdateLeaders.length && massUpdateLeaders.length > 0}
                                onChange={(e) => e.target.checked ? massUpdateSelectAll() : massUpdateDeselectAll()}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            </th>
                            <th
                              onClick={() => handleSort('name')}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                            >
                              <span className="inline-flex items-center">Name<SortIcon field="name" /></span>
                            </th>
                            <th
                              onClick={() => handleSort('campus')}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                            >
                              <span className="inline-flex items-center">Campus<SortIcon field="campus" /></span>
                            </th>
                            <th
                              onClick={() => handleSort('acpd')}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                            >
                              <span className="inline-flex items-center">ACPD<SortIcon field="acpd" /></span>
                            </th>
                            <th
                              onClick={() => handleSort('status')}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                            >
                              <span className="inline-flex items-center">Status<SortIcon field="status" /></span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {sortedMassUpdateLeaders.map((leader) => (
                            <tr
                              key={leader.id}
                              onClick={(e) => toggleMassUpdateSelect(leader.id, e)}
                              className={`cursor-pointer transition-colors select-none ${
                                massUpdateSelected.has(leader.id)
                                  ? 'bg-blue-50 dark:bg-blue-900/30'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              }`}
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={massUpdateSelected.has(leader.id)}
                                  onChange={() => {}}
                                  onClick={(e) => { e.stopPropagation(); toggleMassUpdateSelect(leader.id, e.nativeEvent as unknown as React.MouseEvent); }}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                {leader.name}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                {leader.campus || '—'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                {leader.acpd || '—'}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  leader.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                                  leader.status === 'paused' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
                                  leader.status === 'pipeline' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' :
                                  leader.status === 'off-boarding' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                                  'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                                }`}>
                                  {leader.status || '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Apply button */}
                    <div className="mt-6 flex items-center justify-between">
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {massUpdateSelected.size > 0 && massUpdateValue ? (
                          <span>
                            Will set <strong>{massUpdateField === 'campus' ? 'Campus' : 'ACPD'}</strong> to{' '}
                            <strong>&ldquo;{massUpdateValue}&rdquo;</strong> for{' '}
                            <strong>{massUpdateSelected.size}</strong> leader{massUpdateSelected.size !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span>Select leaders and a new value above to apply</span>
                        )}
                      </div>
                      <button
                        onClick={handleMassUpdate}
                        disabled={massUpdateLoading || massUpdateSelected.size === 0 || !massUpdateValue}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                      >
                        {massUpdateLoading ? 'Updating...' : `Update ${massUpdateSelected.size} Leader${massUpdateSelected.size !== 1 ? 's' : ''}`}
                      </button>
                    </div>

                    {/* Result banner */}
                    {massUpdateResult && (
                      <div className={`mt-4 p-4 rounded-md ${
                        massUpdateResult.error
                          ? 'bg-red-50 dark:bg-red-900/20'
                          : 'bg-green-50 dark:bg-green-900/20'
                      }`}>
                        {massUpdateResult.error ? (
                          <div className="flex items-center">
                            <svg className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <p className="text-sm text-red-800 dark:text-red-300">
                              Update failed: {massUpdateResult.error}
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <svg className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            <p className="text-sm text-green-800 dark:text-green-300">
                              Successfully updated {massUpdateResult.updated} leader{massUpdateResult.updated !== 1 ? 's' : ''}!
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state after search */}
              {massUpdateLeaders.length === 0 && !massUpdateSearching && massUpdateFilterField !== 'all' && massUpdateFilterValue && (
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400">
                    No circle leaders found matching the selected filter. Try a different filter.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ===== CCB IMPORT TAB ===== */}
          {activeTab === 'ccb' && (
            <>

          {/* Search bar */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Search CCB Groups
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Enter group or circle name..."
                className="flex-1 min-w-0 block w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                disabled={isSearching}
              />
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="inline-flex items-center px-5 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSearching ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Searching…
                  </>
                ) : (
                  'Search CCB'
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              Tip: Leave blank and search to see all CCB groups. Results are cached for 5 minutes.
            </p>
          </div>

          {/* Errors */}
          {searchError && (
            <div className="mb-6 rounded-md bg-red-50 dark:bg-red-900/30 p-4">
              <p className="text-sm text-red-700 dark:text-red-400">{searchError}</p>
            </div>
          )}

          {/* Import result banner */}
          {importResult && (
            <div className="mb-6 rounded-md bg-green-50 dark:bg-green-900/30 p-4">
              <p className="text-sm text-green-700 dark:text-green-400">
                <strong>{importResult.imported}</strong> circle{importResult.imported !== 1 ? 's' : ''} imported successfully.
                {importResult.skipped > 0 && (
                  <> <strong>{importResult.skipped}</strong> skipped (already imported).</>
                )}
              </p>
            </div>
          )}

          {/* Results */}
          {hasSearched && (
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
              {/* Toolbar */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {groups.length} group{groups.length !== 1 ? 's' : ''} found
                  {selected.size > 0 && (
                    <span className="ml-2 font-medium text-blue-600 dark:text-blue-400">
                      · {selected.size} selected
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  {selectableGroups.length > 0 && (
                    <>
                      <button
                        onClick={selected.size === selectableGroups.length ? deselectAll : selectAll}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                      >
                        {selected.size === selectableGroups.length ? 'Deselect All' : 'Select All'}
                      </button>
                      <button
                        onClick={handleImport}
                        disabled={selected.size === 0 || isImporting}
                        className="inline-flex items-center px-4 py-1.5 text-xs font-medium rounded shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isImporting ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Importing…
                          </>
                        ) : (
                          `Import ${selected.size} Circle${selected.size !== 1 ? 's' : ''}`
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Group list */}
              {groups.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                  No groups found matching &ldquo;{searchTerm}&rdquo;
                </div>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {groups.map((g) => {
                    const isImported = g.alreadyImported;
                    const isSelected = selected.has(g.id);

                    return (
                      <li
                        key={g.id}
                        className={`px-6 py-4 flex items-start gap-4 transition-colors ${
                          isImported
                            ? 'opacity-50 bg-gray-50 dark:bg-gray-800/50'
                            : isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/20'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        {/* Checkbox */}
                        <div className="pt-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isImported}
                            onChange={() => toggleSelect(g.id)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-40"
                          />
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {g.name}
                            </span>
                            {g.ccbLink ? (
                              <a
                                href={g.ccbLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                CCB #{g.id}
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                CCB #{g.id}
                              </span>
                            )}

                            {isImported && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                                Already Imported
                              </span>
                            )}

                            {!isImported && g.possibleMatch && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300">
                                Possible match: {g.possibleMatch.name}
                              </span>
                            )}
                          </div>

                          {/* Meta row */}
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                            {g.mainLeader?.fullName && (
                              <span><strong>Leader:</strong> {g.mainLeader.fullName}</span>
                            )}
                            {g.mainLeader?.email && (
                              <span><strong>Email:</strong> {g.mainLeader.email}</span>
                            )}
                            {g.campus && (
                              <span><strong>Campus:</strong> {g.campus}</span>
                            )}
                            {g.groupType && (
                              <span><strong>Type:</strong> {g.groupType}</span>
                            )}
                            {g.meetingDay && (
                              <span><strong>Day:</strong> {g.meetingDay}</span>
                            )}
                            {g.meetingTime && (
                              <span><strong>Time:</strong> {g.meetingTime}</span>
                            )}
                          </div>

                          {g.description && (
                            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 line-clamp-2">
                              {g.description}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
