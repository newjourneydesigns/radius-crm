'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, RefreshCw, Search, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatTimeToAMPM } from '../../../lib/timeUtils';
import { useAuth } from '../../../contexts/AuthContext';
import type {
  EventOccurrenceDeleteCandidate,
  EventOccurrenceGroupInput,
} from '../../../lib/ccb/event-occurrence-delete';

type RadiusCircle = {
  id: number;
  name: string;
  campus: string | null;
  day: string | null;
  time: string | null;
  circle_type: string | null;
  status: string | null;
  ccb_group_id: string | null;
  leader_type: string | null;
  frequency: string | null;
  location: string | null;
  acpd: string | null;
};

type SearchParamsSnapshot = {
  mode: 'radius-circles';
  acpd: string;
  startDate: string;
  endDate: string;
  includeOccurrencesWithAttendance: boolean;
  groupCount: number;
  groups: EventOccurrenceGroupInput[];
};

type SearchResponse = {
  success?: boolean;
  searchParams?: SearchParamsSnapshot;
  occurrences?: EventOccurrenceDeleteCandidate[];
  groupsMatched?: number;
  groupsSearched?: number;
  skippedInactiveGroups?: number;
  skippedAttendance?: number;
  calendarErrors?: Array<{ group_id: string; group_name: string; error: string }>;
  error?: string;
};

type DeleteResult = EventOccurrenceDeleteCandidate & {
  success: boolean;
  ccb_response_status: number | null;
  error_message: string | null;
  audit_error?: string;
};

type DeleteResponse = {
  success?: boolean;
  attempted?: number;
  succeeded?: number;
  failed?: number;
  results?: DeleteResult[];
  error?: string;
};

const selectClass = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white shadow-sm focus:border-vc-500 focus:outline-none focus:ring-2 focus:ring-vc-500/30';
const inputClass = selectClass;
const defaultDates = currentMonthDateRange();

function BodyPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentMonthDateRange() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(today),
  };
}

function normalizeStatus(status: string | null | undefined) {
  return (status || '').trim().toLowerCase();
}

function occurrenceKey(row: Pick<EventOccurrenceDeleteCandidate, 'group_id' | 'event_id' | 'occurrence'>) {
  return `${row.group_id}:${row.event_id}:${row.occurrence}`;
}

function isoFromOccurrence(occurrence: string) {
  return `${occurrence.slice(0, 4)}-${occurrence.slice(4, 6)}-${occurrence.slice(6, 8)}`;
}

