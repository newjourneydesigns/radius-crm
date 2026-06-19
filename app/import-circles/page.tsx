'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import ProtectedRoute from '../../components/ProtectedRoute';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  frequency: string | null;
  circle_type: string | null;
  day: string | null;
  time: string | null;
  meeting_start_date: string | null;
  email_reminders_enabled: boolean;
}

interface RowEditValues {
  frequency: string;
  day: string;
  time: string;
  meeting_start_date: string;
}

interface ReferenceData {
  directors: { id: number; name: string }[];
  campuses: { id: number; value: string }[];
  circleTypes: { id: number; value: string }[];
  frequencies: { id: number; value: string }[];
}

export default function ImportCirclesPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<'ccb' | 'mass-update'>('ccb');

  // CCB Import state
  const [groups, setGroups] = useState<CCBGroup[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Filters
  const [selectedCampus, setSelectedCampus] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [campusOptions, setCampusOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ id: string; name: string }>>([]);

  // ACPD assignment
  const [groupAcpd, setGroupAcpd] = useState<Record<string, string>>({});
  const [acpdOptions, setAcpdOptions] = useState<Array<{ id: number; name: string }>>([]);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token || null);
    });
  }, []);

  useEffect(() => {
    const syncTabFromHash = () => {
      if (window.location.hash === '#mass-update') {
        setActiveTab('mass-update');
      }
    };

    syncTabFromHash();
    window.addEventListener('hashchange', syncTabFromHash);
    return () => window.removeEventListener('hashchange', syncTabFromHash);
  }, []);

  // Load filter options on mount
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const res = await fetch('/api/reference-data');
        if (res.ok) {
          const data = await res.json();
          setAcpdOptions(data.directors || []);
          const depts = data.departments || [];
          setDeptOptions(depts);
        }
      } catch (err) {
        console.error('Failed to load options:', err);
      }
    };
    loadOptions();
  }, []);

  // Load circles when accessToken becomes available or filters change
  useEffect(() => {
    if (accessToken && activeTab === 'ccb') {
      loadCircles();
    }
  }, [accessToken, selectedCampus, selectedDept, activeTab, loadCircles]);

  // Load circles from CCB
  const loadCircles = useCallback(async () => {
    setIsLoading(true);
    setSearchError('');
    setImportResult(null);
    setSelected(new Set());
    setGroupAcpd({});

    try {
      const url = new URL('/api/ccb/import-circles', window.location.origin);
      if (selectedCampus) url.searchParams.set('campus', selectedCampus);
      if (selectedDept) url.searchParams.set('department', selectedDept);

      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(url.toString(), { headers });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setGroups(json.groups || []);

      // Extract unique campuses from results for dynamic filter
      const camps = new Map<string, string>();
      (json.groups || []).forEach((g: any) => {
        if (g.campusId && g.campus) {
          camps.set(String(g.campusId), g.campus);
        }
      });
      setCampusOptions(Array.from(camps.entries()).map(([id, name]) => ({ id, name })));
    } catch (err: any) {
      setSearchError(err.message || 'Failed to load circles');
      setGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCampus, selectedDept, accessToken]);

  // Mass Update state
  const [massUpdateField, setMassUpdateField] = useState<'campus' | 'acpd' | 'frequency' | 'circle_type' | 'day' | 'time' | 'meeting_start_date' | 'status' | 'email_reminders_enabled'>('campus');
  const [massUpdateValue, setMassUpdateValue] = useState('');
  const [massUpdateFilterField, setMassUpdateFilterField] = useState<'all' | 'campus' | 'acpd'>('all');
  const [massUpdateFilterValue, setMassUpdateFilterValue] = useState('');
  const [massUpdateLeaders, setMassUpdateLeaders] = useState<MassUpdateLeader[]>([]);
  const [massUpdateSelected, setMassUpdateSelected] = useState<Set<number>>(new Set());
  const [massUpdateLoading, setMassUpdateLoading] = useState(false);
  const [massUpdateSearching, setMassUpdateSearching] = useState(false);
  const [massUpdateResult, setMassUpdateResult] = useState<{ updated: number; error?: string } | null>(null);
  const [referenceData, setReferenceData] = useState<ReferenceData>({ directors: [], campuses: [], circleTypes: [], frequencies: [] });

  // Inline row edit state
  const [editingLeaderId, setEditingLeaderId] = useState<number | null>(null);
  const [editingValues, setEditingValues] = useState<RowEditValues>({ frequency: '', day: '', time: '', meeting_start_date: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const isValidHHmm = (t: string) => /^\d{2}:\d{2}(:\d{2})?$/.test(t);

  const startEditRow = (leader: MassUpdateLeader) => {
    setEditingLeaderId(leader.id);
    setEditingValues({
      frequency: leader.frequency || '',
      day: leader.day || '',
      time: leader.time && isValidHHmm(leader.time) ? leader.time : '',
      meeting_start_date: leader.meeting_start_date || '',
    });
  };

  const cancelEditRow = () => {
    setEditingLeaderId(null);
  };

  const saveEditRow = async () => {
    if (editingLeaderId === null) return;
    setIsSavingEdit(true);
    try {
      const patchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) patchHeaders['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch(`/api/circle-leaders/${editingLeaderId}`, {
        method: 'PATCH',
        headers: patchHeaders,
        body: JSON.stringify(editingValues),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      setMassUpdateLeaders(prev =>
        prev.map(l =>
          l.id === editingLeaderId
            ? { ...l, ...editingValues, meeting_start_date: editingValues.meeting_start_date || null }
            : l
        )
      );
      setEditingLeaderId(null);
    } catch (err: any) {
      alert(err.message || 'Failed to save');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const formatTime = (t: string | null) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return t;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  // Sort state for mass update table
  type SortField = 'name' | 'campus' | 'acpd' | 'status' | 'frequency' | 'circle_type' | 'day' | 'time' | 'email_reminders_enabled';
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
      const aVal = String(a[sortField] ?? '').toLowerCase();
      const bVal = String(b[sortField] ?? '').toLowerCase();
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
            circleTypes: data.circleTypes || [],
            frequencies: data.frequencies || [],
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
        frequency: l.frequency || null,
        circle_type: l.circle_type || null,
        day: l.day || null,
        time: l.time || null,
        meeting_start_date: l.meeting_start_date || null,
        email_reminders_enabled: Boolean(l.email_reminders_enabled),
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
    if (massUpdateSelected.size === 0 || massUpdateValue === '') return;

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

  // ---- Selection helpers ----
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(groups.map((g) => g.id)));
  };
  const deselectAll = () => setSelected(new Set());

  // ---- Import ----
  const handleImport = useCallback(async () => {
    if (selected.size === 0) return;

    setIsImporting(true);
    setSearchError('');
    setImportResult(null);

    const toImport = groups.filter((g) => selected.has(g.id)).map(g => ({
      ...g,
      acpd: groupAcpd[g.id] || null,
    }));

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch('/api/ccb/import-circles', {
        method: 'POST',
        headers,
        body: JSON.stringify({ groups: toImport }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setImportResult(json);

      // Reload circles after successful import
      if (json.imported > 0) {
        setSelected(new Set());
        setTimeout(() => loadCircles(), 800);
      }
    } catch (err: any) {
      setSearchError(err.message || 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  }, [selected, groups, groupAcpd, accessToken, loadCircles]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] py-4 px-4 sm:px-6">
        <div className="w-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Import &amp; Manage Circles
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Import from CCB or mass-update ACPD, Campus, Frequency &amp; Circle Type assignments.
              </p>
            </div>
            <Link
              href="/boards"
              className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              ← Back
            </Link>
          </div>

          {/* Tab Switcher */}
          <div className="mb-6">
            <nav className="inline-flex rounded-lg bg-gray-200/60 dark:bg-gray-800 p-1 gap-1">
              <button
                onClick={() => setActiveTab('ccb')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeTab === 'ccb'
                    ? 'bg-white dark:bg-blue-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Import from CCB
              </button>
              <button
                onClick={() => setActiveTab('mass-update')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeTab === 'mass-update'
                    ? 'bg-white dark:bg-blue-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Mass Update
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
                    Mass Update Circles
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Select circle leaders and update their Campus, ACPD, Frequency, Circle Type, or Circle Summary email reminders in bulk.
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
                        className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-vc-500 focus:ring-vc-500 sm:text-sm"
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
                          className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-vc-500 focus:ring-vc-500 sm:text-sm"
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
                          setMassUpdateField(e.target.value as 'campus' | 'acpd' | 'frequency' | 'circle_type' | 'day' | 'time' | 'meeting_start_date' | 'status' | 'email_reminders_enabled');
                          setMassUpdateValue('');
                        }}
                        className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-vc-500 focus:ring-vc-500 sm:text-sm"
                      >
                        <option value="campus">Campus</option>
                        <option value="acpd">ACPD / Director</option>
                        <option value="frequency">Frequency</option>
                        <option value="circle_type">Circle Type</option>
                        <option value="day">Meeting Day</option>
                        <option value="time">Meeting Time</option>
                        <option value="meeting_start_date">Bi-weekly Start Date</option>
                        <option value="status">Status</option>
                        <option value="email_reminders_enabled">Circle Summary Email Reminders</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
                        New Value
                      </label>
                      {massUpdateField === 'time' ? (
                        <input
                          type="time"
                          value={massUpdateValue}
                          onChange={(e) => setMassUpdateValue(e.target.value)}
                          className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-vc-500 focus:ring-vc-500 sm:text-sm px-3 py-2"
                        />
                      ) : massUpdateField === 'meeting_start_date' ? (
                        <input
                          type="date"
                          value={massUpdateValue}
                          onChange={(e) => setMassUpdateValue(e.target.value)}
                          className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-vc-500 focus:ring-vc-500 sm:text-sm px-3 py-2"
                        />
                      ) : (
                        <select
                          value={massUpdateValue}
                          onChange={(e) => setMassUpdateValue(e.target.value)}
                          className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-vc-500 focus:ring-vc-500 sm:text-sm"
                        >
                          <option value="">-- Select New Value --</option>
                          {massUpdateField === 'campus'
                            ? referenceData.campuses.map((c) => (
                                <option key={c.id} value={c.value}>{c.value}</option>
                              ))
                            : massUpdateField === 'acpd'
                            ? referenceData.directors.map((d) => (
                                <option key={d.id} value={d.name}>{d.name}</option>
                              ))
                            : massUpdateField === 'frequency'
                            ? referenceData.frequencies.map((f) => (
                                <option key={f.id} value={f.value}>{f.value}</option>
                              ))
                            : massUpdateField === 'day'
                            ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))
                            : massUpdateField === 'status'
                            ? ['invited', 'on-boarding', 'active', 'paused', 'off-boarding'].map((s) => (
                                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                              ))
                            : massUpdateField === 'email_reminders_enabled'
                            ? (
                              <>
                                <option value="true">Turn On</option>
                                <option value="false">Turn Off</option>
                              </>
                            )
                            : referenceData.circleTypes.map((ct) => (
                                <option key={ct.id} value={ct.value}>{ct.value}</option>
                              ))}
                        </select>
                      )}
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

                    <div className="overflow-x-auto overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg" style={{ maxHeight: 'calc(100vh - 420px)', minHeight: '300px' }}>
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left w-10">
                              <input
                                type="checkbox"
                                checked={massUpdateSelected.size === massUpdateLeaders.length && massUpdateLeaders.length > 0}
                                onChange={(e) => e.target.checked ? massUpdateSelectAll() : massUpdateDeselectAll()}
                                className="rounded border-gray-300 text-blue-600 focus:ring-vc-500"
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
                              onClick={() => handleSort('frequency')}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                            >
                              <span className="inline-flex items-center">Frequency<SortIcon field="frequency" /></span>
                            </th>
                            <th
                              onClick={() => handleSort('circle_type')}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                            >
                              <span className="inline-flex items-center">Type<SortIcon field="circle_type" /></span>
                            </th>
                            <th
                              onClick={() => handleSort('day')}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                            >
                              <span className="inline-flex items-center">Day<SortIcon field="day" /></span>
                            </th>
                            <th
                              onClick={() => handleSort('time')}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                            >
                              <span className="inline-flex items-center">Time<SortIcon field="time" /></span>
                            </th>
                            <th
                              onClick={() => handleSort('status')}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                            >
                              <span className="inline-flex items-center">Status<SortIcon field="status" /></span>
                            </th>
                            <th
                              onClick={() => handleSort('email_reminders_enabled')}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                            >
                              <span className="inline-flex items-center">Email Reminders<SortIcon field="email_reminders_enabled" /></span>
                            </th>
                            <th className="px-4 py-3 w-10" />
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {sortedMassUpdateLeaders.map((leader) => {
                            const isEditing = editingLeaderId === leader.id;
                            return (
                            <tr
                              key={leader.id}
                              onClick={(e) => { if (!isEditing) toggleMassUpdateSelect(leader.id, e); }}
                              className={`transition-colors select-none ${
                                isEditing
                                  ? 'bg-yellow-50 dark:bg-yellow-900/20'
                                  : massUpdateSelected.has(leader.id)
                                  ? 'bg-blue-50 dark:bg-blue-900/30 cursor-pointer'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer'
                              }`}
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={massUpdateSelected.has(leader.id)}
                                  disabled={isEditing}
                                  onChange={() => {}}
                                  onClick={(e) => { e.stopPropagation(); if (!isEditing) toggleMassUpdateSelect(leader.id, e.nativeEvent as unknown as React.MouseEvent); }}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-vc-500"
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
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                {isEditing ? (
                                  <select
                                    value={editingValues.frequency}
                                    onChange={(e) => setEditingValues(v => ({ ...v, frequency: e.target.value }))}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full text-xs rounded border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 dark:text-white px-1 py-1"
                                  >
                                    <option value="">— none —</option>
                                    {referenceData.frequencies.map((f) => (
                                      <option key={f.id} value={f.value}>{f.value}</option>
                                    ))}
                                  </select>
                                ) : (leader.frequency || '—')}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                {leader.circle_type || '—'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                {isEditing ? (
                                  <select
                                    value={editingValues.day}
                                    onChange={(e) => setEditingValues(v => ({ ...v, day: e.target.value }))}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full text-xs rounded border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 dark:text-white px-1 py-1"
                                  >
                                    <option value="">— none —</option>
                                    {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d) => (
                                      <option key={d} value={d}>{d}</option>
                                    ))}
                                  </select>
                                ) : (leader.day || '—')}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                {isEditing ? (
                                  <input
                                    type="time"
                                    value={editingValues.time}
                                    onChange={(e) => setEditingValues(v => ({ ...v, time: e.target.value }))}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full text-xs rounded border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 dark:text-white px-1 py-1"
                                  />
                                ) : formatTime(leader.time)}
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
                              <td className="px-4 py-3 text-sm">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  leader.email_reminders_enabled
                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                                }`}>
                                  {leader.email_reminders_enabled ? 'On' : 'Off'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                                {isEditing ? (
                                  <div className="flex items-center gap-1">
                                    <div className="flex flex-col gap-1 mr-1">
                                      <span className="text-xs text-gray-400 dark:text-gray-500">Start date</span>
                                      <input
                                        type="date"
                                        value={editingValues.meeting_start_date}
                                        onChange={(e) => setEditingValues(v => ({ ...v, meeting_start_date: e.target.value }))}
                                        className="text-xs rounded border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 dark:text-white px-1 py-1"
                                      />
                                    </div>
                                    <button
                                      onClick={saveEditRow}
                                      disabled={isSavingEdit}
                                      title="Save"
                                      className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 disabled:opacity-50"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={cancelEditRow}
                                      title="Cancel"
                                      className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => startEditRow(leader)}
                                    title="Edit meeting info"
                                    className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  </button>
                                )}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Apply button */}
                    <div className="mt-6 flex items-center justify-between">
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {massUpdateSelected.size > 0 && massUpdateValue !== '' ? (
                          <span>
                            Will set <strong>{massUpdateField === 'campus' ? 'Campus' : massUpdateField === 'acpd' ? 'ACPD' : massUpdateField === 'frequency' ? 'Frequency' : massUpdateField === 'day' ? 'Meeting Day' : massUpdateField === 'time' ? 'Meeting Time' : massUpdateField === 'meeting_start_date' ? 'Bi-weekly Start Date' : massUpdateField === 'status' ? 'Status' : massUpdateField === 'email_reminders_enabled' ? 'Circle Summary Email Reminders' : 'Circle Type'}</strong> to{' '}
                            <strong>&ldquo;{massUpdateField === 'time' ? formatTime(massUpdateValue) : massUpdateField === 'email_reminders_enabled' ? (massUpdateValue === 'true' ? 'On' : 'Off') : massUpdateValue}&rdquo;</strong> for{' '}
                            <strong>{massUpdateSelected.size}</strong> leader{massUpdateSelected.size !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span>Select leaders and a new value above to apply</span>
                        )}
                      </div>
                      <button
                        onClick={handleMassUpdate}
                        disabled={massUpdateLoading || massUpdateSelected.size === 0 || massUpdateValue === ''}
                        className="btn-primary px-6 py-2 rounded-lg text-sm"
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

          {/* Filter controls */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Filter Active Circles</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Campus
                </label>
                <select
                  value={selectedCampus}
                  onChange={(e) => setSelectedCampus(e.target.value)}
                  className="block w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-vc-500 focus:border-vc-500"
                >
                  <option value="">All Campuses</option>
                  {campusOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Department
                </label>
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="block w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-vc-500 focus:border-vc-500"
                >
                  <option value="">All Departments</option>
                  {deptOptions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
              Showing active circles not yet imported to RADIUS. {groups.length} found.
            </p>
          </div>

          {/* Errors */}
          {searchError && (
            <div className="mb-6 rounded-md bg-red-50 dark:bg-red-900/30 p-4">
              <p className="text-sm text-red-700 dark:text-red-400">{searchError}</p>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="mb-6 bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-vc-500 mx-auto mb-3"></div>
              <p className="text-gray-600 dark:text-gray-400">Loading circles from CCB...</p>
            </div>
          )}

          {/* Import result banner */}
          {importResult && (
            <div className="mb-6 rounded-md bg-green-50 dark:bg-green-900/30 p-4">
              <p className="text-sm text-green-700 dark:text-green-400">
                <strong>{importResult.imported}</strong> circle{importResult.imported !== 1 ? 's' : ''} imported successfully.
                {importResult.skipped > 0 && (
                  <> <strong>{importResult.skipped}</strong> skipped.</>
                )}
              </p>
            </div>
          )}

          {/* Results */}
          {!isLoading && (
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
              {/* Toolbar */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {groups.length} circle{groups.length !== 1 ? 's' : ''} available
                  {selected.size > 0 && (
                    <span className="ml-2 font-medium text-blue-600 dark:text-blue-400">
                      · {selected.size} selected
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  {groups.length > 0 && (
                    <>
                      <button
                        onClick={selected.size === groups.length ? deselectAll : selectAll}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                      >
                        {selected.size === groups.length ? 'Deselect All' : 'Select All'}
                      </button>
                      <button
                        onClick={handleImport}
                        disabled={selected.size === 0 || isImporting}
                        className="btn-success inline-flex items-center px-4 py-1.5 rounded-lg text-xs"
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
                  No circles found. Try adjusting filters.
                </div>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {groups.map((g) => {
                    const isSelected = selected.has(g.id);

                    return (
                      <li
                        key={g.id}
                        className={`px-6 py-4 transition-colors ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          {/* Checkbox */}
                          <div className="pt-1 shrink-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(g.id)}
                              className="h-4 w-4 text-blue-600 focus:ring-vc-500 border-gray-300 rounded"
                            />
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">
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
                            </div>

                            {/* Meta row */}
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
                              {g.mainLeader?.fullName && (
                                <span><strong>Leader:</strong> {g.mainLeader.fullName}</span>
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

                            {/* ACPD selector (only for selected items) */}
                            {isSelected && (
                              <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-3 border border-blue-200 dark:border-blue-900">
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Assign Director (ACPD)
                                </label>
                                <select
                                  value={groupAcpd[g.id] || ''}
                                  onChange={(e) => setGroupAcpd(prev => ({ ...prev, [g.id]: e.target.value }))}
                                  className="block w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-vc-500 focus:border-vc-500"
                                >
                                  <option value="">— No Director —</option>
                                  {acpdOptions.map((acpd) => (
                                    <option key={acpd.id} value={acpd.name}>{acpd.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
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
