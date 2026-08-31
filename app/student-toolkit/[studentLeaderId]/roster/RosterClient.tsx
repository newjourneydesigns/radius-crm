'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StudentRosterRow } from '../../../../lib/supabase';

/**
 * The student roster.
 *
 * Forked from the Circle Leader Toolkit's roster, with two deliberate
 * departures:
 *
 *  1. **No contact information.** These are minors. No phone, no email, no
 *     call/text buttons — the adult roster leads with those. Student leaders
 *     reach their students in GroupMe, outside this app.
 *  2. **Two dates instead of one.** "Last at circle" is what a leader acts on;
 *     "last at the movement" is the context that says *which kind* of absence
 *     this is. A student still at the movement but skipping circle is drifting
 *     and reachable on Wednesday; one missing from both has gone quiet. The row
 *     and the alerts encode that difference rather than printing two dates and
 *     leaving the reading to the leader.
 */

// Mirrors ABSENCE_THRESHOLD_DAYS / SNOOZE_DURATION_DAYS in
// lib/student-toolkit/roster-data.ts. Duplicated rather than imported because
// that module pulls in the service-role Supabase client (Node-only) and would
// drag it into this bundle.
const ABSENCE_THRESHOLD_DAYS = 15;
const SNOOZE_DURATION_DAYS = 7;

const ROSTER_CACHE_KEY = 'st:roster-cache:v1';
const BIRTHDAY_DISMISS_KEY = 'st:bday-dismiss:v1';
const ROSTER_SORT_KEY = 'st:roster-sort:v1';
const REVALIDATE_THROTTLE_MS = 30_000;

type SortBy = 'absence' | 'firstName' | 'lastName';

type DirectoryResult = {
  ccb_individual_id: string;
  full_name: string | null;
  birthday: string | null;
  grade: string | null;
};

type RosterCacheEntry = {
  leaderId: string;
  rows: StudentRosterRow[];
  attendanceConnected: boolean;
  cachedAt: number;
};

/* ---------------------------------------------------------------- helpers */

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function fullNameOf(row: Pick<StudentRosterRow, 'full_name' | 'first_name' | 'last_name'>): string {
  return (
    row.full_name?.trim() ||
    `${row.first_name || ''} ${row.last_name || ''}`.trim() ||
    'Unnamed student'
  );
}