function formatEventDate(occurrence: string) {
  const iso = isoFromOccurrence(occurrence);
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function sortCircles(a: RadiusCircle, b: RadiusCircle) {
  const campusCompare = String(a.campus || '').localeCompare(String(b.campus || ''));
  if (campusCompare !== 0) return campusCompare;
  return a.name.localeCompare(b.name);
}

export default function CCBEventOccurrenceDeletePage() {
  const { loading, isAdmin } = useAuth();
  const [circles, setCircles] = useState<RadiusCircle[]>([]);
  const [circlesLoading, setCirclesLoading] = useState(true);
  const [circleError, setCircleError] = useState<string | null>(null);
  const [selectedAcpd, setSelectedAcpd] = useState('all');
  const [startDate, setStartDate] = useState(defaultDates.startDate);
  const [endDate, setEndDate] = useState(defaultDates.endDate);
  const [selectedCircleIds, setSelectedCircleIds] = useState<Set<number>>(new Set());
  const [includeOccurrencesWithAttendance, setIncludeOccurrencesWithAttendance] = useState(false);
  const [allowDeleteAttended, setAllowDeleteAttended] = useState(false);
  const [searching, setSearching] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [deleteResponse, setDeleteResponse] = useState<DeleteResponse | null>(null);
  const [selectedOccurrences, setSelectedOccurrences] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    if (loading || !isAdmin()) return;

    let cancelled = false;
    async function loadCircles() {
      setCirclesLoading(true);
      setCircleError(null);

      try {
        const { data, error } = await supabase
          .from('circle_leaders')
          .select('id, name, campus, day, time, circle_type, status, ccb_group_id, leader_type, frequency, location, acpd')
          .order('name');

        if (error) throw error;
        if (cancelled) return;

        const rows = (data || []) as RadiusCircle[];
        setCircles(rows.filter((circle) => normalizeStatus(circle.status) === 'active'));
      } catch (error) {
        if (!cancelled) {
          setCircleError(error instanceof Error ? error.message : 'Failed to load Radius circles');
        }
      } finally {
        if (!cancelled) setCirclesLoading(false);
      }
    }

    loadCircles();
    return () => {
      cancelled = true;
    };
  }, [loading, isAdmin]);

  const circlesWithCcbGroups = useMemo(
    () => circles.filter((circle) => Boolean(String(circle.ccb_group_id || '').trim())),
    [circles],
  );

  const hiddenMissingCcbCount = circles.length - circlesWithCcbGroups.length;

  const acpdOptions = useMemo(() => {
    const names = circlesWithCcbGroups
      .map((circle) => circle.acpd)
      .filter((name): name is string => Boolean(name && name.trim()))
      .map((name) => name.trim());
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [circlesWithCcbGroups]);

  const shownCircles = useMemo(() => {
    const filtered = selectedAcpd === 'all'
      ? circlesWithCcbGroups
      : circlesWithCcbGroups.filter((circle) => (circle.acpd || '').trim() === selectedAcpd);
    return [...filtered].sort(sortCircles);
  }, [circlesWithCcbGroups, selectedAcpd]);

  const selectedCircles = useMemo(
    () => shownCircles.filter((circle) => selectedCircleIds.has(circle.id)),
    [shownCircles, selectedCircleIds],
  );

  const occurrences = useMemo(() => searchResponse?.occurrences ?? [], [searchResponse?.occurrences]);
  const pickedOccurrences = useMemo(
    () => occurrences.filter((occurrence) => selectedOccurrences.has(occurrenceKey(occurrence))),
    [occurrences, selectedOccurrences],
  );

  const selectedAttendedCount = pickedOccurrences.filter((occurrence) => occurrence.had_attendance).length;
  const requiredConfirmation = `DELETE ${pickedOccurrences.length} OCCURRENCES`;
  const canReviewDelete = pickedOccurrences.length > 0 && !deleting && (selectedAttendedCount === 0 || allowDeleteAttended);
  const dateRangeIsValid = Boolean(startDate && endDate && endDate >= startDate);

  async function authHeaders() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sign in again before using this admin tool.');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  function currentSearchParams(): SearchParamsSnapshot {
    return {
      mode: 'radius-circles',
      acpd: selectedAcpd,
      startDate,
      endDate,
      includeOccurrencesWithAttendance,
      groupCount: selectedCircles.length,
      groups: selectedCircles.map((circle) => ({
        group_id: String(circle.ccb_group_id || '').trim(),
        group_name: circle.name,
        radius_circle_id: circle.id,
        radius_circle_name: circle.name,
      })),
    };
  }

  async function runSearch() {
    if (selectedCircles.length === 0 || !dateRangeIsValid) return;

    setSearching(true);
    setSearchResponse(null);
    setDeleteResponse(null);
    setSelectedOccurrences(new Set());
    setAllowDeleteAttended(false);

    try {
      const params = currentSearchParams();
      const response = await fetch('/api/admin/ccb-event-occurrence-delete/', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          action: 'search',
          searchMode: 'radius-circles',
          acpd: params.acpd,
          startDate: params.startDate,
          endDate: params.endDate,
          includeOccurrencesWithAttendance: params.includeOccurrencesWithAttendance,
          groups: params.groups,
        }),
      });
      const payload = await response.json();
      setSearchResponse(payload);
    } catch (error) {
      setSearchResponse({ error: error instanceof Error ? error.message : 'Search failed' });
    } finally {
      setSearching(false);
    }
  }

  function toggleCircle(circleId: number) {
    setSelectedCircleIds((prev) => {
      const next = new Set(prev);
      if (next.has(circleId)) next.delete(circleId);
      else next.add(circleId);
      return next;
    });
    setSearchResponse(null);
    setDeleteResponse(null);
    setSelectedOccurrences(new Set());
  }

  function toggleAllShownCircles() {
    setSelectedCircleIds((prev) => {
      const shownIds = shownCircles.map((circle) => circle.id);
      const allShownSelected = shownIds.length > 0 && shownIds.every((id) => prev.has(id));
      if (allShownSelected) {
        const next = new Set(prev);
        shownIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...Array.from(prev), ...shownIds]);
    });
    setSearchResponse(null);
    setDeleteResponse(null);
    setSelectedOccurrences(new Set());
  }

  function toggleOccurrence(key: string) {
    setSelectedOccurrences((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDeleteResponse(null);
  }

  function toggleAllShownOccurrences() {
    setSelectedOccurrences((prev) => {
      if (occurrences.length > 0 && occurrences.every((occurrence) => prev.has(occurrenceKey(occurrence)))) {
        return new Set();
      }
      return new Set(occurrences.map(occurrenceKey));
    });
    setDeleteResponse(null);
  }

  async function runDelete() {
    setDeleting(true);
    setReviewOpen(false);
    setDeleteResponse(null);

    try {
      const response = await fetch('/api/admin/ccb-event-occurrence-delete/', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          action: 'delete',
          occurrences: pickedOccurrences,
          searchParams: searchResponse?.searchParams || currentSearchParams(),
          confirmation: requiredConfirmation,
          allowDeleteAttended,
        }),
      });
      const payload = await response.json();
      setDeleteResponse(payload);
      if (response.ok) {
        const deletedKeys = new Set((payload.results || []).filter((row: DeleteResult) => row.success).map(occurrenceKey));
        setSelectedOccurrences((prev) => new Set(Array.from(prev).filter((key) => !deletedKeys.has(key))));
      }
    } catch (error) {
      setDeleteResponse({ error: error instanceof Error ? error.message : 'Delete failed' });
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] p-8 text-gray-700 dark:text-gray-200">Checking access...</div>;
  }

  if (!isAdmin()) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] p-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
          <ShieldAlert className="mb-3 h-8 w-8 text-amber-600" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Admin Access Required</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">This CCB delete tool is available only to Radius admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117]">
      <div className="bg-white shadow dark:bg-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link href="/admin" className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                  Back to Admin
                </Link>
                <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">CCB Event Management</h1>
                <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
                  Select Radius circles by ACPD, dry-run their CCB calendars, then delete only selected event occurrences.
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
                Search never deletes CCB data.
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {circleError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            {circleError}
          </div>
        )}

        <section className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,24rem)_minmax(0,12rem)_minmax(0,12rem)_minmax(0,1fr)] lg:items-end">
            <div>
              <label htmlFor="acpd-filter" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                ACPD
              </label>
              <select
                id="acpd-filter"
                value={selectedAcpd}
                onChange={(event) => {
                  setSelectedAcpd(event.target.value);
                  setSelectedCircleIds(new Set());
                  setSearchResponse(null);
                  setDeleteResponse(null);
                  setSelectedOccurrences(new Set());
                }}
                className={selectClass}
              >
                <option value="all">All ACPDs</option>
                {acpdOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="start-date" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Start date
              </label>
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setSearchResponse(null);
                  setDeleteResponse(null);
                  setSelectedOccurrences(new Set());
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="end-date" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                End date
              </label>
              <input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setSearchResponse(null);
                  setDeleteResponse(null);
                  setSelectedOccurrences(new Set());
                }}
                className={inputClass}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-vc-600 focus:ring-vc-500"
                  checked={includeOccurrencesWithAttendance}
                  onChange={(event) => {
                    setIncludeOccurrencesWithAttendance(event.target.checked);
                    setSearchResponse(null);
                    setSelectedOccurrences(new Set());
                    setDeleteResponse(null);
                  }}
                />
                Include occurrences with attendance
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-400">
            <p>
              Showing <span className="font-semibold text-gray-900 dark:text-white">{shownCircles.length}</span> active Radius circle{shownCircles.length === 1 ? '' : 's'} with CCB group IDs.
              {hiddenMissingCcbCount > 0 && (
                <span className="ml-2">{hiddenMissingCcbCount} active circle{hiddenMissingCcbCount === 1 ? '' : 's'} without CCB group IDs hidden.</span>
              )}
            </p>
            <p>
              CCB calendar window: <span className="font-semibold text-gray-900 dark:text-white">{startDate || 'not set'}</span> to{' '}
              <span className="font-semibold text-gray-900 dark:text-white">{endDate || 'not set'}</span>
            </p>
          </div>
          {!dateRangeIsValid && (
            <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">
              End date must be on or after start date.
            </p>
          )}
        </section>

        <section className="rounded-lg bg-white shadow dark:bg-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Radius Circles</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {selectedCircles.length} selected for CCB calendar search.
              </p>
            </div>
            <button
              type="button"
              onClick={toggleAllShownCircles}
              disabled={shownCircles.length === 0}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {shownCircles.length > 0 && shownCircles.every((circle) => selectedCircleIds.has(circle.id)) ? 'Clear shown' : 'Select all shown'}
            </button>
          </div>

          {circlesLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-vc-500" />
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading circles...</p>
            </div>
          ) : shownCircles.length === 0 ? (
            <div className="p-8 text-center">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">No circles found</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose another ACPD or add CCB group IDs to the Radius circles.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="w-12 px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Pick</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Circle Leader</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Day</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Campus</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">CCB Group</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {shownCircles.map((circle) => (
                    <tr key={circle.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-vc-600 focus:ring-vc-500"
                          checked={selectedCircleIds.has(circle.id)}
                          onChange={() => toggleCircle(circle.id)}
                          aria-label={`Select ${circle.name}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{circle.name}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{circle.acpd || 'No ACPD'}</div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">{circle.circle_type || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">{circle.day || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">{formatTimeToAMPM(circle.time) || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{circle.location || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">{circle.campus || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">{circle.ccb_group_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 p-4 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {selectedCircles.length} circle{selectedCircles.length === 1 ? '' : 's'} selected for {startDate || 'start date'} to {endDate || 'end date'}.
            </p>
            <button
              type="button"
              onClick={runSearch}
              disabled={searching || selectedCircles.length === 0 || !dateRangeIsValid}
              className="inline-flex items-center gap-2 rounded-lg bg-vc-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-vc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searching ? 'Searching CCB...' : 'Show Selected Circles'}
            </button>
          </div>
        </section>

        {searchResponse?.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            {searchResponse.error}
          </div>
        )}

        {searchResponse?.success && (
          <section className="rounded-lg bg-white shadow dark:bg-gray-800">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Event Results</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {occurrences.length} occurrence{occurrences.length === 1 ? '' : 's'} shown from {searchResponse.groupsMatched} selected CCB group{searchResponse.groupsMatched === 1 ? '' : 's'}.
                  {searchResponse.skippedAttendance ? ` ${searchResponse.skippedAttendance} attended occurrence(s) were blocked by default.` : ''}
                </p>
                {searchResponse.searchParams && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    ACPD {searchResponse.searchParams.acpd} | {searchResponse.searchParams.startDate} to {searchResponse.searchParams.endDate}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={toggleAllShownOccurrences}
                disabled={occurrences.length === 0}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {occurrences.length > 0 && occurrences.every((occurrence) => selectedOccurrences.has(occurrenceKey(occurrence))) ? 'Clear selection' : 'Select all shown'}
              </button>
            </div>

            {Boolean(searchResponse.calendarErrors?.length) && (
              <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
                <div className="font-semibold">Some group calendars could not be searched.</div>
                <ul className="mt-1 list-disc pl-5">
                  {searchResponse.calendarErrors!.slice(0, 5).map((error) => (
                    <li key={error.group_id}>{error.group_name}: {error.error}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="w-12 px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Pick</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Group</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Event</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Event Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Start</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Attendance</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Indicators</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {occurrences.map((occurrence) => {
                    const key = occurrenceKey(occurrence);
                    return (
                      <tr key={key} className={occurrence.had_attendance ? 'bg-amber-50 dark:bg-amber-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}>
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-vc-600 focus:ring-vc-500"
                            checked={selectedOccurrences.has(key)}
                            onChange={() => toggleOccurrence(key)}
                            aria-label={`Select ${occurrence.event_name}`}
                          />
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{occurrence.group_name}</div>
                          <div className="font-mono text-xs text-gray-500 dark:text-gray-400">{occurrence.group_id}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{occurrence.event_name}</div>
                          <div className="font-mono text-xs text-gray-500 dark:text-gray-400">event {occurrence.event_id}</div>
                          {occurrence.status && <div className="text-xs text-gray-500 dark:text-gray-400">{occurrence.status}</div>}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-gray-900 dark:text-white">
                          {formatEventDate(occurrence.occurrence)}
                          <div className="font-mono text-gray-500 dark:text-gray-400">occurrence {occurrence.occurrence}</div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">{formatDateTime(occurrence.start)}</td>
                        <td className="px-6 py-4 text-sm">
                          {occurrence.had_attendance ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-100">
                              <AlertTriangle className="h-3 w-3" />
                              {occurrence.total_attendance ?? 'recorded'}
                            </span>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">none known</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">{occurrence.recurrence_label}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {occurrence.notes_indicators.length ? occurrence.notes_indicators.join(', ') : 'none'}
                        </td>
                      </tr>
                    );
                  })}
                  {occurrences.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        No matching occurrences found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {occurrences.length > 0 && (
              <div className="border-t border-gray-200 p-4 dark:border-gray-700">
                {selectedAttendedCount > 0 && (
                  <label className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
                    <input
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-vc-600 focus:ring-vc-500"
                      type="checkbox"
                      checked={allowDeleteAttended}
                      onChange={(event) => setAllowDeleteAttended(event.target.checked)}
                    />
                    <span>
                      I understand {selectedAttendedCount} selected event{selectedAttendedCount === 1 ? '' : 's'} have attendance recorded, and I still want to delete them from CCB.
                    </span>
                  </label>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {pickedOccurrences.length} event{pickedOccurrences.length === 1 ? '' : 's'} selected. Radius deletes individual event occurrences only, never the full recurring event series.
                  </p>
                  <button
                    type="button"
                    onClick={() => setReviewOpen(true)}
                    disabled={!canReviewDelete}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete {pickedOccurrences.length} Event{pickedOccurrences.length === 1 ? '' : 's'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {deleteResponse && (
          <section className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
            {deleteResponse.error ? (
              <div className="text-sm font-semibold text-red-700 dark:text-red-300">{deleteResponse.error}</div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-gray-700 dark:text-gray-200">
                  <span><strong>{deleteResponse.attempted}</strong> attempted</span>
                  <span className="text-emerald-700 dark:text-emerald-300"><strong>{deleteResponse.succeeded}</strong> succeeded</span>
                  <span className="text-red-700 dark:text-red-300"><strong>{deleteResponse.failed}</strong> failed</span>
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Group</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Event</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Event Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {(deleteResponse.results || []).map((result) => (
                        <tr key={occurrenceKey(result)}>
                          <td className="whitespace-nowrap px-6 py-4 text-sm">
                            {result.success ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />Deleted</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-semibold text-red-700 dark:text-red-300"><XCircle className="h-4 w-4" />Failed</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">{result.group_name}</td>
                          <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{result.event_name}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                            {formatEventDate(result.occurrence)}
                            <div className="font-mono text-xs text-gray-500 dark:text-gray-400">occurrence {result.occurrence}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
      </main>

      {reviewOpen && (
        <BodyPortal>
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="border-b border-gray-200 p-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Final Review Before Delete</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Radius will send one DELETE request per selected occurrence.</p>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-4">
              <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                {pickedOccurrences.map((occurrence) => (
                  <li key={occurrenceKey(occurrence)} className="p-3 text-sm">
                    <div className="font-semibold text-gray-900 dark:text-white">{occurrence.event_name}</div>
                    <div className="text-gray-600 dark:text-gray-300">
                      {occurrence.group_name} | event date {formatEventDate(occurrence.occurrence)} | event {occurrence.event_id} | occurrence {occurrence.occurrence}
                    </div>
                    {occurrence.had_attendance && <div className="mt-1 text-amber-700 dark:text-amber-300">Attendance known: {occurrence.total_attendance ?? 'recorded'}</div>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                onClick={() => setReviewOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                disabled={deleting}
                onClick={runDelete}
              >
                {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete {pickedOccurrences.length} Event{pickedOccurrences.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
        </BodyPortal>
      )}
    </div>
  );
}