// Parse a CCB birthday string (commonly "YYYY-MM-DD" or "MM/DD/YYYY") into
// { month, day }. Year is ignored — we only care about upcoming birthdays.
function parseBirthday(raw: string | null | undefined): { month: number; day: number } | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const month = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (us) {
    const month = parseInt(us[1], 10);
    const day = parseInt(us[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }
  return null;
}

function daysUntilBirthday(b: { month: number; day: number }, now = new Date()): number {
  const year = now.getFullYear();
  let next = new Date(year, b.month - 1, b.day);
  // Compare on date-only (strip time) so "today" reads as 0 days.
  const today = new Date(year, now.getMonth(), now.getDate());
  if (next.getTime() < today.getTime()) {
    next = new Date(year + 1, b.month - 1, b.day);
  }
  return Math.round((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function birthdayLabel(b: { month: number; day: number }): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[b.month - 1]} ${b.day}`;
}

function daysSince(isoDate: string | null | undefined, now = new Date()): number | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function formatLastAttended(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function agoLabel(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function isSnoozed(row: StudentRosterRow, now = Date.now()): boolean {
  return !!row.snoozed_until && new Date(row.snoozed_until).getTime() > now;
}

/**
 * How this student is doing, read from both dates at once.
 *
 *  - `ok`      — at circle recently.
 *  - `drift`   — missing from circle, but still showing up at the movement.
 *  - `gone`    — missing from both.
 *  - `unknown` — nothing on record yet (a new student, or attendance isn't
 *                connected). Unknown is never treated as absent.
 */
type Tone = 'ok' | 'drift' | 'gone' | 'unknown';

type Attendance = {
  tone: Tone;
  circleDays: number | null;
  movementDays: number | null;
  /** Past the absence threshold and not snoozed — i.e. worth an alert. */
  needsAttention: boolean;
  movementNote: string;
};

function readAttendance(row: StudentRosterRow, now = new Date()): Attendance {
  const circleDays = daysSince(row.lastAttendedCircle, now);
  const movementDays = daysSince(row.lastAttendedMovement, now);
  const circleAbsent = circleDays !== null && circleDays >= ABSENCE_THRESHOLD_DAYS;
  const movementAbsent = movementDays === null || movementDays >= ABSENCE_THRESHOLD_DAYS;

  const tone: Tone =
    circleDays === null ? 'unknown' : circleAbsent ? (movementAbsent ? 'gone' : 'drift') : 'ok';

  let movementNote: string;
  if (movementDays === null) {
    movementNote =
      circleDays === null ? 'No check-ins recorded yet' : 'No movement check-in this term';
  } else if (tone === 'drift') {
    movementNote = `Still at the movement · ${agoLabel(movementDays)}`;
  } else if (tone === 'gone') {
    movementNote = `Not at the movement either · ${agoLabel(movementDays)}`;
  } else {
    movementNote = `Movement · ${agoLabel(movementDays)}`;
  }

  return {
    tone,
    circleDays,
    movementDays,
    needsAttention: circleAbsent && !isSnoozed(row),
    movementNote,
  };
}

/* ------------------------------------------------------------------ cache */

// Stale-while-revalidate: the server render is the source of truth, but a
// cached copy keeps the list on screen when a cold open catches a slow or
// failing read instead of dropping the leader onto an empty roster.
function readRosterCache(leaderId: string): RosterCacheEntry | null {
  try {
    const raw = sessionStorage.getItem(ROSTER_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as RosterCacheEntry;
    return entry?.leaderId === leaderId && Array.isArray(entry.rows) ? entry : null;
  } catch {
    return null;
  }
}

function writeRosterCache(leaderId: string, rows: StudentRosterRow[], attendanceConnected: boolean): void {
  try {
    const entry: RosterCacheEntry = { leaderId, rows, attendanceConnected, cachedAt: Date.now() };
    sessionStorage.setItem(ROSTER_CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

/* ----------------------------------------------------------------- client */

export default function RosterClient({
  leaderId,
  campus,
  termLabel,
  initialRows,
  initialAttendanceConnected,
  initialError,
}: {
  leaderId: string;
  campus: string | null;
  termLabel: string;
  initialRows: StudentRosterRow[];
  initialAttendanceConnected: boolean;
  initialError: string | null;
}) {
  const [rows, setRows] = useState<StudentRosterRow[]>(initialRows);
  const [attendanceConnected, setAttendanceConnected] = useState(initialAttendanceConnected);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [mounted, setMounted] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DirectoryResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const searchRequestId = useRef(0);

  const [sortBy, setSortBy] = useState<SortBy>('absence');
  const [detailTarget, setDetailTarget] = useState<StudentRosterRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<StudentRosterRow | null>(null);
  const [removing, setRemoving] = useState(false);
  const [snoozingId, setSnoozingId] = useState<string | null>(null);
  const [dismissedBirthdays, setDismissedBirthdays] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const lastRevalidatedAt = useRef(0);

  const applyRoster = useCallback(
    (next: StudentRosterRow[], connected: boolean) => {
      setRows(next);
      setAttendanceConnected(connected);
      writeRosterCache(leaderId, next, connected);
    },
    [leaderId]
  );

  const revalidate = useCallback(
    async (opts: { force?: boolean } = {}) => {
      if (!opts.force && Date.now() - lastRevalidatedAt.current < REVALIDATE_THROTTLE_MS) return;
      lastRevalidatedAt.current = Date.now();
      try {
        const res = await fetch('/api/student-toolkit/roster/', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          rows?: StudentRosterRow[];
          attendanceConnected?: boolean;
        };
        if (!Array.isArray(data.rows)) return;
        applyRoster(data.rows, data.attendanceConnected !== false);
        setLoadError(null);
      } catch {
        // Offline or a flaky phone connection — the rendered roster still stands.
      }
    },
    [applyRoster]
  );

  useEffect(() => {
    setMounted(true);
    // Seed the cache with the server's fresh render, or fall back to the cached
    // copy when the server read came up empty *and* errored.
    if (initialRows.length > 0 || !initialError) {
      writeRosterCache(leaderId, initialRows, initialAttendanceConnected);
    } else {
      const cached = readRosterCache(leaderId);
      if (cached && cached.rows.length > 0) {
        setRows(cached.rows);
        setAttendanceConnected(cached.attendanceConnected);
      }
    }
    lastRevalidatedAt.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh when the leader comes back to the app — the dates move overnight,
  // and a PWA that's been backgrounded for a week shouldn't show last week's.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') revalidate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [revalidate]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ROSTER_SORT_KEY);
      if (saved === 'absence' || saved === 'firstName' || saved === 'lastName') setSortBy(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BIRTHDAY_DISMISS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      // Drop dismissals whose birthday has already passed.
      const now = new Date();
      const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const fresh: Record<string, string> = {};
      for (const [id, until] of Object.entries(parsed)) {
        if (until >= todayKey) fresh[id] = until;
      }
      setDismissedBirthdays(fresh);
      if (Object.keys(fresh).length !== Object.keys(parsed).length) {
        localStorage.setItem(BIRTHDAY_DISMISS_KEY, JSON.stringify(fresh));
      }
    } catch {}
  }, []);

  // Lock the page behind an open sheet so the list doesn't scroll under it.
  useEffect(() => {
    if (!detailTarget && !removeTarget) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [detailTarget, removeTarget]);

  /* --------------------------------------------------------- add + search */

  useEffect(() => {
    if (!addOpen) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      searchRequestId.current += 1;
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const requestId = searchRequestId.current + 1;
    searchRequestId.current = requestId;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/student-toolkit/roster/search/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        const data = await res.json();
        if (searchRequestId.current === requestId) setSearchResults(data.results || []);
      } catch {
        if (searchRequestId.current === requestId) setSearchResults([]);
      } finally {
        if (searchRequestId.current === requestId) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [addOpen, searchQuery]);

  async function addStudent(candidate: DirectoryResult) {
    if (addingId) return;
    setAddingId(candidate.ccb_individual_id);
    setActionError(null);
    try {
      const res = await fetch('/api/student-toolkit/roster/add/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ccbIndividualId: candidate.ccb_individual_id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.row) {
        setActionError(data.error || 'Could not add that student.');
        return;
      }
      const row = data.row as StudentRosterRow;
      applyRoster(
        rows.some((r) => r.ccb_individual_id === row.ccb_individual_id) ? rows : [...rows, row],
        attendanceConnected
      );
      setSearchResults((prev) =>
        prev.filter((r) => r.ccb_individual_id !== candidate.ccb_individual_id)
      );
      setSearchQuery('');
    } catch {
      setActionError('Could not add that student. Check your connection and try again.');
    } finally {
      setAddingId(null);
    }
  }

  async function performRemove(row: StudentRosterRow) {
    if (removing) return;
    setRemoving(true);
    setActionError(null);
    try {
      const res = await fetch('/api/student-toolkit/roster/remove/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ccbIndividualId: row.ccb_individual_id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error || 'Could not remove that student.');
        return;
      }
      applyRoster(
        rows.filter((r) => r.ccb_individual_id !== row.ccb_individual_id),
        attendanceConnected
      );
      setRemoveTarget(null);
      setDetailTarget(null);
    } catch {
      setActionError('Could not remove that student. Check your connection and try again.');
    } finally {
      setRemoving(false);
    }
  }

  /**
   * Snooze is a server write (the adult toolkit keeps it in localStorage).
   * Student leaders change phones and borrow devices; a snooze that lives in one
   * browser is a snooze that comes back the moment they open the app anywhere
   * else. The server also stores the absence it was set against, so it answers
   * for this run of absences rather than for the student forever.
   */
  async function snooze(target: StudentRosterRow | 'all') {
    const key = target === 'all' ? 'all' : target.ccb_individual_id;
    if (snoozingId) return;
    setSnoozingId(key);
    setActionError(null);
    try {
      const res = await fetch('/api/student-toolkit/roster/snooze/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          target === 'all' ? { all: true } : { ccbIndividualId: target.ccb_individual_id }
        ),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error || 'Could not snooze right now.');
        return;
      }
      const snoozedIds = new Set<string>(data.snoozedIds || []);
      applyRoster(
        rows.map((r) =>
          snoozedIds.has(r.ccb_individual_id) ? { ...r, snoozed_until: data.snoozedUntil } : r
        ),
        attendanceConnected
      );
      setDetailTarget(null);
    } catch {
      setActionError('Could not snooze right now. Check your connection and try again.');
    } finally {
      setSnoozingId(null);
    }
  }

  function dismissBirthday(id: string) {
    const row = rows.find((r) => r.ccb_individual_id === id);
    const b = row ? parseBirthday(row.birthday) : null;
    if (!b) return;
    // Store the date the dismissal expires on, so the cleanup pass on the next
    // mount drops it once the birthday has passed.
    const now = new Date();
    let until = new Date(now.getFullYear(), b.month - 1, b.day);
    if (until.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
      until = new Date(now.getFullYear() + 1, b.month - 1, b.day);
    }
    const untilKey = `${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, '0')}-${String(until.getDate()).padStart(2, '0')}`;
    setDismissedBirthdays((prev) => {
      const next = { ...prev, [id]: untilKey };
      try {
        localStorage.setItem(BIRTHDAY_DISMISS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function updateSort(next: SortBy) {
    setSortBy(next);
    try {
      localStorage.setItem(ROSTER_SORT_KEY, next);
    } catch {}
  }

  /* ------------------------------------------------------------- derived */

  const attendanceByStudent = useMemo(() => {
    const map = new Map<string, Attendance>();
    for (const row of rows) map.set(row.ccb_individual_id, readAttendance(row));
    return map;
  }, [rows]);

  const alerts = useMemo(
    () =>
      rows
        .filter((row) => attendanceByStudent.get(row.ccb_individual_id)?.needsAttention)
        .sort(
          (a, b) =>
            (attendanceByStudent.get(b.ccb_individual_id)?.circleDays ?? 0) -
            (attendanceByStudent.get(a.ccb_individual_id)?.circleDays ?? 0)
        ),
    [rows, attendanceByStudent]
  );

  const upcomingBirthdays = useMemo(() => {
    const out: Array<{ id: string; name: string; daysAway: number; label: string }> = [];
    for (const row of rows) {
      const b = parseBirthday(row.birthday);
      if (!b) continue;
      const daysAway = daysUntilBirthday(b);
      if (daysAway <= 14 && !dismissedBirthdays[row.ccb_individual_id]) {
        out.push({
          id: row.ccb_individual_id,
          name: fullNameOf(row),
          daysAway,
          label: birthdayLabel(b),
        });
      }
    }
    out.sort((a, b) => a.daysAway - b.daysAway);
    return out;
  }, [rows, dismissedBirthdays]);

  const sortedRows = useMemo(() => {
    const list = [...rows];
    if (sortBy === 'firstName') {
      return list.sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''));
    }
    if (sortBy === 'lastName') {
      return list.sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
    }
    // Longest away from circle first — the list is a work queue, not a
    // directory. Students with no record yet sort last: unknown isn't absent.
    return list.sort((a, b) => {
      const aDays = attendanceByStudent.get(a.ccb_individual_id)?.circleDays ?? null;
      const bDays = attendanceByStudent.get(b.ccb_individual_id)?.circleDays ?? null;
      if (aDays === null && bDays === null) return fullNameOf(a).localeCompare(fullNameOf(b));
      if (aDays === null) return 1;
      if (bDays === null) return -1;
      return bDays - aDays;
    });
  }, [rows, sortBy, attendanceByStudent]);

  // A background refresh can drop the student whose sheet is open (removed on
  // another device); read their state instead of assuming it's still there.
  const detailInfo = detailTarget
    ? attendanceByStudent.get(detailTarget.ccb_individual_id) ?? null
    : null;

  /* -------------------------------------------------------------- render */

  return (
    <>
      <main className="max-w-2xl mx-auto px-4 py-4 pb-32 space-y-4">
        {loadError && <div className="cs-alert cs-alert-error">{loadError}</div>}
        {actionError && (
          <div className="cs-alert cs-alert-error" role="alert">
            {actionError}
          </div>
        )}

        {!attendanceConnected && (
          <div className="cs-alert cs-alert-info">
            <div className="font-bold">Attendance isn&apos;t connected yet</div>
            <div className="mt-1 leading-relaxed">
              Student ministry hasn&apos;t handed over the check-in groups for {termLabel}, so
              circle and movement dates are blank — not empty because nobody came. Ask your campus
              student director to get them added. Build your roster now and every date fills in the
              day it&apos;s connected.
            </div>
          </div>
        )}

        {alerts.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-extrabold tracking-tight text-neutral-900">
                  Go after {alerts.length === 1 ? 'them' : `these ${alerts.length}`}
                </h2>
                <div className="text-xs text-neutral-500 mt-0.5">
                  Reach out in GroupMe or in person — student contact info doesn&apos;t live in
                  the toolkit.
                </div>
              </div>
              {alerts.length > 1 && (
                <button
                  type="button"
                  onClick={() => snooze('all')}
                  disabled={snoozingId !== null}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-neutral-400 disabled:opacity-50"
                >
                  <ClockIcon />
                  {snoozingId === 'all' ? 'Snoozing…' : `Snooze all · ${SNOOZE_DURATION_DAYS} days`}
                </button>
              )}
            </div>

            {alerts.map((row) => {
              const info = attendanceByStudent.get(row.ccb_individual_id)!;
              const drifting = info.tone === 'drift';
              const name = fullNameOf(row);
              return (
                <div
                  key={row.ccb_individual_id}
                  className={
                    'rounded-2xl border px-4 py-3 shadow-sm ' +
                    (drifting ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50')
                  }
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none" aria-hidden>
                      {drifting ? '👀' : '🚨'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        className={
                          'text-sm font-bold ' + (drifting ? 'text-amber-900' : 'text-red-900')
                        }
                      >
                        {name} hasn&apos;t been to circle in {info.circleDays} days
                      </div>
                      <div
                        className={
                          'text-xs mt-1 leading-relaxed ' +
                          (drifting ? 'text-amber-800' : 'text-red-800')
                        }
                      >
                        {drifting
                          ? `Still coming to the movement (${agoLabel(info.movementDays ?? 0)}) — they're around, just not in your circle.`
                          : info.movementDays === null
                            ? 'No movement check-in this term either.'
                            : `Not at the movement either — last seen ${agoLabel(info.movementDays)}.`}
                      </div>
                      {row.lastAttendedCircle && (
                        <div
                          className={
                            'text-xs mt-1 ' + (drifting ? 'text-amber-700/80' : 'text-red-700/80')
                          }
                        >
                          Last circle {formatLastAttended(row.lastAttendedCircle)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => snooze(row)}
                      disabled={snoozingId !== null}
                      title={`Hide this alert for ${SNOOZE_DURATION_DAYS} days`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full border border-neutral-300 px-3 py-2 text-xs font-semibold transition-colors hover:border-neutral-400 disabled:opacity-50"
                      style={{ background: '#ffffff' }}
                    >
                      <ClockIcon />
                      {snoozingId === row.ccb_individual_id ? 'Snoozing…' : 'Snooze'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(row)}
                      className="cs-remove-roster-btn inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold shadow-sm transition-colors"
                      style={{ background: '#ffffff' }}
                    >
                      <MinusIcon />
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {upcomingBirthdays.length > 0 && (
          <div className="space-y-2">
            {upcomingBirthdays.map((b) => (
              <div
                key={b.id}
                className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm"
              >
                <span className="text-2xl leading-none" aria-hidden>🎂</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-amber-900">
                    {b.name}&apos;s birthday is{' '}
                    {b.daysAway === 0 ? 'today' : b.daysAway === 1 ? 'tomorrow' : `in ${b.daysAway} days`}
                  </div>
                  <div className="text-xs text-amber-800/80 mt-0.5">{b.label}</div>
                </div>
                <button
                  type="button"
                  onClick={() => dismissBirthday(b.id)}
                  className="shrink-0 -mt-0.5 -mr-1 p-1 text-amber-700/70 hover:text-amber-900"
                  aria-label={`Dismiss ${b.name}'s birthday`}
                >
                  <CloseIcon />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="cs-card">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="cs-step mb-0">
              <span className="cs-step-title">
                {rows.length} {rows.length === 1 ? 'student' : 'students'}
              </span>
            </div>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className={
                  editMode
                    ? 'inline-flex items-center gap-1.5 rounded-full bg-[color:var(--cs-green)] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[color:var(--cs-green-dark)]'
                    : 'inline-flex items-center gap-1.5 rounded-full border border-[color:var(--cs-border)] px-3.5 py-1.5 text-xs font-semibold text-[color:var(--cs-ink-soft)] transition-colors hover:border-[color:var(--cs-green)]'
                }
              >
                {editMode ? <div style={{ color: '#ffffff' }}>Done</div> : 'Edit roster'}
              </button>
            )}
          </div>

          {editMode && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <WarningIcon />
              <span>
                Tap the minus to take someone off your roster. Nothing changes in CCB and their
                check-ins are kept — you can add them back any time.
              </span>
            </div>
          )}

          {rows.length > 1 && (
            <div className="-mt-1 mb-3 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-neutral-500">Sort:</span>
              {([
                ['absence', 'Longest away'],
                ['firstName', 'First name'],
                ['lastName', 'Last name'],
              ] as Array<[SortBy, string]>).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateSort(key)}
                  className={
                    'rounded-full px-2.5 py-1 font-semibold transition-colors ' +
                    (sortBy === key
                      ? 'bg-[color:var(--cs-green)] text-white'
                      : 'border border-[color:var(--cs-border)] text-neutral-600 hover:border-[color:var(--cs-green)]')
                  }
                >
                  {sortBy === key ? <div style={{ color: '#ffffff' }}>{label}</div> : label}
                </button>
              ))}
            </div>
          )}

          {rows.length === 0 ? (
            <div className="py-6 text-center">
              <div className="text-base font-bold text-neutral-900">Start with who&apos;s in your circle</div>
              <div className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-neutral-500">
                Add your students and the toolkit watches their check-ins for you — so the week one
                of them goes quiet, you know before it turns into a month.
              </div>
            </div>
          ) : (
            <ul className="mb-4 space-y-1">
              {sortedRows.map((row) => {
                const info = attendanceByStudent.get(row.ccb_individual_id)!;
                const name = fullNameOf(row);
                const snoozed = isSnoozed(row);
                return (
                  <li
                    key={row.ccb_individual_id}
                    className={
                      editMode
                        ? 'group flex items-start gap-3 rounded-md py-2.5 px-2 -mx-2 transition-colors hover:bg-red-50/60'
                        : 'flex items-start gap-3 border-b border-neutral-100 py-2.5 last:border-b-0'
                    }
                  >
                    {editMode ? (
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(row)}
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-red-300 text-red-500 transition-colors hover:border-red-500 hover:bg-red-500 hover:text-white"
                        aria-label={`Remove ${name} from your roster`}
                      >
                        <MinusIcon color="#ef4444" />
                      </button>
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--cs-bg-soft)] text-xs font-semibold text-[color:var(--cs-green-darker)]">
                        {getInitials(name)}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setDetailTarget(row)}
                      className="min-w-0 flex-1 text-left"
                      aria-label={`Open options for ${name}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-semibold text-neutral-900">{name}</div>
                        {row.grade && (
                          <div className="shrink-0 rounded-full bg-[color:var(--cs-bg-soft)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                            {row.grade}
                          </div>
                        )}
                        {!row.is_active && (
                          <div className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                            Not in group
                          </div>
                        )}
                      </div>

                      {attendanceConnected ? (
                        <div className="mt-1.5 space-y-1">
                          <CircleChip tone={info.tone} row={row} days={info.circleDays} />
                          <MovementNote tone={info.tone} note={info.movementNote} />
                          {snoozed && (
                            <div className="text-[11px] font-semibold text-neutral-400">
                              Snoozed until {formatLastAttended(row.snoozed_until!.slice(0, 10))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-neutral-400">
                          Check-ins start showing once attendance is connected
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!addOpen ? (
            <button type="button" onClick={() => setAddOpen(true)} className="cs-btn cs-btn-outline w-full">
              + Add a student
            </button>
          ) : (
            <div className="space-y-3 rounded-lg border border-[color:var(--cs-border)] bg-[color:var(--cs-bg-soft)] p-4">
              <div className="cs-search-field">
                <label className="cs-search-field-label" htmlFor="st-roster-search">
                  Search students{campus ? ` at ${campus}` : ''}
                </label>
                <input
                  id="st-roster-search"
                  type="text"
                  placeholder="Start typing a name..."
                  className="cs-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
              {searchQuery.trim().length >= 2 && (
                <div className={`cs-search-results-shell${searching ? ' is-searching' : ''}`}>
                  {searchResults.length > 0 ? (
                    <div className="cs-search-results-list">
                      {searchResults.map((result) => {
                        const b = parseBirthday(result.birthday);
                        return (
                          <button
                            key={result.ccb_individual_id}
                            type="button"
                            onClick={() => addStudent(result)}
                            disabled={addingId !== null}
                            className="cs-search-result-item"
                          >
                            <div className="font-semibold text-neutral-900">
                              {result.full_name || 'Unnamed student'}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {[result.grade, b ? birthdayLabel(b) : null].filter(Boolean).join(' • ') ||
                                'On the student list'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="cs-search-results-empty">
                      {searching
                        ? 'Searching...'
                        : `No match${campus ? ` at ${campus}` : ''}. Only students who check in ${campus ? 'there' : 'at your campus'} show up here — ask your director if someone's missing.`}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="cs-btn cs-btn-ghost flex-1"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Student sheet — the adult roster's bottom drawer, minus every way to
          contact a minor. What's left is the full picture plus the two actions a
          leader actually has here. */}
      {mounted && detailTarget && detailInfo && createPortal(
        <StudentSheet
          row={detailTarget}
          info={detailInfo}
          attendanceConnected={attendanceConnected}
          snoozing={snoozingId === detailTarget.ccb_individual_id}
          onSnooze={() => snooze(detailTarget)}
          onRemove={() => {
            setDetailTarget(null);
            setRemoveTarget(detailTarget);
          }}
          onClose={() => setDetailTarget(null)}
        />,
        document.body
      )}

      {mounted && removeTarget && createPortal(
        <div className="cs-sheet-overlay" onClick={() => !removing && setRemoveTarget(null)}>
          <div className="cs-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cs-sheet-handle" />
            <div className="cs-sheet-header">
              <p className="cs-sheet-eyebrow">Remove from roster</p>
              <p className="cs-sheet-phone">{fullNameOf(removeTarget)}</p>
            </div>
            <p className="cs-sheet-body">
              This takes them off your list only. Nothing changes in CCB, and their check-ins keep
              being recorded.
            </p>
            <div className="cs-sheet-note">
              <InfoIcon />
              <span>You can add them back any time they come back around.</span>
            </div>
            <div className="cs-sheet-actions">
              <button
                type="button"
                onClick={() => performRemove(removeTarget)}
                disabled={removing}
                className="cs-sheet-action cs-sheet-action-danger"
                style={{ opacity: removing ? 0.7 : 1 }}
              >
                {/* A div, not a span: the toolkit CSS resets span/p/button color
                    with !important, and only an element it doesn't target can
                    keep the white-on-red label. */}
                <div style={{ color: '#ffffff' }}>{removing ? 'Removing…' : 'Remove from roster'}</div>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setRemoveTarget(null)}
              disabled={removing}
              className="cs-sheet-cancel"
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/* ------------------------------------------------------------ row pieces */

/**
 * The date a leader acts on. Loud when it's overdue, quiet when it isn't —
 * scanning the list top to bottom should surface the work without reading.
 */
function CircleChip({
  tone,
  row,
  days,
}: {
  tone: Tone;
  row: StudentRosterRow;
  days: number | null;
}) {
  // One palette across the whole page: green is fine, amber is drifting (missing
  // from circle but still at the movement), red is gone from both, dashed grey
  // is unknown. A leader learns it once and can then scan the list by color.
  const className =
    'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ' +
    (tone === 'unknown'
      ? 'border border-dashed border-neutral-300 text-neutral-400'
      : tone === 'gone'
        ? 'border border-red-200 bg-red-50 text-red-700'
        : tone === 'drift'
          ? 'border border-amber-200 bg-amber-50 text-amber-800'
          : 'border border-emerald-200 bg-emerald-50 text-emerald-700');

  if (days === null || !row.lastAttendedCircle) {
    return (
      <div className={className}>
        <ClockIcon />
        Circle · no check-in yet
      </div>
    );
  }

  return (
    <div className={className}>
      <ClockIcon />
      Circle · {agoLabel(days)} · {formatLastAttended(row.lastAttendedCircle)}
    </div>
  );
}

/**
 * The second date, always read *against* the first: a student still at the
 * movement is a different problem than one who's gone. Kept to one quiet line
 * so the row stays a row instead of turning into a two-column table.
 */
function MovementNote({ tone, note }: { tone: Tone; note: string }) {
  const className =
    'flex items-center gap-1.5 text-[11px] ' +
    (tone === 'drift'
      ? 'font-semibold text-amber-700'
      : tone === 'gone'
        ? 'text-red-700/80'
        : 'text-neutral-500');
  return (
    <div className={className}>
      <div aria-hidden className="text-neutral-300">
        ↳
      </div>
      {note}
    </div>
  );
}

function StudentSheet({
  row,
  info,
  attendanceConnected,
  snoozing,
  onSnooze,
  onRemove,
  onClose,
}: {
  row: StudentRosterRow;
  info: Attendance;
  attendanceConnected: boolean;
  snoozing: boolean;
  onSnooze: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const birthday = parseBirthday(row.birthday);
  const snoozed = isSnoozed(row);
  return (
    <div className="cs-sheet-overlay" onClick={onClose}>
      <div className="cs-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="cs-sheet-handle" />
        <div className="cs-sheet-header">
          <p className="cs-sheet-eyebrow">
            {[row.grade, birthday ? birthdayLabel(birthday) : null].filter(Boolean).join(' · ') ||
              'Your roster'}
          </p>
          <p className="cs-sheet-phone">{fullNameOf(row)}</p>
        </div>

        {attendanceConnected ? (
          <div className="mb-4 space-y-2">
            <SheetDate
              label="Last at circle"
              iso={row.lastAttendedCircle}
              days={info.circleDays}
              emphasis={info.tone === 'gone' || info.tone === 'drift'}
            />
            <SheetDate
              label="Last at the movement"
              iso={row.lastAttendedMovement}
              days={info.movementDays}
              emphasis={false}
            />
          </div>
        ) : (
          <p className="cs-sheet-body">
            Check-in dates show up here once student ministry connects attendance.
          </p>
        )}

        <div className="cs-sheet-actions">
          {!snoozed && info.tone !== 'ok' && info.tone !== 'unknown' && (
            <button
              type="button"
              onClick={onSnooze}
              disabled={snoozing}
              className="cs-sheet-action cs-sheet-action-secondary"
              style={{ justifyContent: 'center', opacity: snoozing ? 0.7 : 1 }}
            >
              <div>{snoozing ? 'Snoozing…' : `Snooze alerts · ${SNOOZE_DURATION_DAYS} days`}</div>
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="cs-sheet-action cs-sheet-action-secondary"
            style={{ justifyContent: 'center' }}
          >
            <div>Remove from roster</div>
          </button>
        </div>
        <button type="button" onClick={onClose} className="cs-sheet-cancel">
          Close
        </button>
      </div>
    </div>
  );
}

function SheetDate({
  label,
  iso,
  days,
  emphasis,
}: {
  label: string;
  iso: string | null;
  days: number | null;
  emphasis: boolean;
}) {
  return (
    <div
      className={
        'flex items-baseline justify-between gap-3 rounded-xl border px-3 py-2.5 ' +
        (emphasis ? 'border-red-200 bg-red-50' : 'border-neutral-200')
      }
    >
      <div className={'text-xs font-semibold ' + (emphasis ? 'text-red-800' : 'text-neutral-500')}>
        {label}
      </div>
      <div className={'text-sm font-bold ' + (emphasis ? 'text-red-900' : 'text-neutral-900')}>
        {iso && days !== null ? `${formatLastAttended(iso)} · ${agoLabel(days)}` : 'No record'}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- icons */

/**
 * The toolkit CSS resets `button` (and span/p) color with !important, so an icon
 * inside a button inherits grey no matter what Tailwind class it carries. `svg`
 * isn't in that reset, so an inline color on the icon itself is what sticks.
 */
function ClockIcon({ color }: { color?: string } = {}) {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" style={color ? { color } : undefined} aria-hidden>
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 101.06-1.06L10.75 9.69V5z" clipRule="evenodd" />
    </svg>
  );
}

function MinusIcon({ color }: { color?: string } = {}) {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" style={color ? { color } : undefined} aria-hidden>
      <path fillRule="evenodd" d="M4 10a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z" clipRule="evenodd" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden>
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  );
}
